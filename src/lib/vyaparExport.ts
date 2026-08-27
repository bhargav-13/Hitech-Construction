/**
 * Shared export helpers for the Vyapar module: Excel (CSV), a print-ready sheet, and a real
 * branded PDF (jsPDF + autotable — genuine vector text, not a screenshot or a print-dialog).
 */

import { getFirmProfile, DOC_LABEL, type FirmProfile, type Invoice, type InvoiceLine, type Party } from "./vyaparApi";
import { apiRequest, getActiveCompanyId } from "./api";
import type { Company } from "./companyScope";
import { getAmountDecimals } from "./format";
import { gstRate } from "./gstRates";

type Cell = string | number | null | undefined;

let firmProfileCache: FirmProfile | null | undefined;

/**
 * The letterhead to stamp on this document, fetched once per page load.
 *
 * Two records can describe the firm, for historical reasons: the newer per-company record behind
 * Settings ▸ Companies, and the older per-user Vyapar ▸ Settings ▸ Firm Profile. The company record
 * wins field by field, with the legacy profile filling any gap — so books set up before companies
 * existed keep printing exactly as they did, and a second firm only has to be entered in one place.
 *
 * Without this, an R.P. Enterprise invoice printed blank: its name, GSTIN and logo had been entered
 * against the company, and the exporter was still reading the empty legacy profile.
 */
async function getCachedFirmProfile(): Promise<FirmProfile | null> {
  if (firmProfileCache !== undefined) return firmProfileCache;
  const [company, legacy] = await Promise.all([
    apiRequest<Company[]>("/api/v1/companies")
      .then((list) => list.find((c) => c.id === getActiveCompanyId()) ?? null)
      .catch(() => null),
    getFirmProfile().catch(() => null),
  ]);
  const pick = (a: string | null | undefined, b: string | null | undefined) =>
    a && String(a).trim() ? a : (b ?? null);
  firmProfileCache = company
    ? {
        businessName: pick(company.name, legacy?.businessName),
        address: pick(
          [company.address, [company.city, company.state].filter(Boolean).join(", ")]
            .filter((s) => s && String(s).trim())
            .join(", "),
          legacy?.address
        ),
        phone: pick(company.phone, legacy?.phone),
        email: pick(company.email, legacy?.email),
        gstin: pick(company.gstin, legacy?.gstin),
        state: pick(company.state, legacy?.state),
        logoDataUrl: pick(company.logoDataUrl, legacy?.logoDataUrl),
        footerNote: pick(company.footerNote, legacy?.footerNote),
      }
    : legacy;
  return firmProfileCache;
}

/** Call after the firm profile is edited so the next PDF picks up the change immediately. */
export function clearFirmProfileCache() {
  firmProfileCache = undefined;
}

/**
 * A titled block written above the table — who this sheet is about.
 *
 * The PDF and the print-out have always carried the party's name, GSTIN and balance at the top; the
 * spreadsheet dropped straight into the column headers, so an exported ledger arrived with no
 * indication of whose it was. Passing this puts the same identity on the sheet.
 */
export interface SheetHeading {
  title: string;
  /** Label/value pairs, written one per row beneath the title. Blank values are dropped. */
  meta?: [string, Cell][];
}

/** The heading as spreadsheet rows: title, each meta pair, then a blank separator. */
function headingRows(heading: SheetHeading | undefined, width: number): Cell[][] {
  if (!heading) return [];
  const pad = (cells: Cell[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  const rows: Cell[][] = [pad([heading.title])];
  for (const [label, value] of heading.meta ?? []) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    rows.push(pad([label, value]));
  }
  rows.push(pad([]));
  return rows;
}

/** Download rows as a CSV that Excel opens natively. */
export function exportRowsToCsv(filename: string, head: string[], rows: Cell[][], heading?: SheetHeading) {
  const esc = (c: Cell) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [...headingRows(heading, head.length), head, ...rows]
    .map((r) => r.map(esc).join(","))
    .join("\n");
  // The BOM makes Excel read UTF-8 (and ₹) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A rectangle of cells to merge, in the shape SheetJS wants (0-based, inclusive). */
export interface CellMerge {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

/**
 * Download a real .xlsx, optionally with merged cells.
 *
 * CSV has no concept of a merged cell — it is one value per comma, full stop — so a sales register
 * expanded to one row per line item had to repeat the invoice's date, number and party against
 * every one of its items. This writes a genuine spreadsheet instead, where an invoice's own columns
 * span its item rows and read as a single cell.
 *
 * `xlsx` is loaded on demand: it is a large dependency and only this one action needs it.
 */
export async function exportRowsToXlsx(
  filename: string,
  head: string[],
  rows: Cell[][],
  merges: CellMerge[] = [],
  heading?: SheetHeading
) {
  const XLSX = await import("xlsx");
  const above = headingRows(heading, head.length);
  const sheet = XLSX.utils.aoa_to_sheet([...above, head, ...rows]);
  // Everything below the heading block shifts down by that many rows, header row included.
  const offset = above.length;
  const allMerges = merges.map((m) => ({
    s: { r: m.startRow + offset + 1, c: m.startCol },
    e: { r: m.endRow + offset + 1, c: m.endCol },
  }));
  if (above.length) {
    // The title spans the table's full width so it reads as a caption, not a stray cell.
    allMerges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, head.length - 1) } });
    const titleCell = sheet[XLSX.utils.encode_cell({ r: 0, c: 0 })];
    if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };
  }
  if (allMerges.length) sheet["!merges"] = allMerges;
  // Rough auto-width: the widest value in each column, clamped so one long address doesn't
  // push the money columns off the screen.
  // Measured from the table only: the heading's long title would otherwise blow out column A.
  sheet["!cols"] = head.map((h, c) => {
    const widest = rows.reduce((w, r) => Math.max(w, String(r[c] ?? "").length), h.length);
    return { wch: Math.min(42, Math.max(9, widest + 2)) };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Export");
  XLSX.writeFile(book, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

/**
 * Open a clean, print-ready sheet in a new window, letterheaded with the firm's logo and
 * details when a profile has been set up.
 */
export async function printRows(title: string, head: string[], rows: Cell[][], subtitle?: string) {
  const w = window.open("", "_blank", "width=980,height=720");
  if (!w) return;
  const [firm, appLogo] = await Promise.all([getCachedFirmProfile(), getAppLogo()]);
  const esc = (v: Cell) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Same fallback as the PDF letterhead: the product's own mark until a firm logo is uploaded.
  const mark = firm?.logoDataUrl || appLogo;
  const letterhead = firm?.businessName || mark
    ? `<div class="letterhead">
        ${mark ? `<img src="${mark}" alt="" />` : ""}
        <div>
          ${firm?.businessName ? `<div class="biz">${esc(firm.businessName)}</div>` : ""}
          <div class="biz-meta">${[firm?.address, firm?.gstin ? `GSTIN ${firm.gstin}` : null, firm?.phone, firm?.email].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
      </div>`
    : "";
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
<meta charset="utf-8" />
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f172a;margin:32px}
  .letterhead{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #e2e8f0}
  .letterhead img{height:44px;width:44px;object-fit:contain}
  .biz{font-size:15px;font-weight:700}
  .biz-meta{font-size:11px;color:#64748b;margin-top:2px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;font-weight:600}
  td{padding:7px 8px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  td:nth-child(n+4){text-align:right}
  .footer-note{margin-top:16px;font-size:11px;color:#94a3b8}
  @media print{body{margin:12mm} .noprint{display:none}}
</style></head><body>
${letterhead}
<h1>${esc(title)}</h1>
<div class="sub">${esc(subtitle ?? "")}${subtitle ? " · " : ""}Generated ${new Date().toLocaleString("en-IN")}</div>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
${firm?.footerNote ? `<div class="footer-note">${esc(firm.footerNote)}</div>` : ""}
<script>window.onload=()=>window.print()</script>
</body></html>`);
  w.document.close();
}

/** Parse a pasted/uploaded CSV into rows. Handles quoted cells and embedded commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

let appLogoCache: string | null | undefined;

/**
 * The product's own mark, read out of `/public`, used as the letterhead logo when the firm profile
 * has none uploaded. Every invoice was coming out logo-less simply because nobody had been through
 * Settings ▸ Firm Profile to upload one; falling back to the app's logo means a document looks
 * right on day one, and an uploaded logo still wins the moment there is one.
 */
async function getAppLogo(): Promise<string | null> {
  if (appLogoCache !== undefined) return appLogoCache;
  try {
    appLogoCache = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("logo failed to load"));
      img.onload = () => {
        // Downscaled to the same 220px the firm-profile uploader enforces. jsPDF embeds the
        // decoded bitmap, so handing it the full 834×834 source made every invoice a 2 MB file
        // for a logo that prints 38pt tall.
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = "/logo.png";
    });
  } catch {
    appLogoCache = null;
  }
  return appLogoCache;
}

/** Natural pixel size of a data-URL image, needed to draw a logo without distorting it. */
function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("logo failed to load"));
    img.src = dataUrl;
  });
}

/**
 * The first two digits of a GSTIN are the state code (24 = Gujarat, 27 = Maharashtra …). Comparing
 * those is the only reliable read on whether a supply crossed a state border: the place-of-supply
 * field is free text a clerk may leave blank, and the firm profile's `state` is optional and was in
 * practice never filled in — which is exactly why every invoice was printing IGST.
 */
function stateCodeOf(gstin: string | null | undefined): string | null {
  const m = String(gstin ?? "").trim().match(/^(\d{2})/);
  return m ? m[1] : null;
}

/** One rate slab on the invoice's tax summary — a GST invoice has to show the split rate-wise. */
interface TaxBucket {
  percent: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface TaxSplit {
  buckets: TaxBucket[];
  cgst: number;
  sgst: number;
  igst: number;
  /** True when nothing on the document carries a levy — the summary is then not worth printing. */
  empty: boolean;
}

/**
 * Split a document's tax into CGST/SGST (intra-state) or IGST (inter-state), rate by rate.
 *
 * The levy is read off each line's own `taxCode` — `GST@18%` is the intra-state pair, `IGST@18%`
 * the single inter-state levy — because that is precisely what the user picked in the Tax column.
 * Lines saved before the Tax column became a code carry only a bare percentage; those fall back to
 * the supply's geography, comparing GSTIN state codes first and the place-of-supply text second.
 */
function splitTax(lines: InvoiceLine[], firm: FirmProfile | null, party: Party | null | undefined, stateOfSupply: string | null): TaxSplit {
  const firmCode = stateCodeOf(firm?.gstin);
  const partyCode = stateCodeOf(party?.gstin);
  // Both GSTINs present and differing = inter-state, full stop. With one missing, fall back to
  // comparing the place of supply against the firm's own state; if that is unknown too, assume the
  // common case for this business — a Gujarat firm billing within Gujarat.
  const interState =
    firmCode && partyCode
      ? firmCode !== partyCode
      : !!stateOfSupply && !!firm?.state
        ? stateOfSupply.trim().toLowerCase() !== firm.state.trim().toLowerCase()
        : false;

  const byRate = new Map<string, TaxBucket>();
  for (const l of lines) {
    const percent = Number(l.taxPercent) || 0;
    // Derive from the line's own amount rather than a stored taxAmount, which isn't always
    // populated — this keeps the summary exactly consistent with the printed line total.
    const taxable = percent ? l.amount / (1 + percent / 100) : l.amount;
    const tax = l.amount - taxable;
    const kind = gstRate(l.taxCode)?.kind;
    const igst = kind === "IGST" || (kind !== "GST" && interState);
    const key = `${igst ? "I" : "C"}${percent}`;
    const b = byRate.get(key) ?? { percent, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    b.taxable += taxable;
    if (igst) b.igst += tax;
    else {
      b.cgst += tax / 2;
      b.sgst += tax / 2;
    }
    byRate.set(key, b);
  }

  const buckets = [...byRate.values()].filter((b) => b.percent > 0).sort((a, b) => a.percent - b.percent);
  const sum = (pick: (b: TaxBucket) => number) => buckets.reduce((t, b) => t + pick(b), 0);
  return {
    buckets,
    cgst: sum((b) => b.cgst),
    sgst: sum((b) => b.sgst),
    igst: sum((b) => b.igst),
    empty: buckets.length === 0,
  };
}

/**
 * Download a real, selectable-text PDF (not a screenshot). Uses jsPDF + autotable so the file
 * has proper vector text, repeating headers and page numbers — letterheaded with the firm's
 * logo and details from Vyapar Settings ▸ Firm Profile when one has been set up.
 */
export async function downloadPdf(
  title: string,
  head: string[],
  rows: Cell[][],
  opts?: { subtitle?: string; landscape?: boolean; rightAlignFrom?: number }
) {
  const [{ jsPDF }, autoTableMod, firm] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getCachedFirmProfile(),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;

  const doc = new jsPDF({ orientation: opts?.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let headerBottom = 34;
  let textX = margin;

  // ---- Letterhead: logo + business name/GSTIN/address, when a firm profile is set up ----
  if (firm?.logoDataUrl) {
    try {
      const { width, height } = await imageSize(firm.logoDataUrl);
      const logoH = 34;
      const logoW = Math.min(70, logoH * (width / height));
      doc.addImage(firm.logoDataUrl, "PNG", margin, 20, logoW, logoH);
      textX = margin + logoW + 12;
    } catch {
      // A broken logo shouldn't block the export.
    }
  }
  if (firm?.businessName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(firm.businessName, textX, 34);

    const metaLine = [firm.address, firm.gstin ? `GSTIN ${firm.gstin}` : null, firm.phone, firm.email].filter(Boolean).join("  ·  ");
    if (metaLine) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(metaLine, textX, 47, { maxWidth: pageWidth - textX - margin });
    }
    headerBottom = 62;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
    headerBottom += 20;
  }
  doc.setTextColor(0);

  // ---- Document title ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, headerBottom);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const sub = `${opts?.subtitle ? opts.subtitle + "  ·  " : ""}Generated ${new Date().toLocaleString("en-IN")}`;
  doc.text(sub, margin, headerBottom + 16);
  doc.setTextColor(0);

  // jsPDF's built-in fonts have no rupee glyph, so render it as "Rs." in the PDF only.
  const clean = (c: Cell) => String(c ?? "").replace(/₹/g, "Rs.");
  const from = opts?.rightAlignFrom;
  const columnStyles: Record<number, { halign: "right" }> = {};
  if (from != null) for (let i = from; i < head.length; i++) columnStyles[i] = { halign: "right" };

  autoTable(doc, {
    head: [head.map(clean)],
    body: rows.map((r) => r.map(clean)),
    startY: headerBottom + 30,
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: margin, right: margin, bottom: 46 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageH - 34, pageWidth - margin, pageH - 34);
      doc.setFontSize(8);
      doc.setTextColor(150);
      if (firm?.footerNote) doc.text(firm.footerNote, margin, pageH - 20, { maxWidth: pageWidth - margin * 2 - 60 });
      doc.text(`Page ${page}`, pageWidth - margin, pageH - 20, { align: "right" });
      doc.setTextColor(0);
    },
  });

  doc.save(`${title.replace(/[^\w\-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Download one sale/purchase document as a proper invoice PDF — letterhead, bill-to, the line
 * item table and totals — rather than a screenshot of the on-screen list.
 */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigitWords(n: number): string {
  if (n >= 100) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigitWords(n % 100) : "");
  return twoDigitWords(n);
}

/**
 * Indian numbering (lakh/crore) amount-in-words, for the invoice total.
 *
 * Carries paise, as Vyapar does — it prints "… Rupees and Thirty Two Paisa only". Rounding the
 * paise away made the words disagree with the figure beside them on any non-round total.
 */
function amountInWords(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const n = Math.floor(abs);
  const paise = Math.round((abs - n) * 100);

  const parts = [];
  if (n === 0) {
    parts.push("Zero");
  } else {
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const rest = n % 1e3;
    if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
    if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
    if (rest) parts.push(threeDigitWords(rest));
  }

  const tail = paise > 0 ? ` and ${twoDigitWords(paise)} Paisa` : "";
  return `${negative ? "Minus " : ""}Rupees ${parts.join(" ")}${tail} Only`;
}

/**
 * Download one sale/purchase document as a proper GST tax-invoice PDF — bordered header meta,
 * bill-to panel, itemised table with tax split, a boxed totals summary and amount-in-words —
 * built to match how a real printed Vyapar invoice reads, not a plain export sheet.
 */
export async function downloadInvoicePdf(invoice: Invoice, party?: Party | null, items?: { id: number; hsn: string | null }[]) {
  const [{ jsPDF }, autoTableMod, firm] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    getCachedFirmProfile(),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, o: unknown) => void }).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  // Match the books' configured precision rather than rounding to whole rupees — their Vyapar
  // runs 3 decimals, and a printed invoice that disagrees with the ledger is a support call.
  const places = getAmountDecimals();
  // HSN lives on the item master, not on the invoice line, so it's resolved from whatever
  // catalogue the caller had loaded. Absent catalogue simply prints "—".
  const hsnOf = (itemId: number | null) =>
    itemId == null ? null : (items?.find((i) => i.id === itemId)?.hsn ?? null);
  const rs = (n: number) =>
    `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places })}`;
  const gray = (n: number) => doc.setTextColor(n, n, n);
  const setFill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  // ---- The ERP's own palette, so an invoice looks like it came from this product ----
  const NAVY = [14, 42, 71] as const;        // --sidebar-bg
  const NAVY_SOFT = [19, 53, 90] as const;   // --navy-soft
  const CYAN = [8, 145, 178] as const;       // --brand-accent
  const INK = [15, 23, 42] as const;
  const HAIRLINE = [226, 232, 240] as const;

  // ---- Branded header band ----
  const bandH = 92;
  setFill(NAVY);
  doc.rect(0, 0, pageWidth, bandH, "F");
  // A cyan keyline along the bottom of the band, echoing the sidebar's active accent.
  setFill(CYAN);
  doc.rect(0, bandH - 3, pageWidth, 3, "F");

  let textX = margin;
  const logo = firm?.logoDataUrl || (await getAppLogo());
  if (logo) {
    try {
      const { width, height } = await imageSize(logo);
      const logoH = 38;
      const logoW = Math.min(78, logoH * (width / height));
      // White plate behind the logo so dark-on-transparent marks stay legible on navy.
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin - 4, 22, logoW + 8, logoH + 8, 4, 4, "F");
      doc.addImage(logo, "PNG", margin, 26, logoW, logoH);
      textX = margin + logoW + 16;
    } catch {
      // A broken logo shouldn't block the export.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(firm?.businessName ?? "Tax Invoice", textX, 44);
  const metaLine = [firm?.address, firm?.gstin ? `GSTIN ${firm.gstin}` : null, firm?.phone, firm?.email]
    .filter(Boolean)
    .join("   ·   ");
  if (metaLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(186, 214, 235);
    // Wrapped by hand and drawn line by line: `maxWidth` alone wraps the text but jsPDF still
    // anchors every wrapped line at the same y, so a long address printed as a black smudge.
    // Two lines is all the band has room for; the rest is dropped rather than run into the table.
    const metaLines = doc.splitTextToSize(metaLine, pageWidth - textX - margin - 150) as string[];
    metaLines.slice(0, 2).forEach((line, i) => doc.text(line, textX, 56 + i * 10));
  }

  // ---- Document title + number, right-aligned inside the band ----
  const docTitle = (DOC_LABEL[invoice.docType] ?? "Document").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(docTitle, pageWidth - margin, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 228, 245);
  doc.text(`# ${invoice.invoiceNo}`, pageWidth - margin, 60, { align: "right" });

  let y = bandH + 22;

  // ---- Bill To (left) + invoice meta (right), each in a titled panel ----
  const panelTop = y;
  const panelW = contentWidth / 2 - 8;
  const billToX = margin;
  const metaX = margin + panelW + 16;
  const headerH = 20;

  // Panel header strips.
  setFill(NAVY_SOFT);
  doc.rect(billToX, panelTop, panelW, headerH, "F");
  doc.rect(metaX, panelTop, panelW, headerH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("BILL TO", billToX + 10, panelTop + 13.5);
  doc.text("INVOICE DETAILS", metaX + 10, panelTop + 13.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  setText(INK);
  doc.text(party?.name ?? invoice.partyName ?? "Cash", billToX + 10, panelTop + headerH + 18);

  let billLine = panelTop + headerH + 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  gray(90);
  const billDetails = [
    party?.billingAddress ?? invoice.billingAddress,
    [party?.city, party?.state].filter(Boolean).join(", ") || null,
    party?.gstin ? `GSTIN: ${party.gstin}` : null,
    party?.phone ? `Phone: ${party.phone}` : null,
  ].filter(Boolean) as string[];
  for (const d of billDetails) {
    // Same trap as the header band: `maxWidth` wraps but does not advance y, so a two-line address
    // printed on top of the line beneath it. Split first, then advance once per wrapped line.
    for (const line of doc.splitTextToSize(d, panelW - 20) as string[]) {
      doc.text(line, billToX + 10, billLine);
      billLine += 11;
    }
  }

  let metaLine2 = panelTop + headerH + 16;
  doc.setFontSize(9);
  const metaRows: [string, string][] = [
    ["Invoice Date", invoice.invoiceDate ?? "—"],
    ...(invoice.dueDate ? ([["Due Date", invoice.dueDate]] as [string, string][]) : []),
    ...(invoice.stateOfSupply ? ([["Place of Supply", invoice.stateOfSupply]] as [string, string][]) : []),
    ["Payment Type", invoice.isCash || invoice.paidAmount > 0 ? invoice.paymentType : "Credit"],
  ];
  for (const [label, value] of metaRows) {
    doc.setFont("helvetica", "normal");
    gray(110);
    doc.text(label, metaX + 10, metaLine2);
    doc.setFont("helvetica", "bold");
    setText(INK);
    doc.text(value, metaX + panelW - 10, metaLine2, { align: "right" });
    metaLine2 += 14;
  }

  const panelBottom = Math.max(billLine, metaLine2) + 8;
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.setLineWidth(0.75);
  doc.rect(billToX, panelTop, panelW, panelBottom - panelTop);
  doc.rect(metaX, panelTop, panelW, panelBottom - panelTop);
  doc.setTextColor(0);
  y = panelBottom + 20;

  // ---- Line items — taxable value shown separately from the tax charged on it ----
  const tax = splitTax(invoice.lines, firm, party, invoice.stateOfSupply);
  autoTable(doc, {
    // Vyapar's printed item table carries HSN/SAC — a GST invoice is not compliant without it.
    head: [["#", "Item", "HSN/SAC", "Qty", "Rate", "Taxable Value", "Tax", "GST Amt", "Amount"]],
    body: invoice.lines.map((l, i) => {
      // Derive the split from the line's own amount/tax% rather than trust a stored per-line
      // taxAmount — it isn't always populated, and this stays exactly consistent with the total.
      const taxable = l.taxPercent ? l.amount / (1 + l.taxPercent / 100) : l.amount;
      const taxAmt = l.amount - taxable;
      return [
        String(i + 1),
        l.itemName + (l.description ? `\n${l.description}` : ""),
        // The line's own HSN wins; the item master is only a fallback for documents saved
        // before the column existed.
        l.hsn?.trim() || hsnOf(l.itemId) || "—",
        `${l.quantity}${l.unit ? " " + l.unit : ""}`,
        rs(l.rate),
        rs(taxable),
        // Name the levy, not just the rate: "18%" alone doesn't say whether it was one IGST
        // charge or a CGST+SGST pair, and the two file into different GST return columns.
        l.taxPercent ? `${gstRate(l.taxCode)?.kind === "IGST" ? "IGST" : "GST"} ${l.taxPercent}%` : "—",
        taxAmt ? rs(taxAmt) : "—",
        rs(l.amount),
      ];
    }),
    startY: y,
    styles: { fontSize: 8.5, cellPadding: 5, lineColor: [...HAIRLINE], lineWidth: 0.5, valign: "middle" },
    headStyles: { fillColor: [...NAVY], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 251, 253] },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 52, halign: "center" },
      3: { halign: "right", cellWidth: 42 },
      4: { halign: "right", cellWidth: 52 },
      5: { halign: "right", cellWidth: 62 },
      6: { halign: "center", cellWidth: 54 },
      7: { halign: "right", cellWidth: 52 },
      8: { halign: "right", cellWidth: 60 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      gray(150);
      doc.text(`Page ${page}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      doc.setTextColor(0);
    },
  });

  // ---- Rate-wise tax summary — a GST invoice is not compliant without one, and it is what
  //      makes the CGST/SGST split visible instead of one undifferentiated tax figure ----
  let summaryEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (!tax.empty) {
    const interStateDoc = tax.igst > 0 && tax.cgst === 0;
    autoTable(doc, {
      head: [
        interStateDoc
          ? ["Tax Rate", "Taxable Value", "IGST", "Total Tax"]
          : ["Tax Rate", "Taxable Value", "CGST", "SGST", "Total Tax"],
      ],
      body: tax.buckets.map((b) =>
        interStateDoc
          ? [`${b.percent}%`, rs(b.taxable), rs(b.igst), rs(b.igst)]
          : [`${b.percent}%`, rs(b.taxable), rs(b.cgst), rs(b.sgst), rs(b.cgst + b.sgst)]
      ),
      foot: [
        interStateDoc
          ? ["Total", rs(tax.buckets.reduce((t, b) => t + b.taxable, 0)), rs(tax.igst), rs(tax.igst)]
          : [
              "Total",
              rs(tax.buckets.reduce((t, b) => t + b.taxable, 0)),
              rs(tax.cgst),
              rs(tax.sgst),
              rs(tax.cgst + tax.sgst),
            ],
      ],
      startY: summaryEnd + 12,
      // Half-width, left-aligned: the totals box lands to its right, so the two read as a pair.
      tableWidth: contentWidth / 2 + 20,
      styles: { fontSize: 8, cellPadding: 4, lineColor: [...HAIRLINE], lineWidth: 0.5, halign: "right" },
      headStyles: { fillColor: [...NAVY_SOFT], textColor: [255, 255, 255], fontStyle: "bold", halign: "right" },
      footStyles: { fillColor: [240, 250, 253], textColor: [...INK], fontStyle: "bold", halign: "right" },
      columnStyles: { 0: { halign: "left" } },
      margin: { left: margin, right: margin },
    });
    summaryEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // ---- Totals — boxed summary, GST split into CGST/SGST for an intra-state supply ----
  const afterTable = summaryEnd + 14;
  const boxW = 220;
  const boxX = pageWidth - margin - boxW;
  const rowH = 15;
  const taxableAmount = invoice.subTotal;
  const rows: [string, string, boolean][] = [
    ["Taxable Amount", rs(taxableAmount), false],
    ...(invoice.discount > 0 ? ([["Discount", `- ${rs(invoice.discount)}`, false]] as [string, string, boolean][]) : []),
    // Each levy is listed only when it was actually charged, so a mixed document (some lines
    // intra-state, some inter) shows all three rather than being forced into one or the other.
    ...(tax.cgst > 0 ? ([["CGST", rs(tax.cgst), false]] as [string, string, boolean][]) : []),
    ...(tax.sgst > 0 ? ([["SGST", rs(tax.sgst), false]] as [string, string, boolean][]) : []),
    ...(tax.igst > 0 ? ([["IGST", rs(tax.igst), false]] as [string, string, boolean][]) : []),
    ...(invoice.roundOff !== 0 ? ([["Round Off", (invoice.roundOff >= 0 ? "+ " : "- ") + rs(Math.abs(invoice.roundOff)), false]] as [string, string, boolean][]) : []),
  ];
  const grandH = 26;
  const boxH = rowH * rows.length + 16 + grandH + (invoice.paidAmount || invoice.balance ? rowH * 2 : 0);
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.setLineWidth(0.75);
  doc.rect(boxX, afterTable, boxW, boxH);

  let ty = afterTable + 16;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    gray(90);
    doc.text(label, boxX + 12, ty);
    setText(INK);
    doc.text(value, boxX + boxW - 12, ty, { align: "right" });
    ty += rowH;
  }

  // Grand total sits in a navy band so it reads first.
  const grandY = ty - 10;
  setFill(NAVY);
  doc.rect(boxX, grandY, boxW, grandH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(255, 255, 255);
  doc.text("Grand Total", boxX + 12, grandY + 17);
  doc.text(rs(invoice.total), boxX + boxW - 12, grandY + 17, { align: "right" });
  ty = grandY + grandH + 15;
  if (invoice.paidAmount) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    gray(90);
    doc.text(invoice.docType === "PURCHASE" ? "Paid" : "Received", boxX + 12, ty);
    doc.setTextColor(16, 129, 87);
    doc.text(rs(invoice.paidAmount), boxX + boxW - 12, ty, { align: "right" });
    ty += rowH;
  }
  if (invoice.balance > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(190, 40, 40);
    doc.text("Balance Due", boxX + 12, ty);
    doc.text(rs(invoice.balance), boxX + boxW - 12, ty, { align: "right" });
  }
  doc.setTextColor(0);

  // ---- Amount in words, in a tinted callout beside the totals ----
  const wordsW = contentWidth - boxW - 16;
  const wordsY = afterTable;
  doc.setFillColor(240, 250, 253);
  doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
  doc.rect(margin, wordsY, wordsW, 44, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(CYAN);
  doc.text("AMOUNT IN WORDS", margin + 10, wordsY + 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(INK);
  doc.text(amountInWords(invoice.total), margin + 10, wordsY + 30, { maxWidth: wordsW - 20 });

  let noteY = Math.max(afterTable + boxH, wordsY + 44) + 26;

  // ---- Terms (left) + signature block (right) ----
  const sigX = pageWidth - margin - 160;
  if (invoice.terms) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setText(CYAN);
    doc.text("TERMS & CONDITIONS", margin, noteY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    gray(90);
    doc.text(invoice.terms, margin, noteY + 12, { maxWidth: sigX - margin - 20 });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  gray(90);
  doc.text(`For ${firm?.businessName ?? ""}`.trim(), sigX, noteY, { align: "left" });
  doc.setDrawColor(200, 200, 200);
  doc.line(sigX, noteY + 44, pageWidth - margin, noteY + 44);
  doc.setFontSize(8);
  gray(120);
  doc.text("Authorized Signatory", sigX, noteY + 56);
  doc.setTextColor(0);
  noteY += 76;

  if (firm?.footerNote) {
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]);
    doc.setLineWidth(0.75);
    doc.line(margin, noteY - 12, pageWidth - margin, noteY - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    gray(150);
    doc.text(firm.footerNote, margin, noteY, { maxWidth: contentWidth });
  }

  doc.save(`${invoice.invoiceNo || docTitle}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
