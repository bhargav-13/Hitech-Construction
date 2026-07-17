import type { NavItem } from "./types";

// Only Project and Setting are active while features are wired up to the real backend one by
// one. The rest are commented out (not deleted) — uncomment as each feature gets its turn.
export const NAV_ITEMS: NavItem[] = [
  // { label: "Dashboard", href: "/" },
  // { label: "Report", href: "/report" },
  { label: "Project", href: "/project" },
  { label: "Taskopad", href: "/taskopad" },
  // { label: "Team Schedule", href: "/team-schedule" },
  // { label: "Finance", href: "/finance" },
  // { label: "Payroll", href: "/payroll" },
  // { label: "CRM", href: "/crm" },
  // { label: "Procurement", href: "/procurement" },
  // { label: "Warehouse", href: "/warehouse" },
  // { label: "Equipment", href: "/equipment" },
  // { label: "Asset", href: "/asset" },
  // { label: "Library", href: "/library" },
  { label: "Setting", href: "/settings" },
  // { label: "Services", href: "/services" },
];

// Insert a visual gap in the sidebar after these items, matching Onsite's grouping.
export const NAV_BREAK_AFTER = new Set(["Report", "Team Schedule", "Payroll", "Asset", "Setting"]);
