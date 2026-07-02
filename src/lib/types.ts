export type ProjectStatus = "Not Started" | "Ongoing" | "Onhold" | "Completed";
export type ProjectHealth = "Healthy" | "At Risk";

export interface Project {
  id: string;
  name: string;
  category: string;
  keyPersonnel: string;
  status: ProjectStatus;
  health: ProjectHealth;
  startDate: string;
  endDate: string;
  progress: number;
  customerName: string;
  stage: string;
  address: string;
  inAmount: number;
  outAmount: number;
  todoCount: number;
  projectCode: string;
  companyBranch: string;
  attendanceRadius: number;
  projectValue: number;
  orientation: string;
  dimension: string;
  scopeOfWork: string;
}

export interface AttendanceDay {
  date: string;
  workers: number;
}

export interface MaterialReceived {
  name: string;
  quantity: number;
}

export interface FinancialMonth {
  month: string;
  expense: number;
}

export interface NavItem {
  label: string;
  href: string;
}

export interface ScheduleTask {
  id: string;
  code: string;
  name: string;
  assignee: string;
  startMonth: number;
  span: number;
  progress: number;
}

export interface TimesheetEntry {
  id: string;
  party: string;
  date: string;
  task: string;
  hours: number;
  status: "Pending" | "Approved";
}

export type PartyType =
  | "Client"
  | "Material Supplier"
  | "Subcontractor"
  | "Labour Contractor"
  | "Equipment Vendor"
  | "Other Vendor";

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone: string;
  gstin: string;
  rating: number; // 0-5
  toReceive: number; // they owe us
  toPay: number; // we owe them
}

// ---- Unified finance transaction engine (mirrors Onsite's Create Transaction taxonomy) ----
export type TxnCategory = "Payment" | "Sales" | "Expense";

export type TxnType =
  | "Payment In"
  | "Payment Out"
  | "Debit Note"
  | "Credit Note"
  | "Party to Party Payment"
  | "Internal Transfer"
  | "Sales Invoice"
  | "Material Sales"
  | "Material Purchase"
  | "Material Return"
  | "Material Transfer"
  | "Sub Con Bill"
  | "Other Expense"
  | "Equipment Expense";

export type TxnFlow = "in" | "out" | "neutral";

export interface FinanceTransaction {
  id: string;
  type: TxnType;
  category: TxnCategory;
  date: string;
  partyId: string;
  projectId: string;
  amount: number;
  description: string;
  flow: TxnFlow;
  paid: boolean;
}

export type PaymentRequestStatus = "Paid" | "Unpaid";

export interface PaymentRequest {
  id: string;
  number: string; // e.g. "#-30"
  partyId: string;
  projectId: string;
  amount: number;
  against: string; // "Against Labour" | "Against Subcon WO #WO-9" | "Against Petty Cash" | "Against Other"
  status: PaymentRequestStatus;
  date: string;
}

export interface BankAccount {
  id: string;
  name: string;
  type: "Cash" | "Bank";
  accountNo?: string;
  balance: number;
  isPrimary?: boolean;
  acHolder?: string;
  ifsc?: string;
  upi?: string;
  openingBalance?: number;
}

export const TXN_TYPE_META: Record<TxnType, { category: TxnCategory; flow: TxnFlow }> = {
  "Payment In": { category: "Payment", flow: "in" },
  "Payment Out": { category: "Payment", flow: "out" },
  "Debit Note": { category: "Payment", flow: "in" },
  "Credit Note": { category: "Payment", flow: "out" },
  "Party to Party Payment": { category: "Payment", flow: "neutral" },
  "Internal Transfer": { category: "Payment", flow: "neutral" },
  "Sales Invoice": { category: "Sales", flow: "in" },
  "Material Sales": { category: "Sales", flow: "in" },
  "Material Purchase": { category: "Expense", flow: "out" },
  "Material Return": { category: "Expense", flow: "in" },
  "Material Transfer": { category: "Expense", flow: "neutral" },
  "Sub Con Bill": { category: "Expense", flow: "out" },
  "Other Expense": { category: "Expense", flow: "out" },
  "Equipment Expense": { category: "Expense", flow: "out" },
};

export interface FinanceItem {
  id: string;
  name: string;
  unit: string;
  rate: number;
  gstRate: number;
}

export interface InvoiceLine {
  itemId: string;
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
}

export type InvoiceStatus = "Paid" | "Partial" | "Pending" | "Overdue";

export interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  partyId: string;
  projectId: string;
  date: string;
  lines: InvoiceLine[];
  subtotal: number;
  gstAmount: number;
  total: number;
  received: number;
  status: InvoiceStatus;
}

export interface PurchaseEntry {
  id: string;
  billNumber: string;
  partyId: string;
  projectId: string;
  date: string;
  lines: InvoiceLine[];
  subtotal: number;
  gstAmount: number;
  total: number;
}

export type PaymentDirection = "In" | "Out";

export type TodoPriority = "High" | "Medium" | "Low";
export type TodoStatus = "To Do" | "In Progress" | "Done";

export interface TodoTask {
  id: string;
  title: string;
  projectId: string;
  assignee: string;
  priority: TodoPriority;
  dueDate: string;
  status: TodoStatus;
  completion: number;
}

export interface PaymentEntry {
  id: string;
  direction: PaymentDirection;
  partyId: string;
  projectId: string;
  date: string;
  amount: number;
  mode: string;
  note: string;
}

// ---- Warehouse / Inventory ----
// A construction company runs a central store plus per-site stores. Consumable
// materials (diesel, cement) are issued once and used up; Returnable items
// (tools, machines, safety gear) are checked out to a worker/site and later
// brought back — tracked via Checkouts so stock stays accurate.

export type WarehouseType = "Central" | "Site Store";

export interface Warehouse {
  id: string;
  name: string;
  type: WarehouseType;
  projectId?: string; // site stores are tied to a project
  location: string;
  inCharge: string;
  isActive: boolean;
}

export type ItemKind = "Consumable" | "Returnable";

export const ITEM_CATEGORIES = [
  "Fuel",
  "Cement",
  "Aggregate",
  "Steel",
  "Pipes & Fittings",
  "Tools",
  "Safety Equipment",
  "Machinery",
  "Electrical",
  "Other",
] as const;

export const ITEM_UNITS = ["Litre", "Bag", "Cum", "Nos", "Kg", "Mtr", "Set"] as const;

export interface WarehouseItem {
  id: string;
  warehouseId: string;
  name: string;
  category: string;
  kind: ItemKind;
  unit: string;
  openingStock: number;
  reorderLevel: number; // low-stock threshold
  rate: number; // ₹ per unit, for stock valuation
}

export type MovementType = "Received" | "Issued" | "Returned";

export interface StockMovement {
  id: string;
  itemId: string;
  warehouseId: string;
  date: string;
  type: MovementType;
  quantity: number;
  projectId?: string; // site the material went to
  issuedTo?: string; // worker who took a returnable item
  reference: string; // PO no, note, etc.
  checkoutId?: string; // links returnable issues/returns
  requestId?: string; // set when part of a material request
}

export type CheckoutStatus = "Out" | "Partially Returned" | "Returned";

export interface Checkout {
  id: string;
  itemId: string;
  warehouseId: string;
  issuedTo: string;
  projectId?: string;
  qty: number;
  returnedQty: number;
  date: string;
  status: CheckoutStatus;
  requestId?: string; // set when opened via a material request
}

// ---- Users & roles ----
// Static roles for the demo. A Site In-charge raises material requests for
// their site; a Store Keeper receives and dispatches them from a warehouse;
// Admin oversees everything.
export type UserRole = "Admin" | "Site In-charge" | "Store Keeper";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  projectId?: string; // site the in-charge belongs to
  warehouseId?: string; // warehouse the store keeper manages
  phone?: string;
}

// ---- Material request → dispatch → return workflow ----
export type RequestStatus =
  | "Pending"
  | "Dispatched"
  | "Partially Returned"
  | "Closed"
  | "Rejected";

export interface RequestLine {
  itemId: string;
  qty: number; // requested
  issuedQty: number; // dispatched by store keeper
  returnedQty: number; // brought back
}

export interface DispatchInfo {
  workers: string; // people who came to collect
  vehicle: string; // truck / vehicle no.
  driver: string;
  date: string;
}

export interface MaterialRequest {
  id: string;
  number: string; // MR-2026-0001
  projectId: string; // requesting site
  warehouseId: string; // warehouse to fulfil from
  requestedById: string; // user id
  date: string;
  neededBy?: string;
  note?: string;
  status: RequestStatus;
  lines: RequestLine[];
  dispatch?: DispatchInfo;
}

// ---- Notifications ----
export type NotificationKind = "request" | "dispatch" | "return" | "info";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  audience: string[]; // user ids who should see it
  readBy: string[]; // user ids who've read it
  date: string;
  href?: string;
}

export function statusTableLabel(status: ProjectStatus): string {
  switch (status) {
    case "Not Started":
      return "NotStarted";
    case "Onhold":
      return "OnHold";
    case "Completed":
      return "Complete";
    default:
      return status;
  }
}

export function healthTableLabel(health: ProjectHealth): string {
  return health === "Healthy" ? "-" : health;
}
