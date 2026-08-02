import { inr } from "./format";
import type { EmdMode, EmdState, SecurityType, TenderPriority } from "./tenderTypes";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Render an ISO-ish date ("2026-01-27") as "27 Jan 2026". Passes through free-text dates. */
export function tdate(value?: string | null): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value; // some cells hold free text like "29-01-2026 (11:00 AM)"
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** Money that tolerates the seed's occasional string amounts. */
export function tmoney(value?: number | null): string {
  return value == null ? "—" : inr(value);
}

/** Plain text with an em-dash fallback. */
export function tval(value?: string | number | null): string {
  if (value == null || value === "") return "—";
  return String(value);
}

/* ---------- dates ---------- */

/** Today at midnight, so day-difference maths never drifts on the clock. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse an ISO-ish date string to a Date, or null for free text / empty cells. */
export function tparse(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO yyyy-mm-dd for a Date. */
export function tiso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-08" bucket key, for the monthly trend. */
export function tmonthKey(value?: string | null): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(value ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}

/** "2026-08" → "Aug 2026". */
export function tmonthLabel(key: string): string {
  const [y, mo] = key.split("-");
  return `${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** Whole days from today to `value`. Negative = overdue. null for unparseable/empty dates. */
export function tdays(value?: string | null): number | null {
  const d = tparse(value);
  if (!d) return null;
  return Math.round((d.getTime() - today().getTime()) / 86_400_000);
}

/** Add whole months to an ISO date, clamping the day (31 Jan + 1 month → 28/29 Feb). */
export function taddMonths(value: string, months: number): string | null {
  const d = tparse(value);
  if (!d) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return tiso(d);
}

export type DeadlineTone = "overdue" | "urgent" | "soon" | "ok" | "none";

/** Severity of a deadline, for badges. urgent ≤ 2 days, soon ≤ 7. */
export function deadlineTone(value?: string | null): DeadlineTone {
  const n = tdays(value);
  if (n == null) return "none";
  if (n < 0) return "overdue";
  if (n <= 2) return "urgent";
  if (n <= 7) return "soon";
  return "ok";
}

export const DEADLINE_TONE_CLASS: Record<DeadlineTone, string> = {
  overdue: "bg-rose-50 text-rose-700 ring-rose-600/20",
  urgent: "bg-orange-50 text-orange-700 ring-orange-600/20",
  soon: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ok: "bg-gray-100 text-gray-500 ring-gray-500/20",
  none: "bg-gray-50 text-gray-400 ring-gray-200",
};

/** "Overdue 3d" / "2d left" / "—". */
export function deadlineLabel(value?: string | null): string {
  const n = tdays(value);
  if (n == null) return "—";
  if (n < 0) return `Overdue ${Math.abs(n)}d`;
  if (n === 0) return "Due today";
  return `${n}d left`;
}

/* ---------- parsers (shared by the seed generator's TS side, the form and the Excel importer) ---------- */

/** "9 months" | "12 MONTHS" | "1 year" → month count. */
export function parseDurationMonths(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).toLowerCase();
  const n = Number(/(\d+(?:\.\d+)?)/.exec(s)?.[1]);
  if (!Number.isFinite(n)) return null;
  if (s.includes("year")) return Math.round(n * 12);
  if (s.includes("day")) return Math.round(n / 30);
  return Math.round(n);
}

/** "120 days" | "120 DAYS" | 180 → day count. */
export function parseValidityDays(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).toLowerCase();
  const n = Number(/(\d+(?:\.\d+)?)/.exec(s)?.[1]);
  if (!Number.isFinite(n)) return null;
  return s.includes("month") ? Math.round(n * 30) : Math.round(n);
}

/**
 * Split the workbook's EMD TYPE column, which conflated instrument and payment status:
 * "Done" → paid, instrument unknown; "Online"/"D.D."/"F.D.R."/"B.G." → instrument, assumed paid.
 */
export function parseEmdType(value?: string | null): { mode: EmdMode | null; state: EmdState | null } {
  const s = (value ?? "").toUpperCase().replace(/[.\s]/g, "");
  if (!s || s === "-") return { mode: null, state: null };
  if (s.includes("EXEMPT") || s.includes("NIL")) return { mode: "EXEMPT", state: "PAID" };
  if (s.includes("FDR")) return { mode: "FDR", state: "PAID" };
  if (s.includes("BG")) return { mode: "BG", state: "PAID" };
  if (s.includes("DD") || s.includes("DEMANDDRAFT")) return { mode: "DD", state: "PAID" };
  if (s.includes("ONLINE") || s.includes("NEFT") || s.includes("RTGS")) return { mode: "ONLINE", state: "PAID" };
  if (s.includes("DONE") || s.includes("PAID")) return { mode: null, state: "PAID" };
  if (s.includes("PENDING")) return { mode: null, state: "PENDING" };
  return { mode: null, state: null };
}

const SECURITY_TYPE_OF = (s: string): SecurityType | null => {
  const u = s.toUpperCase().replace(/[.\s]/g, "");
  if (u.includes("FDR")) return "FDR";
  if (u.includes("BG") || u.includes("BANKGUARANTEE")) return "BG";
  if (u.includes("CASH") || u.includes("ONLINE")) return "CASH";
  return null;
};

const amountIn = (s: string): number | null => {
  const m = /([\d,]+(?:\.\d+)?)/.exec(s.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface ParsedSecurity {
  securityType: SecurityType | null;
  securityAmount: number | null;
  additionalSecurityType: SecurityType | null;
  additionalSecurityAmount: number | null;
  bgCharges: number | null;
}

/**
 * Pull structure out of the workbook's free-text SECURITY DETAILS blob, e.g.
 * "S.D. Type : F.D.R.\nSecurity : 97,200.00\nAdditional Security : 1,93,144\nBG Charges : 4,120".
 * Anything unrecognised is left null and the raw text stays on `securityDetails`.
 */
export function parseSecurityDetails(value?: string | null): ParsedSecurity {
  const empty: ParsedSecurity = {
    securityType: null,
    securityAmount: null,
    additionalSecurityType: null,
    additionalSecurityAmount: null,
    bgCharges: null,
  };
  if (!value || value.trim() === "-" ) return empty;
  const out = { ...empty };
  // The generator flattens newlines to spaces, so split on the labels themselves.
  const parts = value.split(/(?=S\.?D\.?\s*Type|Security\s*:|Additional|B\.?G\.?\s*Charge)/i);
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (/^S\.?D\.?\s*Type/i.test(p)) out.securityType = SECURITY_TYPE_OF(p);
    else if (/^Additional/i.test(p)) {
      out.additionalSecurityType = SECURITY_TYPE_OF(p);
      out.additionalSecurityAmount = amountIn(p);
    } else if (/^B\.?G\.?\s*Charge/i.test(p)) out.bgCharges = amountIn(p);
    else if (/^Security/i.test(p)) out.securityAmount = amountIn(p);
  }
  return out;
}

/** Normalise the GeM sheet's PRIORITY column — which contains the typo "Meduim". */
export function parsePriority(value?: string | null): TenderPriority | null {
  const s = (value ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith("H")) return "HIGH";
  if (s.startsWith("L")) return "LOW";
  if (s.startsWith("M")) return "MEDIUM"; // covers MEDIUM and the sheet's "MEDUIM"
  return null;
}

/** Lift a date out of free text like "Pre-bid on 12-01-2026 at 11:00 AM" or "2026-01-12 (online)". */
export function parseLooseDate(value?: string | null): string | null {
  if (!value) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(value);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

/** Coerce the many number-ish shapes the workbook holds ("1,00,000", "5,000 / 2%", 5000). */
export function parseAmount(value?: string | number | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const first = String(value).split("/")[0].replace(/[₹,\s]/g, "");
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}
