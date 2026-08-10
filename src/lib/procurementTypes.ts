/**
 * Procurement module — types and demo seed.
 *
 * UI-first, same approach as the Tender and Payroll modules: the store is seeded with realistic
 * data so the whole flow can be demoed before any backend exists. The seed deliberately reuses the
 * real project names and supplier parties from the main app store so Procurement reads as part of
 * one ERP, not a bolted-on island.
 *
 * The chain modelled here: Indent → RFQ → Comparison → Purchase Order (with approval) → Goods
 * Receipt → (hands off to Vyapar for the Purchase Bill). See the procurement design note.
 */

export type Priority = "High" | "Medium" | "Low";

// ---- Indent (Material Requisition) ----
export type IndentStatus = "Open" | "RFQ Raised" | "Ordered" | "Closed";

export interface IndentLine {
  itemName: string;
  unit: string;
  qty: number;
}

export interface Indent {
  id: string;
  number: string;
  project: string;
  site: string;
  requestedBy: string;
  date: string;
  neededBy: string;
  priority: Priority;
  status: IndentStatus;
  lines: IndentLine[];
  note?: string;
}

// ---- RFQ + Quotes ----
export type RfqStatus = "Draft" | "Sent" | "Responses In" | "Awarded" | "Closed";

export interface Quote {
  vendor: string;
  amount: number;
  deliveryDays: number;
  rating: number; // 0–5, vendor track record
  note?: string;
}

export interface Rfq {
  id: string;
  number: string;
  title: string;
  project: string;
  date: string;
  status: RfqStatus;
  indentRef?: string;
  vendorsInvited: number;
  quotes: Quote[];
  awardedVendor?: string;
}

// ---- Purchase Order ----
export type PoStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Partially Received"
  | "Received"
  | "Closed"
  | "Rejected";

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

export interface PoLine {
  itemName: string;
  unit: string;
  qty: number;
  rate: number;
  received: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  date: string;
  vendor: string;
  project: string;
  site: string;
  status: PoStatus;
  approval: ApprovalStatus;
  amount: number;
  lines: PoLine[];
  rfqRef?: string;
  expectedBy?: string;
}

// ---- Goods Receipt Note (GRN) ----
export type GrnStatus = "Received" | "Partial" | "Billed";

export interface GrnLine {
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
}

export interface Grn {
  id: string;
  number: string;
  date: string;
  poRef: string;
  poNumber: string;
  vendor: string;
  project: string;
  status: GrnStatus;
  lines: GrnLine[];
}

// ---- Vendor (mirrors a Vyapar Party of supplier type) ----
export interface Vendor {
  name: string;
  type: string;
  category: string;
  phone: string;
  rating: number;
  orders: number;
}

// ---- Approval threshold rule (Settings) ----
export interface ApprovalRule {
  upto: number | null; // null = no upper bound
  approver: string;
}

// =====================================================================================
//  SEED
// =====================================================================================

export const INDENT_SEED: Indent[] = [
  {
    id: "ind-11", number: "IND-2026-011", project: "Pedak Road (D.I. Pipeline)", site: "Pedak Road, Rajkot",
    requestedBy: "Ketan Bhai Vaghela", date: "05 Aug 2026", neededBy: "12 Aug 2026", priority: "High", status: "Open",
    lines: [
      { itemName: "Cement OPC 53", unit: "Bag", qty: 100 },
      { itemName: "TMT Bar 12mm", unit: "Kg", qty: 500 },
    ],
    note: "For slab casting — chamber tops.",
  },
  {
    id: "ind-10", number: "IND-2026-010", project: "Ishwariya (Gram Panchayat) Amreli", site: "Village Ishwariya, Amreli",
    requestedBy: "Vishwas Bhai Ujjain", date: "03 Aug 2026", neededBy: "09 Aug 2026", priority: "Medium", status: "RFQ Raised",
    lines: [
      { itemName: "Diesel", unit: "Litre", qty: 200 },
      { itemName: "Black Sand (Crushed)", unit: "Cum", qty: 40 },
    ],
  },
  {
    id: "ind-9", number: "IND-2026-009", project: "RMC D.I. Pipeline - Phase 2", site: "Rajkot",
    requestedBy: "Ketan Bhai Vaghela", date: "31 Jul 2026", neededBy: "10 Aug 2026", priority: "High", status: "Ordered",
    lines: [{ itemName: "SFRC Rectangular Pipe", unit: "Nos", qty: 60 }],
  },
  {
    id: "ind-8", number: "IND-2026-008", project: "Morvada (Gram Panchayat) Amreli", site: "Village Morvada, Amreli",
    requestedBy: "Vishwas Bhai Ujjain", date: "28 Jul 2026", neededBy: "03 Aug 2026", priority: "Low", status: "Closed",
    lines: [{ itemName: "Cement OPC 53", unit: "Bag", qty: 80 }],
  },
  {
    id: "ind-7", number: "IND-2026-007", project: "Raydi (Animal Husbandary EPI Center)", site: "Village Rayadi, Rajkot",
    requestedBy: "Vishwas Bhai Ujjain", date: "26 Jul 2026", neededBy: "05 Aug 2026", priority: "Medium", status: "Open",
    lines: [
      { itemName: "Safety Helmet", unit: "Nos", qty: 30 },
      { itemName: "Concrete Vibrator", unit: "Nos", qty: 1 },
    ],
  },
];

export const RFQ_SEED: Rfq[] = [
  {
    id: "rfq-8", number: "RFQ-2026-08", title: "TMT Steel Supply — 500 Kg", project: "Pedak Road (D.I. Pipeline)",
    date: "05 Aug 2026", status: "Responses In", indentRef: "IND-2026-011", vendorsInvited: 3,
    quotes: [
      { vendor: "Shakti Steel Corporation", amount: 31000, deliveryDays: 5, rating: 3 },
      { vendor: "Meghraj Sand & Aggregate", amount: 31800, deliveryDays: 3, rating: 4 },
      { vendor: "National Engineering Works", amount: 30400, deliveryDays: 7, rating: 3, note: "Lowest, but longest lead time." },
    ],
  },
  {
    id: "rfq-7", number: "RFQ-2026-07", title: "Cement OPC 53 — 100 Bag", project: "Pedak Road (D.I. Pipeline)",
    date: "05 Aug 2026", status: "Responses In", indentRef: "IND-2026-011", vendorsInvited: 3,
    quotes: [
      { vendor: "Adarsh Cement Traders", amount: 38000, deliveryDays: 2, rating: 4 },
      { vendor: "Nakoda Cement Products", amount: 37200, deliveryDays: 4, rating: 4 },
      { vendor: "Shivam Hardware Stores", amount: 39000, deliveryDays: 1, rating: 3 },
    ],
  },
  {
    id: "rfq-6", number: "RFQ-2026-06", title: "SFRC Rectangular Pipe — 60 Nos", project: "RMC D.I. Pipeline - Phase 2",
    date: "30 Jul 2026", status: "Awarded", indentRef: "IND-2026-009", vendorsInvited: 2, awardedVendor: "Bharat Pipe Industries",
    quotes: [
      { vendor: "Bharat Pipe Industries", amount: 186000, deliveryDays: 6, rating: 3 },
      { vendor: "Signet Industries Ltd", amount: 192000, deliveryDays: 8, rating: 4 },
    ],
  },
  {
    id: "rfq-5", number: "RFQ-2026-05", title: "Diesel — 200 Litre", project: "Ishwariya (Gram Panchayat) Amreli",
    date: "03 Aug 2026", status: "Sent", indentRef: "IND-2026-010", vendorsInvited: 2, quotes: [],
  },
];

export const PO_SEED: PurchaseOrder[] = [
  {
    id: "po-12", number: "PO-2026-012", date: "31 Jul 2026", vendor: "Bharat Pipe Industries",
    project: "RMC D.I. Pipeline - Phase 2", site: "Rajkot", status: "Pending Approval", approval: "Pending",
    amount: 186000, rfqRef: "RFQ-2026-06", expectedBy: "10 Aug 2026",
    lines: [{ itemName: "SFRC Rectangular Pipe", unit: "Nos", qty: 60, rate: 3100, received: 0 }],
  },
  {
    id: "po-11", number: "PO-2026-011", date: "29 Jul 2026", vendor: "Adarsh Cement Traders",
    project: "Pedak Road (D.I. Pipeline)", site: "Pedak Road, Rajkot", status: "Partially Received", approval: "Approved",
    amount: 38000, rfqRef: "RFQ-2026-07", expectedBy: "06 Aug 2026",
    lines: [{ itemName: "Cement OPC 53", unit: "Bag", qty: 100, rate: 380, received: 60 }],
  },
  {
    id: "po-10", number: "PO-2026-010", date: "28 Jul 2026", vendor: "Shakti Steel Corporation",
    project: "Pedak Road (D.I. Pipeline)", site: "Pedak Road, Rajkot", status: "Approved", approval: "Approved",
    amount: 31000, expectedBy: "05 Aug 2026",
    lines: [{ itemName: "TMT Bar 12mm", unit: "Kg", qty: 500, rate: 62, received: 0 }],
  },
  {
    id: "po-9", number: "PO-2026-009", date: "24 Jul 2026", vendor: "Nakoda Cement Products",
    project: "Morvada (Gram Panchayat) Amreli", site: "Village Morvada, Amreli", status: "Received", approval: "Approved",
    amount: 30000,
    lines: [{ itemName: "Cement OPC 53", unit: "Bag", qty: 80, rate: 375, received: 80 }],
  },
  {
    id: "po-8", number: "PO-2026-008", date: "20 Jul 2026", vendor: "Krishna JCB & Equipment",
    project: "Ishwariya (Gram Panchayat) Amreli", site: "Village Ishwariya, Amreli", status: "Closed", approval: "Approved",
    amount: 18000,
    lines: [{ itemName: "JCB Hire (24 hrs)", unit: "Set", qty: 1, rate: 18000, received: 1 }],
  },
];

export const GRN_SEED: Grn[] = [
  {
    id: "grn-6", number: "GRN-2026-006", date: "04 Aug 2026", poRef: "po-11", poNumber: "PO-2026-011",
    vendor: "Adarsh Cement Traders", project: "Pedak Road (D.I. Pipeline)", status: "Partial",
    lines: [{ itemName: "Cement OPC 53", unit: "Bag", ordered: 100, received: 60 }],
  },
  {
    id: "grn-5", number: "GRN-2026-005", date: "27 Jul 2026", poRef: "po-9", poNumber: "PO-2026-009",
    vendor: "Nakoda Cement Products", project: "Morvada (Gram Panchayat) Amreli", status: "Billed",
    lines: [{ itemName: "Cement OPC 53", unit: "Bag", ordered: 80, received: 80 }],
  },
  {
    id: "grn-4", number: "GRN-2026-004", date: "21 Jul 2026", poRef: "po-8", poNumber: "PO-2026-008",
    vendor: "Krishna JCB & Equipment", project: "Ishwariya (Gram Panchayat) Amreli", status: "Billed",
    lines: [{ itemName: "JCB Hire (24 hrs)", unit: "Set", ordered: 1, received: 1 }],
  },
];

export const VENDOR_SEED: Vendor[] = [
  { name: "Adarsh Cement Traders", type: "Material Supplier", category: "Cement", phone: "98250-11223", rating: 4, orders: 6 },
  { name: "Shakti Steel Corporation", type: "Material Supplier", category: "Steel", phone: "98240-55667", rating: 3, orders: 4 },
  { name: "Meghraj Sand & Aggregate", type: "Material Supplier", category: "Aggregate", phone: "94270-88991", rating: 4, orders: 5 },
  { name: "Bharat Pipe Industries", type: "Material Supplier", category: "Pipes & Fittings", phone: "99040-33445", rating: 3, orders: 2 },
  { name: "Nakoda Cement Products", type: "Material Supplier", category: "Cement", phone: "98795-44556", rating: 4, orders: 3 },
  { name: "Krishna JCB & Equipment", type: "Equipment Vendor", category: "Machinery", phone: "98795-66778", rating: 4, orders: 3 },
  { name: "Mahavir Subcontractors", type: "Subcontractor", category: "Civil Works", phone: "90999-22222", rating: 5, orders: 4 },
];

export const APPROVAL_RULES: ApprovalRule[] = [
  { upto: 50000, approver: "Site In-charge" },
  { upto: 200000, approver: "Project Manager" },
  { upto: null, approver: "Director" },
];
