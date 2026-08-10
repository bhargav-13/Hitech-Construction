/**
 * Money formatting for the whole ERP — single source of truth.
 *
 * The client asked for Indian digit grouping (₹1,12,00,000) everywhere instead of abbreviated
 * forms like "1.12L" / "1.12Cr", so `inr` / `inrNumber` are what every screen should use.
 * Only chart axis ticks fall back to a short form, where a full number physically won't fit.
 */

/** Indian grouping with the rupee symbol — the default for any displayed amount. */
export function inr(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "₹0";
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

/** Indian grouping without the symbol — for places that render ₹ separately. */
export function inrNumber(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

/**
 * Compact Indian form (Cr / L / K) reserved for chart axis ticks, where a fully grouped number
 * would overlap its neighbours. Never use this for a value the user reads as an amount.
 */
export function inrAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/**
 * @deprecated Abbreviated to "1.12L"/"5.00K", which the client rejected as unreadable.
 * Now delegates to {@link inrNumber} so existing call sites render Indian grouping.
 */
export function formatLakh(value: number): string {
  return inrNumber(value);
}

/**
 * Normalize any incoming date to ISO `YYYY-MM-DD`. Vyapar/Excel exports use Indian day-first
 * formats (`31/10/2025`, `31-10-2025`, `31.10.2025`, 2-digit years too); already-ISO values pass
 * through untouched, and anything unrecognisable is returned as-is so nothing is silently dropped.
 * This is what import should store so dates sort, range-filter and display correctly.
 */
export function toIsoDate(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const d = m[1];
    const mo = m[2];
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 70 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return v;
}

/**
 * Render a stored book date as `DD/MM/YYYY`. Accepts ISO (`2025-10-31`) and tolerates legacy rows
 * that were imported before date normalization existed and stored raw `DD/MM/YYYY` — those are
 * shown as-is rather than producing `undefined/undefined/…`.
 */
export function bookDate(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return v;
}
