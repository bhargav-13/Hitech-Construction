import type { NavItem } from "./types";

// Only modules that are actually built are listed here. Everything else stays commented out
// (not deleted) — uncomment as each feature gets its turn.
// Visibility is still permission-gated per user via NAV_MODULE below.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Project", href: "/project" },
  { label: "Taskopad", href: "/taskopad" },
  { label: "Audit", href: "/audit" },
  { label: "Setting", href: "/settings" },
  // --- Not implemented yet ---
  // { label: "Report", href: "/report" },
  // { label: "Team Schedule", href: "/team-schedule" },
  // { label: "Finance", href: "/finance" },
  // { label: "Payroll", href: "/payroll" },
  // { label: "CRM", href: "/crm" },
  // { label: "Procurement", href: "/procurement" },
  // { label: "Warehouse", href: "/warehouse" },
  // { label: "Equipment", href: "/equipment" },
  // { label: "Asset", href: "/asset" },
  // { label: "Library", href: "/library" },
  // { label: "Services", href: "/services" },
];

// Insert a visual gap in the sidebar after these items, matching Onsite's grouping.
export const NAV_BREAK_AFTER = new Set(["Report", "Team Schedule", "Payroll", "Asset", "Audit"]);

// Maps each nav route to its backend module code. A sidebar item is only shown when the signed-in
// user's role carries "<MODULE>:VIEW" — so e.g. a user without DASHBOARD:VIEW never sees Dashboard.
export const NAV_MODULE: Record<string, string> = {
  "/": "DASHBOARD",
  "/report": "REPORT",
  "/project": "PROJECT",
  "/taskopad": "TASKOPAD",
  "/audit": "AUDIT",
  "/team-schedule": "TEAM_SCHEDULE",
  "/finance": "FINANCE",
  "/payroll": "PAYROLL",
  "/crm": "CRM",
  "/procurement": "PROCUREMENT",
  "/warehouse": "WAREHOUSE",
  "/equipment": "EQUIPMENT",
  "/asset": "ASSET",
  "/library": "LIBRARY",
  "/settings": "SETTINGS",
  "/services": "SERVICES",
};
