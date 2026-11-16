/**
 * The GST codes Vyapar offers in a document's Tax column, in Vyapar's own order.
 *
 * Read off the running VyaparApp (Sale → Tax → dropdown) rather than reasoned about, because the
 * order is not tidy: EXEMPTED sits between the 28% and 40% pairs, since the 40% slab was appended
 * after it. Matching the order matters — the client's staff pick these by muscle memory.
 *
 * Why a code and not just a number:
 *  - `GST@18%` is an intra-state supply, split CGST 9% + SGST 9%. `IGST@18%` is inter-state, one
 *    levy of 18%. The money is identical; the GST return columns are not.
 *  - `NONE` and `EXEMPTED` are both 0%. An exempt supply has to be declared on the return; a line
 *    with no tax applied does not.
 *
 * So `percent` drives the arithmetic and `code` records which levy it was.
 */
export interface GstRate {
  /** Stored on the line and shown in the picker, e.g. "GST@18%". */
  code: string;
  percent: number;
  /** IGST = inter-state single levy; GST = intra-state CGST+SGST split; null = no levy. */
  kind: "IGST" | "GST" | "NONE" | "EXEMPTED";
}

const pair = (percent: number): GstRate[] => [
  { code: `IGST@${percent}%`, percent, kind: "IGST" },
  { code: `GST@${percent}%`, percent, kind: "GST" },
];

export const GST_RATES: GstRate[] = [
  { code: "NONE", percent: 0, kind: "NONE" },
  ...pair(0),
  ...pair(0.25),
  ...pair(3),
  ...pair(5),
  ...pair(12),
  ...pair(18),
  ...pair(28),
  { code: "EXEMPTED", percent: 0, kind: "EXEMPTED" },
  ...pair(40),
];

/**
 * What the Tax picker offers by default. The client only bills at 12% and 18% (KAN-114), so the
 * other slabs are kept out of the list — but every code above still computes, so old documents at
 * 5% or 28% keep their tax, and a user can add any other rate back through "Add GST rate".
 */
const PICKER_CODES = ["NONE", "IGST@12%", "GST@12%", "IGST@18%", "GST@18%", "EXEMPTED"];

export const GST_RATE_OPTIONS = PICKER_CODES.map((c) => ({ value: c, label: c }));

const BY_CODE = new Map(GST_RATES.map((r) => [r.code, r]));
const CODE_RE = /^(I?GST)@(\d+(?:\.\d+)?)%$/;

/** The rate behind a code; unknown codes (or a blank) charge nothing. */
export function gstPercent(code: string | null | undefined): number {
  return gstRate(code)?.percent ?? 0;
}

/** Known codes, plus any `GST@x%` / `IGST@x%` a user added themselves. */
export function gstRate(code: string | null | undefined): GstRate | undefined {
  const known = BY_CODE.get(code ?? "");
  if (known) return known;
  const m = CODE_RE.exec(code ?? "");
  if (!m) return undefined;
  return { code: code!, percent: Number(m[2]), kind: m[1] as "GST" | "IGST" };
}

const EXTRA_KEY = "hlt.gst.extraRates";

/** Rates a user added from the picker, remembered in this browser. */
export function extraGstRates(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(EXTRA_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 100) : [];
  } catch {
    return [];
  }
}

/** Remember a user-added rate; returns the intra-state code for it (`GST@x%`). */
export function addGstRate(percent: number): string {
  const p = Math.round(percent * 100) / 100;
  try {
    const next = [...new Set([...extraGstRates(), p])].sort((a, b) => a - b);
    localStorage.setItem(EXTRA_KEY, JSON.stringify(next));
  } catch {
    /* private window — the rate still applies to this line */
  }
  return `GST@${p}%`;
}

/** Picker options: defaults, user-added rates, and the current value even if it is no longer listed. */
export function gstRateOptions(current?: string | null): { value: string; label: string }[] {
  const codes = [...PICKER_CODES];
  for (const p of extraGstRates()) {
    for (const c of [`IGST@${p}%`, `GST@${p}%`]) if (!codes.includes(c)) codes.splice(codes.length - 1, 0, c);
  }
  if (current && !codes.includes(current) && gstRate(current)) codes.push(current);
  return codes.map((c) => ({ value: c, label: c }));
}

/** Ask for a new GST rate (KAN-114: "if user wants to add something user should add this"). */
export function promptGstRate(): string | null {
  const raw = window.prompt("New GST rate (%)", "");
  if (raw == null) return null;
  const p = Number(String(raw).replace("%", "").trim());
  if (!Number.isFinite(p) || p <= 0 || p >= 100) {
    window.alert("Enter a rate between 0 and 100, e.g. 5");
    return null;
  }
  return addGstRate(p);
}

/**
 * The code for a line that only has a number — old rows saved before the Tax column became a code,
 * and catalogue items, which still carry a bare `taxPercent`. Intra-state GST is the right guess:
 * it's what the old picker meant, and it's the common case for a Gujarat firm billing in Gujarat.
 */
export function gstCodeForPercent(percent: number | null | undefined): string {
  const p = Number(percent) || 0;
  if (p === 0) return "NONE";
  // Drop a trailing ".00" so 18 reads as GST@18%, while 0.25 keeps its decimals.
  return gstRate(`GST@${p}%`) ? `GST@${p}%` : "NONE";
}

/**
 * Input-tax-credit claims Vyapar asks for beneath the rate on a purchase line. Sale lines have no
 * ITC concept — you claim credit on what you buy, not on what you sell.
 */
export const ITC_ELIGIBILITY = [
  "Eligible for ITC - Input",
  "Eligible for ITC - Goods",
  "Ineligible as Per Section 17(5)",
  "Ineligible - Other",
] as const;

export const ITC_DEFAULT = ITC_ELIGIBILITY[0];
