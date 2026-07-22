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
