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

export const GST_RATE_OPTIONS = GST_RATES.map((r) => ({ value: r.code, label: r.code }));

const BY_CODE = new Map(GST_RATES.map((r) => [r.code, r]));

/** The rate behind a code; unknown codes (or a blank) charge nothing. */
export function gstPercent(code: string | null | undefined): number {
  return BY_CODE.get(code ?? "")?.percent ?? 0;
}

export function gstRate(code: string | null | undefined): GstRate | undefined {
  return BY_CODE.get(code ?? "");
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
  const label = Number.isInteger(p) ? String(p) : String(p);
  return BY_CODE.has(`GST@${label}%`) ? `GST@${label}%` : "NONE";
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
