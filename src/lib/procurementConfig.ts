/**
 * The Procurement module's structure: the left-rail tree plus the status colour metadata every
 * screen shares. Mirrors the shape of tenderConfig so the two modules read the same.
 *
 * The rail follows the buying chain in flow order:
 *   Indent → RFQ → Comparison → Purchase Order → Goods Receipt → (Vyapar bill)
 */

export interface ProcNavNode {
  label: string;
  href?: string;
  icon?: string;
  /** Section break rendered above this item. */
  section?: string;
  /**
   * Live counter shown on the right of the item:
   *   "indents"   — open indents awaiting sourcing
   *   "rfq"       — RFQs sent, still awaiting quotes
   *   "approvals" — POs pending approval (money about to be committed)
   *   "receiving" — POs part-received, still open
   */
  badge?: "indents" | "rfq" | "approvals" | "receiving";
}

export const PROCUREMENT_NAV: ProcNavNode[] = [
  { label: "Dashboard", href: "/procurement", icon: "home" },

  { label: "Indents", href: "/procurement/indents", icon: "clipboard", section: "Sourcing", badge: "indents" },
  { label: "RFQ", href: "/procurement/rfq", icon: "send", badge: "rfq" },
  { label: "Comparison", href: "/procurement/compare", icon: "scale" },

  { label: "Purchase Orders", href: "/procurement/orders", icon: "file", section: "Ordering", badge: "approvals" },
  { label: "Goods Receipt", href: "/procurement/receipts", icon: "truck", badge: "receiving" },

  { label: "Vendors", href: "/procurement/vendors", icon: "users", section: "Reference" },
  { label: "Settings", href: "/procurement/settings", icon: "settings" },
];

// ---- Shared status → chip class maps (kept here so every screen is consistent) ----

export const INDENT_STATUS_CLS: Record<string, string> = {
  Open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "RFQ Raised": "bg-blue-50 text-blue-700 ring-blue-600/20",
  Ordered: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  Closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const RFQ_STATUS_CLS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600 ring-gray-500/20",
  Sent: "bg-blue-50 text-blue-700 ring-blue-600/20",
  "Responses In": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Awarded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const PO_STATUS_CLS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600 ring-gray-500/20",
  "Pending Approval": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Approved: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  "Partially Received": "bg-violet-50 text-violet-700 ring-violet-600/20",
  Received: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export const APPROVAL_CLS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export const GRN_STATUS_CLS: Record<string, string> = {
  Received: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Partial: "bg-violet-50 text-violet-700 ring-violet-600/20",
  Billed: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
};

export const PRIORITY_CLS: Record<string, string> = {
  High: "bg-rose-50 text-rose-700 ring-rose-600/20",
  Medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Low: "bg-gray-100 text-gray-600 ring-gray-500/20",
};
