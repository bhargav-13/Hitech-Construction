/**
 * Turns the text of a supplier's bill into the fields of a Vyapar document.
 *
 * Pure string work — no DOM, no OCR — so it can be reasoned about (and tested) on its own. The text
 * comes from billOcr.ts as one string per printed row, whether it was read off a PDF's text layer or
 * recognised from a photo.
 *
 * Indian GST bills don't share a layout, so nothing here keys on column positions. Instead each rule
 * leans on something every bill has to print: an HSN code, a quantity × rate that equals the line's
 * amount, a 15-character GSTIN, a "Invoice No." label. Anything it can't find stays null and the
 * form keeps its own default, so a partial read still saves typing rather than inventing values.
 */

export interface ParsedBillLine {
  name: string;
  hsn: string | null;
  quantity: number;
  unit: string | null;
  /** Rate before tax. */
  rate: number;
  taxPercent: number | null;
  /** Taxable amount of the line as printed, when it could be identified. */
  amount: number | null;
}

export interface ParsedBill {
  invoiceNo: string | null;
  /** ISO yyyy-mm-dd. */
  invoiceDate: string | null;
  /** Every GSTIN printed on the bill, in reading order. */
  gstins: string[];
  /** The GSTIN that isn't ours — the counterparty's. */
  partyGstin: string | null;
  /** Best guess at the counterparty's name: the first heading-like line at the top. */
  partyName: string | null;
  lines: ParsedBillLine[];
  total: number | null;
}

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const SLAB = [0, 0.25, 3, 5, 12, 18, 28, 40];
const HALF_SLAB = [0.125, 1.5, 2.5, 6, 9, 14, 20];
const UNITS = new Set([
  "NOS", "NO", "PCS", "PC", "SET", "SETS", "MTR", "MTRS", "M", "RMT", "KG", "KGS", "GM", "LTR", "L",
  "BOX", "BAG", "BAGS", "PKT", "ROLL", "SQM", "SQFT", "SFT", "CUM", "CFT", "TON", "MT", "BRASS", "PAIR", "DOZ", "EA",
]);

/** Words that mark a row as a total / tax / heading line rather than an item. */
const NOT_AN_ITEM = /\b(sub\s*total|grand\s*total|total|round\s*off|cgst|sgst|igst|cess|amount\s+in\s+words|taxable\s+value|bank|ifsc|a\/c|declaration|signatory|terms)\b/i;

/** Headings that sit at the top of a bill but aren't the seller's name. */
const NOT_A_NAME = /(tax\s*invoice|invoice|debit\s*memo|credit\s*memo|cash\s*memo|bill\s+of\s+supply|original|duplicate|triplicate|copy|gstin|gst\s*no|phone|mobile|\bmo\b|\bph\b|e-?mail|www\.|page\s+\d|estimate|quotation|challan|receipt|state\s*code|pan\b)/i;

export function parseBill(rows: string[], ctx: { ownGstin?: string | null } = {}): ParsedBill {
  const lines = rows.map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
  const upper = lines.map((l) => l.toUpperCase());
  const own = (ctx.ownGstin ?? "").trim().toUpperCase();

  const gstins: string[] = [];
  for (const l of upper) for (const m of l.match(GSTIN_RE) ?? []) if (!gstins.includes(m)) gstins.push(m);

  return {
    invoiceNo: findInvoiceNo(lines),
    invoiceDate: findDate(lines),
    gstins,
    partyGstin: gstins.find((g) => g !== own) ?? null,
    partyName: findPartyName(lines),
    lines: lines.map(parseItemRow).filter((x): x is ParsedBillLine => x != null),
    total: findTotal(lines),
  };
}

function findInvoiceNo(lines: string[]): string | null {
  const re = /\b(?:tax\s+)?(?:invoice|inv|bill|memo)\s*(?:no|number|#)\b\.?\s*[:\-.]?\s*(.+)$/i;
  for (const l of lines) {
    const m = l.match(re);
    if (!m) continue;
    // The label often shares its row with a neighbouring column ("Invoice No. : GT/618  Date: …").
    const value = m[1]
      .split(/\s{2,}|\b(?:dated?|state|gstin|place|challan|order|e-?way)\b/i)[0]
      .replace(/^[:\-.\s]+|[:,;\s]+$/g, "")
      .trim();
    if (value && /\d/.test(value) && value.length <= 32) return value;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** dd/mm/yyyy or dd-Mon-yyyy → ISO. Indian bills put the day first. */
function toIso(raw: string): string | null {
  const s = raw.trim();
  let d: number, m: number, y: number;
  const num = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  const word = s.match(/^(\d{1,2})[\s\-.,]*([A-Za-z]{3,9})[\s\-.,]*(\d{2,4})$/);
  if (num) {
    d = +num[1];
    m = +num[2];
    y = +num[3];
  } else if (word) {
    d = +word[1];
    m = MONTHS[word[2].slice(0, 4).toLowerCase()] ?? MONTHS[word[2].slice(0, 3).toLowerCase()] ?? 0;
    y = +word[3];
  } else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const DATE_TOKEN = String.raw`(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-.]*[A-Za-z]{3,9}[\s\-.,]*\d{2,4})`;

function findDate(lines: string[]): string | null {
  // Prefer a date sitting next to an invoice/bill date label; fall back to the first date printed.
  const labelled = new RegExp(String.raw`\b(?:invoice|bill|inv)?\s*date[d]?\b\s*[:\-.]?\s*` + DATE_TOKEN, "i");
  for (const l of lines) {
    const m = l.match(labelled);
    const iso = m && toIso(m[1]);
    if (iso) return iso;
  }
  const any = new RegExp(DATE_TOKEN);
  for (const l of lines) {
    const m = l.match(any);
    const iso = m && toIso(m[1]);
    if (iso) return iso;
  }
  return null;
}

function findPartyName(lines: string[]): string | null {
  for (const l of lines.slice(0, 8)) {
    const letters = (l.match(/[A-Za-z]/g) ?? []).length;
    if (l.length < 3 || l.length > 70 || letters < 3 || letters / l.length < 0.6) continue;
    if (NOT_A_NAME.test(l)) continue;
    return l.replace(/^m\/s\.?\s*/i, "").trim();
  }
  return null;
}

function findTotal(lines: string[]): number | null {
  const re = /\b(grand\s*total|total\s*amount|net\s*amount|invoice\s*total|bill\s*amount|total)\b/i;
  let best: number | null = null;
  for (const l of lines) {
    if (!re.test(l)) continue;
    const nums = (l.match(/\d[\d,]*\.?\d*/g) ?? []).map(num).filter((n): n is number => n != null && n > 0);
    if (nums.length) best = Math.max(best ?? 0, nums[nums.length - 1]);
  }
  return best;
}

function num(tok: string): number | null {
  const clean = tok.replace(/,/g, "").replace(/^₹|^rs\.?/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const hasLetters = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length >= 2;

/** One printed row → one item line, or null when the row isn't an item. */
export function parseItemRow(row: string): ParsedBillLine | null {
  if (NOT_AN_ITEM.test(row)) return null;
  let tokens = row.split(" ").filter(Boolean);
  if (tokens.length < 3) return null;

  // Leading serial number ("1", "12.", "3)").
  if (/^\d{1,3}[.)]?$/.test(tokens[0])) tokens = tokens.slice(1);

  // The HSN/SAC code is the cleanest split between the description and the numbers.
  let hsnAt = -1;
  for (let i = 1; i < tokens.length; i++) {
    // Printed straight after the description — a 4-digit number after the quantity is an amount.
    if (/^\d{4,8}$/.test(tokens[i]) && /[A-Za-z]/.test(tokens[i - 1]) && hasLetters(tokens.slice(0, i).join(" "))) {
      hsnAt = i;
      break;
    }
  }

  let descTokens: string[];
  let rest: string[];
  if (hsnAt > 0) {
    descTokens = tokens.slice(0, hsnAt);
    rest = tokens.slice(hsnAt + 1);
  } else {
    // No HSN column: the description runs to the last word that isn't a unit, so a size inside the
    // name ("OPC 53 Grade") stays in the name instead of being read as the quantity.
    let last = -1;
    tokens.forEach((t, i) => {
      if (/[A-Za-z]/.test(t) && !/%$/.test(t) && !UNITS.has(t.toUpperCase().replace(/\.$/, ""))) last = i;
    });
    descTokens = tokens.slice(0, last + 1);
    rest = tokens.slice(last + 1);
  }

  const name = descTokens.join(" ").replace(/[|]+/g, " ").trim();
  if (!hasLetters(name)) return null;

  const values: number[] = [];
  const percents: number[] = [];
  let unit: string | null = null;
  for (const t of rest) {
    if (/%$/.test(t)) {
      const p = num(t.slice(0, -1));
      if (p != null) percents.push(p);
      continue;
    }
    const n = num(t);
    if (n != null) values.push(n);
    else if (!unit && UNITS.has(t.toUpperCase().replace(/\.$/, ""))) unit = t.toUpperCase().replace(/\.$/, "");
  }
  if (values.length < 2) return null;

  const quantity = values[0];
  if (!(quantity > 0) || quantity > 1e6) return null;

  // quantity × rate = amount is the one identity every bill honours. Where both a tax-paid rate and
  // a taxable rate satisfy it (against the total and the taxable value), the smaller is pre-tax.
  let rate: number | null = null;
  let amount: number | null = null;
  for (let i = 1; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const expected = quantity * values[i];
      if (values[i] > 0 && Math.abs(expected - values[j]) <= Math.max(0.011 * values[j], 0.06)) {
        if (rate == null || values[i] < rate) {
          rate = values[i];
          amount = values[j];
        }
      }
    }
  }
  if (rate == null) {
    // Nothing multiplies out — take the column after quantity as the rate and don't guess an amount.
    rate = values[1];
  }
  if (!(rate > 0)) return null;

  return { name, hsn: hsnAt > 0 ? tokens[hsnAt] : null, quantity, unit, rate, taxPercent: taxOf(percents), amount };
}

/** A printed rate → a GST slab. CGST + SGST halves are added back together. */
function taxOf(percents: number[]): number | null {
  const slab = percents.find((p) => SLAB.includes(p));
  if (slab != null) return slab;
  const half = percents.find((p) => HALF_SLAB.includes(p));
  return half != null ? half * 2 : null;
}

/** GST state codes (the first two digits of a GSTIN) → state name. */
const GST_STATE: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export function stateOfGstin(gstin: string | null | undefined): string | null {
  return gstin ? (GST_STATE[gstin.slice(0, 2)] ?? null) : null;
}
