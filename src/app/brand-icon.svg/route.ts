import { BRAND_NAME, brandInitials } from "@/lib/brand";

// Favicon for white-label builds without their own logo: the brand's initials on the app colour.
// Built once at build time — the brand name is fixed per deployment.
export const dynamic = "force-static";

export function GET() {
  const initials = brandInitials(BRAND_NAME).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0891b2"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="${initials.length > 2 ? 22 : 28}" font-weight="700" fill="#fff">${initials}</text></svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
  });
}
