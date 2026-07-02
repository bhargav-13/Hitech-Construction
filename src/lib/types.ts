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
