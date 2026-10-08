import type { NavItem } from "./types";

// Only modules that are actually built are listed here. Everything else stays commented out
// (not deleted) — uncomment as each feature gets its turn.
// Visibility is still permission-gated per user via NAV_MODULE below.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Tender", href: "/tender" },
  { label: "Project", href: "/project" },
  // Opens straight on the task list; the Taskopad dashboard is one tab away.
  { label: "Taskopad", href: "/taskopad", landing: "/taskopad/tasks", landingFeature: "TASKOPAD_TASKS" },
  { label: "Vyapar", href: "/vyapar" },
  { label: "Procurement", href: "/procurement" },
  { label: "Payroll", href: "/payroll" },
  { label: "Warehouse", href: "/warehouse" },
  { label: "Asset", href: "/asset" },
  { label: "Audit", href: "/audit" },
  // Everyone has an inbox — it only ever shows requests waiting on (or raised by) you.
  { label: "Approvals", href: "/approvals" },
  { label: "Library", href: "/library" },
  { label: "Setting", href: "/settings" },
  // --- Not implemented yet ---
  // { label: "Report", href: "/report" },
  // { label: "Team Schedule", href: "/team-schedule" },
  // { label: "Finance", href: "/finance" },
  // { label: "CRM", href: "/crm" },
  // { label: "Equipment", href: "/equipment" },
  // { label: "Services", href: "/services" },
];

// Insert a visual gap in the sidebar after these items, matching Onsite's grouping.
export const NAV_BREAK_AFTER = new Set(["Report", "Team Schedule", "Payroll", "Asset", "Audit"]);

// Maps each nav route to its backend module code. A sidebar item is only shown when the signed-in
// user's role carries "<MODULE>:VIEW" — so e.g. a user without DASHBOARD:VIEW never sees Dashboard.
export const NAV_MODULE: Record<string, string> = {
  "/": "DASHBOARD",
  "/tender": "TENDER", // Backend defines TENDER:* (V36); nav now gated on TENDER:VIEW.
  "/report": "REPORT",
  "/project": "PROJECT",
  "/taskopad": "TASKOPAD",
  "/vyapar": "VYAPAR",
  "/audit": "AUDIT",
  "/team-schedule": "TEAM_SCHEDULE",
  "/finance": "FINANCE",
  "/payroll": "PAYROLL",
  "/crm": "CRM",
  "/procurement": "PROCUREMENT",
  "/warehouse": "WAREHOUSE",
  "/equipment": "EQUIPMENT",
  "/asset": "ASSET",
  // Switched on/off per role in Roles & Access (V74 granted it to every existing role).
  "/library": "LIBRARY",
  "/settings": "SETTINGS",
  "/services": "SERVICES",
};

/**
 * Where to land after sign-in: Projects, the usual home, when the role can open it — otherwise the
 * first sidebar module it can. Landing everyone on /project sent roles without project access (a
 * Data Analyst with Taskopad and Payroll, say) straight to an "Access is denied" screen.
 */
export function landingPath(permissions: readonly string[] | null | undefined): string {
  const perms = permissions ?? [];
  const canOpen = (href: string) => {
    const code = NAV_MODULE[href];
    return !code || perms.includes(`${code}:VIEW`);
  };
  if (canOpen("/project")) return "/project";
  return NAV_ITEMS.find((item) => item.href !== "/" && canOpen(item.href))?.href ?? "/approvals";
}
