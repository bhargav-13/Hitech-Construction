/**
 * The Vyapar module's structure, transcribed from the real Vyapar desktop app so our ERP is a
 * like-for-like replacement: every document type, the sidebar tree, and the full report catalogue.
 */

export type VyaparDocType =
  | "SALE"
  | "PAYMENT_IN"
  | "SALE_RETURN"
  | "SALE_ORDER"
  | "ESTIMATE"
  | "PROFORMA"
  | "DELIVERY_CHALLAN"
  | "PURCHASE"
  | "PAYMENT_OUT"
  | "PURCHASE_RETURN"
  | "PURCHASE_ORDER"
  | "EXPENSE"
  | "PARTY_TRANSFER";

export interface DocConfig {
  type: VyaparDocType;
  label: string;
  /** Plural page title, e.g. "Sale Invoices". */
  title: string;
  /** Route segment under /vyapar. */
  slug: string;
  /** Keyboard shortcut, matching Vyapar's own (Alt + key). */
  shortcut: string;
  group: "SALE" | "PURCHASE" | "OTHERS";
  /** Invoice-number prefix used when auto-numbering. */
  prefix: string;
  /** Money direction: in = customer owes us, out = we owe supplier. */
  flow: "in" | "out";
  /** Documents that move stock and party balances (estimates/orders don't). */
  posts: boolean;
  /** Whether the document carries line items at all (payments/expenses don't). */
  hasLines: boolean;
}

export const DOC_CONFIGS: DocConfig[] = [
  // ---- Sale ----
  { type: "SALE", label: "Sale Invoice", title: "Sale Invoices", slug: "sale", shortcut: "S", group: "SALE", prefix: "INV", flow: "in", posts: true, hasLines: true },
  { type: "PAYMENT_IN", label: "Payment-In", title: "Payment-In", slug: "payment-in", shortcut: "I", group: "SALE", prefix: "PI", flow: "in", posts: true, hasLines: false },
  { type: "SALE_RETURN", label: "Sale Return / Cr Note", title: "Sale Return / Credit Note", slug: "sale-return", shortcut: "R", group: "SALE", prefix: "CN", flow: "out", posts: true, hasLines: true },
  { type: "SALE_ORDER", label: "Sale Order", title: "Sale Orders", slug: "sale-order", shortcut: "F", group: "SALE", prefix: "SO", flow: "in", posts: false, hasLines: true },
  { type: "ESTIMATE", label: "Estimate / Quotation", title: "Estimate / Quotation", slug: "estimate", shortcut: "M", group: "SALE", prefix: "EST", flow: "in", posts: false, hasLines: true },
  { type: "PROFORMA", label: "Proforma Invoice", title: "Proforma Invoices", slug: "proforma", shortcut: "K", group: "SALE", prefix: "PRO", flow: "in", posts: false, hasLines: true },
  { type: "DELIVERY_CHALLAN", label: "Delivery Challan", title: "Delivery Challans", slug: "delivery-challan", shortcut: "D", group: "SALE", prefix: "DC", flow: "in", posts: false, hasLines: true },
  // ---- Purchase ----
  { type: "PURCHASE", label: "Purchase Bill", title: "Purchase Bills", slug: "purchase", shortcut: "P", group: "PURCHASE", prefix: "PUR", flow: "out", posts: true, hasLines: true },
  { type: "PAYMENT_OUT", label: "Payment-Out", title: "Payment-Out", slug: "payment-out", shortcut: "O", group: "PURCHASE", prefix: "PO", flow: "out", posts: true, hasLines: false },
  { type: "PURCHASE_RETURN", label: "Purchase Return / Dr Note", title: "Purchase Return / Debit Note", slug: "purchase-return", shortcut: "L", group: "PURCHASE", prefix: "DN", flow: "in", posts: true, hasLines: true },
  { type: "PURCHASE_ORDER", label: "Purchase Order", title: "Purchase Orders", slug: "purchase-order", shortcut: "G", group: "PURCHASE", prefix: "PO", flow: "out", posts: false, hasLines: true },
  // ---- Others ----
  { type: "EXPENSE", label: "Expenses", title: "Expenses", slug: "expenses", shortcut: "E", group: "OTHERS", prefix: "EXP", flow: "out", posts: true, hasLines: true },
  { type: "PARTY_TRANSFER", label: "Party To Party Transfer", title: "Party To Party Transfer", slug: "party-transfer", shortcut: "J", group: "OTHERS", prefix: "PTP", flow: "out", posts: true, hasLines: false },
];

export const docBySlug = (slug: string) => DOC_CONFIGS.find((d) => d.slug === slug);
export const docByType = (type: VyaparDocType) => DOC_CONFIGS.find((d) => d.type === type)!;

/** Sidebar tree, mirroring Vyapar's left rail including its nested sections. */
export interface NavNode {
  label: string;
  href?: string;
  icon?: string;
  children?: NavNode[];
  badge?: string;
}

export const VYAPAR_NAV: NavNode[] = [
  { label: "Home", href: "/vyapar", icon: "home" },
  {
    label: "Parties",
    icon: "users",
    children: [
      { label: "Party Details", href: "/vyapar/parties" },
      { label: "Party Groups", href: "/vyapar/parties/groups" },
      { label: "Party Settings", href: "/vyapar/parties/settings" },
    ],
  },
  { label: "Items", href: "/vyapar/items", icon: "boxes" },
  {
    label: "Sale",
    icon: "file",
    children: [
      { label: "Sale Invoices", href: "/vyapar/sale" },
      { label: "Estimate / Quotation", href: "/vyapar/estimate" },
      { label: "Proforma Invoice", href: "/vyapar/proforma" },
      { label: "Payment-In", href: "/vyapar/payment-in" },
      { label: "Sale Order", href: "/vyapar/sale-order" },
      { label: "Delivery Challan", href: "/vyapar/delivery-challan" },
      { label: "Sale Return / Credit Note", href: "/vyapar/sale-return" },
    ],
  },
  {
    label: "Purchase & Expense",
    icon: "cart",
    children: [
      { label: "Purchase Bills", href: "/vyapar/purchase" },
      { label: "Payment-Out", href: "/vyapar/payment-out" },
      { label: "Expenses", href: "/vyapar/expenses" },
      { label: "Purchase Order", href: "/vyapar/purchase-order" },
      { label: "Purchase Return / Dr. Note", href: "/vyapar/purchase-return" },
    ],
  },
  {
    label: "Cash & Bank",
    icon: "bank",
    children: [
      { label: "Bank Accounts", href: "/vyapar/bank" },
      { label: "Cash In Hand", href: "/vyapar/cash" },
      { label: "Cheques", href: "/vyapar/cheques" },
      { label: "Loan Accounts", href: "/vyapar/loans" },
    ],
  },
  { label: "Reports", href: "/vyapar/reports", icon: "chart" },
  {
    label: "Utilities",
    icon: "tool",
    children: [
      { label: "Import Items", href: "/vyapar/utilities/import-items" },
      { label: "Import Parties", href: "/vyapar/utilities/import-parties" },
      { label: "Bulk Update Items", href: "/vyapar/utilities/bulk-items" },
      { label: "Barcode Generator", href: "/vyapar/utilities/barcode" },
    ],
  },
  { label: "Settings", href: "/vyapar/settings", icon: "settings" },
];

/**
 * The report catalogue, grouped as Vyapar groups it.
 *
 * Every entry here renders real data from the books. Reports that would need bookkeeping we don't
 * hold — a double-entry chart of accounts (Trial Balance, Balance Sheet) or TCS deductee/PAN
 * records (Form 27EQ) — are deliberately absent rather than shown as empty or fabricated.
 */
export interface ReportDef {
  id: string;
  title: string;
  group: string;
}

export const VYAPAR_REPORTS: ReportDef[] = [
  // Transaction
  { id: "sale", title: "Sale Report", group: "Transaction" },
  { id: "purchase", title: "Purchase Report", group: "Transaction" },
  { id: "daybook", title: "Day Book", group: "Transaction" },
  { id: "transactions", title: "All Transactions", group: "Transaction" },
  { id: "profit-loss", title: "Profit And Loss", group: "Transaction" },
  { id: "bill-wise-profit", title: "Bill Wise Profit", group: "Transaction" },
  { id: "cash-flow", title: "Cash Flow", group: "Transaction" },
  // Party
  { id: "party", title: "Party Statement", group: "Party" },
  { id: "party-profit", title: "Party wise Profit & Loss", group: "Party" },
  { id: "all-parties", title: "All Parties", group: "Party" },
  { id: "party-by-item", title: "Party Report By Item", group: "Party" },
  { id: "sale-purchase-by-party", title: "Sale Purchase By Party", group: "Party" },
  { id: "sale-purchase-by-group", title: "Sale Purchase By Party Group", group: "Party" },
  // GST
  { id: "gstr1", title: "GSTR-1", group: "GST" },
  { id: "gstr2", title: "GSTR-2", group: "GST" },
  { id: "gstr3b", title: "GSTR-3B", group: "GST" },
  { id: "hsn-summary", title: "Sale Summary By HSN", group: "GST" },
  { id: "sac-report", title: "SAC Report", group: "GST" },
  // Item / Stock
  { id: "stock", title: "Stock Summary", group: "Item / Stock" },
  { id: "item-by-party", title: "Item Report By Party", group: "Item / Stock" },
  { id: "item-profit", title: "Item Wise Profit And Loss", group: "Item / Stock" },
  { id: "item-category-profit", title: "Item Category Wise Profit And Loss", group: "Item / Stock" },
  { id: "low-stock", title: "Low Stock Summary", group: "Item / Stock" },
  { id: "stock-detail", title: "Stock Detail", group: "Item / Stock" },
  { id: "item-detail", title: "Item Detail", group: "Item / Stock" },
  { id: "sale-purchase-by-category", title: "Sale / Purchase Report By Item Category", group: "Item / Stock" },
  { id: "stock-by-category", title: "Stock Summary Report By Item Category", group: "Item / Stock" },
  { id: "item-discount", title: "Item Wise Discount", group: "Item / Stock" },
  // Business status
  { id: "bank-statement", title: "Bank Statement", group: "Business Status" },
  { id: "discount-report", title: "Discount Report", group: "Business Status" },
  // Taxes
  { id: "gst-report", title: "GST Report", group: "Taxes" },
  { id: "gst-rate", title: "GST Rate Report", group: "Taxes" },
];

export const REPORT_GROUPS = [
  "Transaction",
  "Party",
  "GST",
  "Item / Stock",
  "Business Status",
  "Taxes",
] as const;
