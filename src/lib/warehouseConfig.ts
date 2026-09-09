/**
 * The Warehouse module's structure.
 *
 * Seven screens, and the shape is deliberate. The module this replaces had five tabs on one page —
 * Stock, Requests, Warehouses, Movements, Checkouts — which put "set up a store" next to "issue
 * cement" as though they were the same kind of act. They are not: one is done twice a year by an
 * admin, the other forty times a day by a keeper.
 *
 * So the rail separates **what you do daily** (stock, movements, requests) from **what is set up
 * once** (warehouses, access). And receiving, issuing, transferring and returning are not screens
 * at all — they are one action, "record a movement", reached from wherever you are looking at the
 * stock it affects. A separate screen per movement type is four places to teach and four places to
 * get wrong.
 */

export interface WarehouseNavNode {
  label: string;
  href: string;
  icon: string;
  /** Section break rendered above this item. */
  section?: string;
  /**
   * Live counter on the right of the item:
   *   "requests" — requests waiting on a decision
   *   "low"      — items at or below their reorder level
   *   "out"      — returnables still with someone
   */
  badge?: "requests" | "low" | "out";
  hint?: string;
}

export const WAREHOUSE_NAV: WarehouseNavNode[] = [
  { label: "Dashboard", href: "/warehouse", icon: "home" },

  { label: "Stock on hand", href: "/warehouse/stock", icon: "boxes", section: "Stock", badge: "low" },
  { label: "Movements", href: "/warehouse/movements", icon: "arrows", hint: "Every receipt, issue and transfer" },

  {
    label: "Material Requests",
    href: "/warehouse/requests",
    icon: "clipboard",
    section: "Requests",
    badge: "requests",
  },
  { label: "Checkouts", href: "/warehouse/checkouts", icon: "handshake", badge: "out", hint: "Returnables still out" },

  { label: "Warehouses", href: "/warehouse/locations", icon: "warehouse", section: "Setup" },
  { label: "Access", href: "/warehouse/access", icon: "users", hint: "Who may work in which store" },
];

/** Kind → how it reads and looks. Transit is a system store, not somewhere anyone visits. */
export const WAREHOUSE_KIND_META = {
  CENTRAL: { label: "Central store", chip: "bg-cyan-50 text-cyan-700 ring-cyan-600/20" },
  SITE: { label: "Site store", chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  TRANSIT: { label: "In transit", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
} as const;
