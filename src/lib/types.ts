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

export type PartyType = "Client" | "Vendor" | "Subcontractor";

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone: string;
  gstin: string;
}

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
