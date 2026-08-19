/**
 * The Procurement module's structure: the left-rail tree plus the status colour metadata the RFQ
 * and Comparison screens share.
 *
 * The rail is deliberately short. Procurement owns the part of the buying chain Vyapar has no
 * concept of — deciding who to buy from — and links out for everything Vyapar already does
 * properly. Indents, Goods Receipt, a second Purchase Order screen, a duplicate vendor list and a
 * separate approval-limits page all used to live here; each was demo data shadowing something real,
 * so they were removed rather than left to be mistaken for working software.
 *
 *   RFQ → Comparison → award → Vyapar Purchase Order → approval → bill
 */

export interface ProcNavNode {
  label: string;
  href?: string;
  icon?: string;
  /** Section break rendered above this item. */
  section?: string;
  /**
   * Live counter shown on the right of the item:
   *   "rfq" — RFQs sent, still awaiting quotes
   */
  badge?: "rfq";
  /** Leaves the module — rendered with an arrow so it's clear you're being handed off. */
  external?: boolean;
  /** Shown under the label on links that hand off to another module. */
  hint?: string;
}

export const PROCUREMENT_NAV: ProcNavNode[] = [
  { label: "Dashboard", href: "/procurement", icon: "home" },

  { label: "RFQ", href: "/procurement/rfq", icon: "send", section: "Sourcing", badge: "rfq" },
  { label: "Comparison", href: "/procurement/compare", icon: "scale" },

  // Subcontracts. The labour half of buying: same spine as an award, but billed in instalments
  // over months and carrying the material we issue the contractor against his order.
  { label: "Work Orders", href: "/procurement/work-order", icon: "hammer", section: "Subcontract" },

  // These are Vyapar's screens. Procurement links to them rather than keeping its own copy, so
  // there is one purchase order, one vendor list and one set of books.
  {
    label: "Purchase Orders",
    href: "/vyapar/purchase-order",
    icon: "file",
    section: "In Vyapar",
    external: true,
    hint: "Orders, approval and billing",
  },
  { label: "Vendors", href: "/vyapar/parties", icon: "users", external: true, hint: "Parties and balances" },
  { label: "Purchase Bills", href: "/vyapar/purchase", icon: "receipt", external: true, hint: "What was invoiced" },
];

// ---- Shared status → chip class maps ----

export const RFQ_STATUS_CLS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600 ring-gray-500/20",
  Sent: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "Responses In": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Awarded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

/** Work orders move through their own states — a subcontract is approved, then worked, then closed. */
export const WORK_ORDER_STATUS_CLS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600 ring-gray-500/20",
  Approved: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "In Progress": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const PRIORITY_CLS: Record<string, string> = {
  High: "bg-rose-50 text-rose-700 ring-rose-600/20",
  Medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Low: "bg-gray-100 text-gray-600 ring-gray-500/20",
};
