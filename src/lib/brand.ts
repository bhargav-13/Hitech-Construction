/**
 * Product branding, read from build-time env so the same code serves Hi-Tech's own install and
 * white-labelled demo installs.
 *
 * Unset (Hi-Tech production): everything reads exactly as before — name, logo, favicon.
 * Set NEXT_PUBLIC_BRAND_NAME (a demo for another firm): no Hi-Tech name or logo appears anywhere;
 * without NEXT_PUBLIC_BRAND_LOGO the app shows an initials badge and PDFs print with no logo until
 * the company uploads its own in Settings.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so each must be read as a literal
 * `process.env.NEXT_PUBLIC_X` — and changing one in Vercel needs a redeploy.
 */

const envName = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "";
const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO?.trim() || "";

/** True on a white-label build: no Hi-Tech text, logo or test credentials may show. */
export const WHITE_LABEL = envName.length > 0;

export const BRAND_NAME = envName || "Hi-Tech Construction";

/** Product logo (image URL). `null` on a white-label build without its own logo. */
export const BRAND_LOGO: string | null = envLogo || (WHITE_LABEL ? null : "/logo.png");

/** Favicon / notification icon. Never null — falls back to a neutral mark on white-label builds. */
export const BRAND_ICON = envLogo || (WHITE_LABEL ? "/brand-icon.svg" : "/favicon.ico");

/**
 * Vendor credit ("Powered by …") shown on white-label builds only. NEXT_PUBLIC_POWERED_BY
 * overrides the name; set it to "-" to hide the credit.
 */
const envPoweredBy = process.env.NEXT_PUBLIC_POWERED_BY?.trim() || "";
export const POWERED_BY: string | null = !WHITE_LABEL || envPoweredBy === "-" ? null : envPoweredBy || "Codelix IT Solutions";

/** Our product's own name, used where the vendor's product is marketed (the feature tour). */
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "Construction ERP";

/** Two-letter mark for the brand — "Hi-Tech Construction" → "HC", "Acme" → "AC". */
export function brandInitials(name: string = BRAND_NAME): string {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// ---- Trial ----

/**
 * End of the trial (any Date-parsable string, e.g. "2026-12-03T23:59:59+05:30"). Unset = no trial,
 * no banner, no lock — which is how Hi-Tech's own install runs.
 */
const trialRaw = process.env.NEXT_PUBLIC_TRIAL_ENDS_AT?.trim() || "";
const trialMs = trialRaw ? Date.parse(trialRaw) : NaN;
export const TRIAL_ENDS_AT: number | null = Number.isFinite(trialMs) ? trialMs : null;

/** Shown on the banner and the lock screen — a phone number, email or both. */
export const TRIAL_CONTACT = process.env.NEXT_PUBLIC_TRIAL_CONTACT?.trim() || "";

/** WhatsApp number for "Chat on WhatsApp" — digits with country code, e.g. 919876543210. */
export const TRIAL_WHATSAPP = (process.env.NEXT_PUBLIC_TRIAL_WHATSAPP ?? "").replace(/\D/g, "");

/** Email for "Talk to us" (mailto). */
export const TRIAL_EMAIL = process.env.NEXT_PUBLIC_TRIAL_EMAIL?.trim() || "";
