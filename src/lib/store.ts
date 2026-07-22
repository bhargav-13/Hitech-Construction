import { create } from "zustand";
import type {
  AppNotification,
  AttendanceDay,
  BankAccount,
  Checkout,
  DispatchInfo,
  FinanceItem,
  FinanceTransaction,
  FinancialMonth,
  InvoiceLine,
  MaterialReceived,
  MaterialRequest,
  Party,
  PaymentEntry,
  PaymentRequest,
  Project,
  PurchaseEntry,
  RequestStatus,
  SaleInvoice,
  ScheduleTask,
  StockMovement,
  TimesheetEntry,
  TodoTask,
  TxnType,
  User,
  Warehouse,
  WarehouseItem,
} from "./types";
import { TXN_TYPE_META } from "./types";
import { AUTH_STORAGE_KEY } from "./auth";

const RB_DIVISION = "Road and Building Division";

type SeedProject = Omit<
  Project,
  | "id"
  | "progress"
  | "keyPersonnel"
  | "customerName"
  | "projectCode"
  | "companyBranch"
  | "attendanceRadius"
  | "projectValue"
  | "orientation"
  | "dimension"
  | "scopeOfWork"
  | "address"
  | "inAmount"
  | "outAmount"
  | "todoCount"
> &
  Partial<
    Pick<Project, "address" | "inAmount" | "outAmount" | "todoCount">
  >;

const PROJECTS: SeedProject[] = [
  { name: "Construction of CC Road", category: "Directorate Urban Administration and Development", status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "Received LOA", address: "", city: "" },
  { name: "HI-TECH OFFICE", category: "", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "Ishwariya (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Ishwariya, Tal. Kunkavav, Amreli", city: "Amreli" },
  { name: "Jetpur (Fire System)", category: "", status: "Completed", health: "At Risk", startDate: "22-Oct-2024", endDate: "22-Nov-2024", stage: "Completed", address: "Jetpur, Jetpur", city: "Jetpur" },
  { name: "Lakhapadar (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Lakhapadar, Ta. Kunkavav, Amreli", city: "Amreli" },
  { name: "Mayapadar (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Maya padar Tal. Kunkavav, Amreli", city: "Amreli", inAmount: 26 },
  { name: "Morvada (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Morvada, Tal. Kunkavav, Amreli", city: "Amreli" },
  { name: "Navagam (D.I. Pipeline)", category: "", status: "Completed", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "New Jagnathplot (D.I. Pipeline)", category: "", status: "Completed", health: "Healthy", startDate: "17-Feb-2025", endDate: "", stage: "", address: "", city: "" },
  { name: "Old Jagnathplot (D.I. Pipeline)", category: "", status: "Onhold", health: "At Risk", startDate: "17-Feb-2025", endDate: "17-Dec-2026", stage: "", address: "", city: "" },
  { name: "Pedak Road (D.I. Pipeline)", category: "Rajkot Municipal Corporation", status: "Completed", health: "At Risk", startDate: "24-Feb-2025", endDate: "23-Mar-2026", stage: "Final Bill In Progress", address: "", city: "" },
  { name: "Raydi (Animal Husbandary EPI Center)", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "02-Jan-2026", endDate: "02-Jul-2026", stage: "Sample Testing At GERI", address: "Village Rayadim, Ta. Jamkandorana, Rajkot", city: "Rajkot", outAmount: 100000, todoCount: 1 },
  { name: "RMC D.I. Pipeline - Phase 1", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "At Risk", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "RMC D.I. Pipeline - Phase 2", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "RMC D.I. Pipeline - Phase 3", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "Vanthali (Gram Panchayat) at Junagadh", category: RB_DIVISION, status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "Ta. Vanthali, Junagadh", city: "Junagadh" },
  { name: "Trambakpur (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "Amreli" },
  { name: "Vavdi Road Widening", category: "", status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
  { name: "Wankaner Water Supply Scheme", category: "", status: "Completed", health: "Healthy", startDate: "", endDate: "", stage: "", address: "", city: "" },
];

function seedProjects(): Project[] {
  return PROJECTS.map((p, i) => ({
    ...p,
    id: `proj-${i + 1}`,
    keyPersonnel: "",
    customerName: "",
    progress: 0,
    address: p.address ?? "",
    inAmount: p.inAmount ?? 0,
    outAmount: p.outAmount ?? 0,
    todoCount: p.todoCount ?? 0,
    projectCode: "",
    companyBranch: "",
    attendanceRadius: 500,
    projectValue: 0,
    orientation: "",
    dimension: "",
    scopeOfWork: "",
  }));
}

const ATTENDANCE: AttendanceDay[] = [
  { date: "25-Jun-2026", workers: 20 },
  { date: "26-Jun-2026", workers: 20 },
  { date: "27-Jun-2026", workers: 19 },
  { date: "28-Jun-2026", workers: 16 },
  { date: "29-Jun-2026", workers: 18 },
  { date: "30-Jun-2026", workers: 21 },
  { date: "01-Jul-2026", workers: 20 },
];

const MATERIALS: MaterialReceived[] = [
  { name: "Diesel (litre)", quantity: 850 },
  { name: "Black Sand (Crushed)", quantity: 420 },
  { name: "SFRC Rectangular Pipe", quantity: 240 },
  { name: "Diesel (litre)", quantity: 180 },
];

const FINANCIALS: FinancialMonth[] = [
  { month: "Mar 2026", expense: 249000 },
  { month: "Apr 2026", expense: 235000 },
  { month: "May 2026", expense: 290000 },
  { month: "Jun 2026", expense: 3517000 },
  { month: "Jul 2026", expense: 10060 },
];

export const CREW = [
  "Vishwas Bhai Ujjain",
  "Shubham Bhai Ujjain",
  "Mahesh Bhai Chauhan",
  "Ketan Bhai Vaghela",
];

const TASK_TYPES: { name: string; span: number; baseProgress: number }[] = [
  { name: "170 Dia Pipe Laying", span: 5, baseProgress: 15.1 },
  { name: "200 Dia Pipe Laying", span: 4, baseProgress: 1.4 },
  { name: "IC Construction", span: 3, baseProgress: 3.4 },
  { name: "MH Construction", span: 4, baseProgress: 0.8 },
  { name: "Road", span: 5, baseProgress: 7.6 },
  { name: "HSC", span: 4, baseProgress: 6.6 },
  { name: "250 Dia Pipe Laying", span: 4, baseProgress: 7.8 },
];

function seedScheduleTasks(): ScheduleTask[] {
  const tasks: ScheduleTask[] = [];
  CREW.forEach((assignee, crewIndex) => {
    TASK_TYPES.forEach((type, taskIndex) => {
      const progress = Math.min(
        98,
        Math.round((type.baseProgress + crewIndex * 1.3) * 10) / 10
      );
      tasks.push({
        id: `sched-${crewIndex}-${taskIndex}`,
        code: "[DUAD/2026/01]",
        name: type.name,
        assignee,
        startMonth: 1,
        span: type.span,
        progress,
      });
    });
  });
  return tasks;
}

const PARTIES: Omit<Party, "id">[] = [
  { name: "Rajkot Municipal Corporation", type: "Client", phone: "0281-2345678", gstin: "24AAACR1234F1Z5", rating: 5, toReceive: 435000, toPay: 0 },
  { name: "Amreli Gram Panchayat", type: "Client", phone: "02792-223344", gstin: "24AAALG5678H1Z2", rating: 4, toReceive: 128000, toPay: 0 },
  { name: "GERI Testing Labs", type: "Client", phone: "079-26301234", gstin: "24AABCG9012J1Z8", rating: 4, toReceive: 7788, toPay: 0 },
  { name: "Adarsh Cement Traders", type: "Material Supplier", phone: "98250-11223", gstin: "24AAECA3456K1Z1", rating: 4, toReceive: 0, toPay: 97280 },
  { name: "Shakti Steel Corporation", type: "Material Supplier", phone: "98240-55667", gstin: "24AAFCS7890L1Z4", rating: 3, toReceive: 0, toPay: 73160 },
  { name: "Meghraj Sand & Aggregate", type: "Material Supplier", phone: "94270-88991", gstin: "24AAGCS1122M1Z7", rating: 4, toReceive: 0, toPay: 24500 },
  { name: "Bharat Pipe Industries", type: "Material Supplier", phone: "99040-33445", gstin: "24AABCB4455N1Z3", rating: 3, toReceive: 0, toPay: 0 },
  { name: "Dinesh Labour Contractor", type: "Labour Contractor", phone: "90999-11111", gstin: "", rating: 4, toReceive: 0, toPay: 45000 },
  { name: "Mahavir Subcontractors", type: "Subcontractor", phone: "90999-22222", gstin: "24AAHCS7788P1Z9", rating: 5, toReceive: 0, toPay: 62000 },
  { name: "Krishna JCB & Equipment", type: "Equipment Vendor", phone: "98795-66778", gstin: "24AAJCE9900Q1Z1", rating: 4, toReceive: 0, toPay: 18000 },
  { name: "Shivam Hardware Stores", type: "Other Vendor", phone: "94080-22334", gstin: "", rating: 3, toReceive: 0, toPay: 5600 },
];

function seedParties(): Party[] {
  return PARTIES.map((p, i) => ({ ...p, id: `party-${i + 1}` }));
}

const ITEMS: Omit<FinanceItem, "id">[] = [
  { name: "Diesel (litre)", unit: "Litre", rate: 95, gstRate: 18 },
  { name: "Black Sand (Crushed)", unit: "Cum", rate: 1800, gstRate: 5 },
  { name: "SFRC Rectangular Pipe", unit: "Nos", rate: 3200, gstRate: 18 },
  { name: "Cement OPC 53", unit: "Bag", rate: 380, gstRate: 28 },
  { name: "TMT Bar 12mm", unit: "Kg", rate: 62, gstRate: 18 },
  { name: "170 Dia Pipe Laying", unit: "Mtr", rate: 450, gstRate: 18 },
  { name: "Excavation Work", unit: "Cum", rate: 220, gstRate: 18 },
];

function seedItems(): FinanceItem[] {
  return ITEMS.map((it, i) => ({ ...it, id: `item-${i + 1}` }));
}

function lineTotals(lines: InvoiceLine[], items: FinanceItem[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const gstAmount = lines.reduce((sum, l) => {
    const item = items.find((i) => i.id === l.itemId);
    return sum + (l.amount * (item?.gstRate ?? 0)) / 100;
  }, 0);
  return { subtotal, gstAmount, total: Math.round(subtotal + gstAmount) };
}

interface AppState {
  projects: Project[];
  attendance: AttendanceDay[];
  materials: MaterialReceived[];
  financials: FinancialMonth[];
  scheduleTasks: ScheduleTask[];
  timesheets: TimesheetEntry[];
  parties: Party[];
  items: FinanceItem[];
  saleInvoices: SaleInvoice[];
  purchaseEntries: PurchaseEntry[];
  payments: PaymentEntry[];
  todos: TodoTask[];
  transactions: FinanceTransaction[];
  paymentRequests: PaymentRequest[];
  accounts: BankAccount[];
  warehouses: Warehouse[];
  warehouseItems: WarehouseItem[];
  stockMovements: StockMovement[];
  checkouts: Checkout[];
  users: User[];
  currentUserId: string | null;
  materialRequests: MaterialRequest[];
  notifications: AppNotification[];
  addProject: (input: { name: string; address: string; city: string }) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  addTimesheet: (input: Omit<TimesheetEntry, "id" | "status">) => void;
  addParty: (input: Omit<Party, "id">) => Party;
  addItem: (input: Omit<FinanceItem, "id">) => FinanceItem;
  addSaleInvoice: (input: {
    partyId: string;
    projectId: string;
    date: string;
    lines: { itemId: string; qty: number }[];
    received?: number;
  }) => SaleInvoice;
  addTodo: (input: Omit<TodoTask, "id">) => TodoTask;
  updateTodo: (id: string, updates: Partial<TodoTask>) => void;
  deleteTodo: (id: string) => void;
  addPurchaseEntry: (input: {
    partyId: string;
    projectId: string;
    date: string;
    lines: { itemId: string; qty: number }[];
  }) => PurchaseEntry;
  addPayment: (input: Omit<PaymentEntry, "id">) => PaymentEntry;
  addTransaction: (input: {
    type: TxnType;
    date: string;
    partyId: string;
    projectId: string;
    amount: number;
    description: string;
    paid?: boolean;
  }) => FinanceTransaction;
  addPaymentRequest: (input: Omit<PaymentRequest, "id" | "number" | "status">) => PaymentRequest;
  addBankAccount: (input: Omit<BankAccount, "id">) => BankAccount;
  addWarehouse: (input: Omit<Warehouse, "id">) => Warehouse;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => void;
  addWarehouseItem: (input: Omit<WarehouseItem, "id">) => WarehouseItem;
  receiveStock: (input: { itemId: string; quantity: number; date: string; reference: string }) => void;
  issueStock: (input: {
    itemId: string;
    quantity: number;
    date: string;
    projectId?: string;
    issuedTo?: string;
    reference: string;
    requestId?: string;
  }) => void;
  returnCheckout: (checkoutId: string, quantity: number, date: string) => void;
  login: (userId: string) => void;
  logout: () => void;
  rehydrateAuth: (userId: string) => void;
  addMaterialRequest: (input: {
    projectId: string;
    warehouseId: string;
    requestedById: string;
    date: string;
    neededBy?: string;
    note?: string;
    lines: { itemId: string; qty: number }[];
  }) => MaterialRequest;
  fulfillMaterialRequest: (
    requestId: string,
    input: {
      dispatch: DispatchInfo;
      issued: { itemId: string; qty: number }[];
    }
  ) => void;
  returnMaterialRequest: (
    requestId: string,
    input: { date: string; returns: { itemId: string; qty: number }[] }
  ) => void;
  markNotificationRead: (id: string, userId: string) => void;
  markAllNotificationsRead: (userId: string) => void;
}

const SEED_INVOICES: SaleInvoice[] = [
  {
    id: "inv-1",
    invoiceNumber: "INV-2026-0001",
    partyId: "party-1",
    projectId: "proj-11",
    date: "24-Feb-2026",
    lines: [{ itemId: "item-6", itemName: "170 Dia Pipe Laying", qty: 50, rate: 450, amount: 22500 }],
    subtotal: 22500,
    gstAmount: 4050,
    total: 26550,
    received: 26550,
    status: "Paid",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-2026-0002",
    partyId: "party-3",
    projectId: "proj-12",
    date: "15-Mar-2026",
    lines: [{ itemId: "item-7", itemName: "Excavation Work", qty: 30, rate: 220, amount: 6600 }],
    subtotal: 6600,
    gstAmount: 1188,
    total: 7788,
    received: 0,
    status: "Pending",
  },
];

const SEED_TODOS: TodoTask[] = [
  { id: "todo-1", title: "Follow up land clearance - Ishwariya", projectId: "proj-3", assignee: "Vishwas Bhai Ujjain", priority: "High", dueDate: "05-Jul-2026", status: "In Progress", completion: 40 },
  { id: "todo-2", title: "Submit sample to GERI lab", projectId: "proj-12", assignee: "Shubham Bhai Ujjain", priority: "High", dueDate: "04-Jul-2026", status: "To Do", completion: 0 },
  { id: "todo-3", title: "Collect final bill documents - Pedak Road", projectId: "proj-11", assignee: "Mahesh Bhai Chauhan", priority: "Medium", dueDate: "10-Jul-2026", status: "To Do", completion: 0 },
  { id: "todo-4", title: "Diesel stock reorder for site store", projectId: "proj-5", assignee: "Ketan Bhai Vaghela", priority: "Low", dueDate: "08-Jul-2026", status: "Done", completion: 100 },
];

const SEED_PURCHASES: PurchaseEntry[] = [
  {
    id: "pur-1",
    billNumber: "PUR-2026-0001",
    partyId: "party-4",
    projectId: "proj-3",
    date: "10-Feb-2026",
    lines: [{ itemId: "item-4", itemName: "Cement OPC 53", qty: 200, rate: 380, amount: 76000 }],
    subtotal: 76000,
    gstAmount: 21280,
    total: 97280,
  },
  {
    id: "pur-2",
    billNumber: "PUR-2026-0002",
    partyId: "party-5",
    projectId: "proj-5",
    date: "20-Feb-2026",
    lines: [{ itemId: "item-5", itemName: "TMT Bar 12mm", qty: 1000, rate: 62, amount: 62000 }],
    subtotal: 62000,
    gstAmount: 11160,
    total: 73160,
  },
];

const SEED_PAYMENTS: PaymentEntry[] = [
  { id: "pay-1", direction: "In", partyId: "party-1", projectId: "proj-11", date: "24-Feb-2026", amount: 26550, mode: "Bank Transfer", note: "Invoice INV-2026-0001 payment" },
  { id: "pay-2", direction: "Out", partyId: "party-4", projectId: "proj-3", date: "12-Feb-2026", amount: 97280, mode: "Cheque", note: "Cement bill payment" },
  { id: "pay-3", direction: "Out", partyId: "party-6", projectId: "proj-12", date: "05-Jul-2026", amount: 15000, mode: "Cash", note: "Advance to subcontractor" },
];

function txn(
  id: string,
  type: TxnType,
  date: string,
  partyId: string,
  projectId: string,
  amount: number,
  description: string,
  paid: boolean
): FinanceTransaction {
  return { id, type, ...TXN_TYPE_META[type], date, partyId, projectId, amount, description, paid };
}

const SEED_TRANSACTIONS: FinanceTransaction[] = [
  txn("t-1", "Sales Invoice", "24-Feb-2026", "party-1", "proj-11", 26550, "170 Dia Pipe Laying - Milestone 1", true),
  txn("t-2", "Sales Invoice", "15-Mar-2026", "party-3", "proj-12", 7788, "Excavation Work - Part billing", false),
  txn("t-3", "Payment In", "24-Feb-2026", "party-1", "proj-11", 26550, "Against INV-2026-0001", true),
  txn("t-4", "Material Purchase", "10-Feb-2026", "party-4", "proj-3", 97280, "Cement OPC 53 x 200 Bag", false),
  txn("t-5", "Material Purchase", "20-Feb-2026", "party-5", "proj-5", 73160, "TMT Bar 12mm x 1000 Kg", false),
  txn("t-6", "Payment Out", "12-Feb-2026", "party-4", "proj-3", 97280, "Cement bill settlement", true),
  txn("t-7", "Sub Con Bill", "28-Jun-2026", "party-9", "proj-12", 62000, "Boundary wall subcontract", false),
  txn("t-8", "Equipment Expense", "01-Jul-2026", "party-10", "proj-3", 18000, "JCB - 24 hrs @ Clock basis", false),
  txn("t-9", "Other Expense", "10-Jun-2026", "party-11", "proj-1", 5600, "Site hardware & consumables", true),
  txn("t-10", "Material Transfer", "02-Jul-2026", "party-4", "proj-12", 30000, "Transfer to Sewerage Zone 8 site", true),
];

const SEED_PAYMENT_REQUESTS: PaymentRequest[] = [
  { id: "pr-1", number: "#-30", partyId: "party-8", projectId: "proj-2", amount: 18000, against: "Against Labour", status: "Unpaid", date: "29-Jun-2026" },
  { id: "pr-2", number: "#-27", partyId: "party-9", projectId: "proj-12", amount: 20000, against: "Against Subcon WO #WO-9", status: "Unpaid", date: "27-Jun-2026" },
  { id: "pr-3", number: "#-26", partyId: "party-8", projectId: "proj-12", amount: 30000, against: "Against Labour", status: "Unpaid", date: "24-Jun-2026" },
  { id: "pr-4", number: "#-24", partyId: "party-9", projectId: "proj-12", amount: 25000, against: "Against Subcon WO #WO-13", status: "Paid", date: "22-Jun-2026" },
  { id: "pr-5", number: "#-23", partyId: "party-11", projectId: "proj-2", amount: 3000, against: "Against Petty Cash", status: "Paid", date: "22-Jun-2026" },
];

const SEED_ACCOUNTS: BankAccount[] = [
  { id: "acc-1", name: "Cash Account", type: "Cash", balance: 2363293, isPrimary: false },
  { id: "acc-2", name: "HDFC Bank - Current", type: "Bank", accountNo: "50100XXXX9933", balance: 3279671, isPrimary: true, acHolder: "Hi-Tech Construction", ifsc: "HDFC0001234", upi: "hitech@hdfc", openingBalance: 500000 },
  { id: "acc-3", name: "SBI - Site Operations", type: "Bank", accountNo: "3812XXXX3456", balance: 916377, isPrimary: false, acHolder: "Hi-Tech Construction", ifsc: "SBIN0005678", upi: "", openingBalance: 250000 },
];

const SEED_WAREHOUSES: Warehouse[] = [
  { id: "wh-1", name: "Main Warehouse", type: "Central", location: "Rajkot HQ Yard", inCharge: "Mahesh Bhai Chauhan", isActive: true },
  { id: "wh-2", name: "Site Store - Amreli", type: "Site Store", projectId: "proj-3", location: "Village Ishwariya, Amreli", inCharge: "Vishwas Bhai Ujjain", isActive: true },
  { id: "wh-3", name: "Site Store - Rajkot", type: "Site Store", projectId: "proj-11", location: "Pedak Road, Rajkot", inCharge: "Ketan Bhai Vaghela", isActive: true },
];

const SEED_WAREHOUSE_ITEMS: WarehouseItem[] = [
  // Consumables
  { id: "wi-1", warehouseId: "wh-1", name: "Diesel", category: "Fuel", kind: "Consumable", unit: "Litre", openingStock: 1200, reorderLevel: 300, rate: 95 },
  { id: "wi-2", warehouseId: "wh-2", name: "Diesel", category: "Fuel", kind: "Consumable", unit: "Litre", openingStock: 300, reorderLevel: 100, rate: 95 },
  { id: "wi-3", warehouseId: "wh-2", name: "Black Sand (Crushed)", category: "Aggregate", kind: "Consumable", unit: "Cum", openingStock: 80, reorderLevel: 30, rate: 1800 },
  { id: "wi-4", warehouseId: "wh-3", name: "SFRC Rectangular Pipe", category: "Pipes & Fittings", kind: "Consumable", unit: "Nos", openingStock: 40, reorderLevel: 20, rate: 3200 },
  { id: "wi-5", warehouseId: "wh-1", name: "Cement OPC 53", category: "Cement", kind: "Consumable", unit: "Bag", openingStock: 150, reorderLevel: 100, rate: 380 },
  { id: "wi-6", warehouseId: "wh-3", name: "TMT Bar 12mm", category: "Steel", kind: "Consumable", unit: "Kg", openingStock: 500, reorderLevel: 200, rate: 62 },
  // Returnable tools / equipment
  { id: "wi-7", warehouseId: "wh-1", name: "Concrete Vibrator", category: "Machinery", kind: "Returnable", unit: "Nos", openingStock: 6, reorderLevel: 2, rate: 18000 },
  { id: "wi-8", warehouseId: "wh-1", name: "Safety Helmet", category: "Safety Equipment", kind: "Returnable", unit: "Nos", openingStock: 120, reorderLevel: 40, rate: 350 },
  { id: "wi-9", warehouseId: "wh-3", name: "Theodolite (Survey)", category: "Tools", kind: "Returnable", unit: "Nos", openingStock: 3, reorderLevel: 1, rate: 45000 },
  { id: "wi-10", warehouseId: "wh-2", name: "Scaffolding Set", category: "Machinery", kind: "Returnable", unit: "Set", openingStock: 25, reorderLevel: 8, rate: 5500 },
];

const SEED_STOCK_MOVEMENTS: StockMovement[] = [
  // Consumable movements
  { id: "sm-1", itemId: "wi-5", warehouseId: "wh-1", date: "30-Jun-2026", type: "Received", quantity: 200, reference: "PO-2026-0009" },
  { id: "sm-2", itemId: "wi-1", warehouseId: "wh-1", date: "01-Jul-2026", type: "Issued", quantity: 120, projectId: "proj-11", reference: "JCB refuel" },
  { id: "sm-3", itemId: "wi-6", warehouseId: "wh-3", date: "30-Jun-2026", type: "Issued", quantity: 350, projectId: "proj-11", reference: "Pedak Road reinforcement" },
  { id: "sm-4", itemId: "wi-3", warehouseId: "wh-2", date: "29-Jun-2026", type: "Received", quantity: 45, reference: "Vendor delivery" },
  { id: "sm-5", itemId: "wi-4", warehouseId: "wh-3", date: "28-Jun-2026", type: "Issued", quantity: 24, projectId: "proj-12", reference: "RMC Pipeline Phase 2" },
  // Returnable checkouts (issues) + one partial return
  { id: "sm-6", itemId: "wi-7", warehouseId: "wh-1", date: "27-Jun-2026", type: "Issued", quantity: 2, projectId: "proj-11", issuedTo: "Ramesh Patel", reference: "Slab casting", checkoutId: "co-1" },
  { id: "sm-7", itemId: "wi-8", warehouseId: "wh-1", date: "26-Jun-2026", type: "Issued", quantity: 15, projectId: "proj-11", issuedTo: "Site Team - Pedak", reference: "Site safety kit", checkoutId: "co-2" },
  { id: "sm-8", itemId: "wi-9", warehouseId: "wh-3", date: "25-Jun-2026", type: "Issued", quantity: 1, projectId: "proj-11", issuedTo: "Nikhil Trivedi", reference: "Level survey", checkoutId: "co-3" },
  { id: "sm-9", itemId: "wi-10", warehouseId: "wh-2", date: "20-Jun-2026", type: "Issued", quantity: 10, projectId: "proj-3", issuedTo: "Suresh Bhai", reference: "Boundary wall shuttering", checkoutId: "co-4" },
  { id: "sm-10", itemId: "wi-10", warehouseId: "wh-2", date: "30-Jun-2026", type: "Returned", quantity: 4, issuedTo: "Suresh Bhai", reference: "Partial return", checkoutId: "co-4" },
  // Backing movements for dispatched request mr-2
  { id: "sm-11", itemId: "wi-1", warehouseId: "wh-1", date: "28-Jun-2026", type: "Issued", quantity: 150, projectId: "proj-3", reference: "MR-2026-0002", requestId: "mr-2" },
  { id: "sm-12", itemId: "wi-8", warehouseId: "wh-1", date: "28-Jun-2026", type: "Issued", quantity: 10, projectId: "proj-3", issuedTo: "Anil, Rakesh, Dinesh", reference: "MR-2026-0002", checkoutId: "co-5", requestId: "mr-2" },
];

const SEED_CHECKOUTS: Checkout[] = [
  { id: "co-1", itemId: "wi-7", warehouseId: "wh-1", issuedTo: "Ramesh Patel", projectId: "proj-11", qty: 2, returnedQty: 0, date: "27-Jun-2026", status: "Out" },
  { id: "co-2", itemId: "wi-8", warehouseId: "wh-1", issuedTo: "Site Team - Pedak", projectId: "proj-11", qty: 15, returnedQty: 0, date: "26-Jun-2026", status: "Out" },
  { id: "co-3", itemId: "wi-9", warehouseId: "wh-3", issuedTo: "Nikhil Trivedi", projectId: "proj-11", qty: 1, returnedQty: 0, date: "25-Jun-2026", status: "Out" },
  { id: "co-4", itemId: "wi-10", warehouseId: "wh-2", issuedTo: "Suresh Bhai", projectId: "proj-3", qty: 10, returnedQty: 4, date: "20-Jun-2026", status: "Partially Returned" },
  { id: "co-5", itemId: "wi-8", warehouseId: "wh-1", issuedTo: "Anil, Rakesh, Dinesh", projectId: "proj-3", qty: 10, returnedQty: 0, date: "28-Jun-2026", status: "Out", requestId: "mr-2" },
];

const SEED_USERS: User[] = [
  { id: "u-admin", name: "Rajesh Shah", role: "Admin", phone: "98250-10000" },
  { id: "u-site-1", name: "Vishwas Bhai Ujjain", role: "Site In-charge", projectId: "proj-3", phone: "98250-20001" },
  { id: "u-site-2", name: "Ketan Bhai Vaghela", role: "Site In-charge", projectId: "proj-11", phone: "98250-20002" },
  { id: "u-store-1", name: "Mahesh Bhai Chauhan", role: "Store Keeper", warehouseId: "wh-1", phone: "98250-30001" },
  { id: "u-store-2", name: "Jignesh Parmar", role: "Store Keeper", warehouseId: "wh-3", phone: "98250-30002" },
];

const SEED_MATERIAL_REQUESTS: MaterialRequest[] = [
  {
    id: "mr-1",
    number: "MR-2026-0001",
    projectId: "proj-11",
    warehouseId: "wh-1",
    requestedById: "u-site-2",
    date: "01-Jul-2026",
    neededBy: "04-Jul-2026",
    note: "For slab casting at Pedak Road",
    status: "Pending",
    lines: [
      { itemId: "wi-5", qty: 100, issuedQty: 0, returnedQty: 0 },
      { itemId: "wi-7", qty: 1, issuedQty: 0, returnedQty: 0 },
    ],
  },
  {
    id: "mr-2",
    number: "MR-2026-0002",
    projectId: "proj-3",
    warehouseId: "wh-1",
    requestedById: "u-site-1",
    date: "28-Jun-2026",
    note: "Diesel + safety kit for Ishwariya site",
    status: "Dispatched",
    lines: [
      { itemId: "wi-1", qty: 150, issuedQty: 150, returnedQty: 0 },
      { itemId: "wi-8", qty: 10, issuedQty: 10, returnedQty: 0 },
    ],
    dispatch: {
      workers: "Anil, Rakesh, Dinesh",
      vehicle: "GJ-01-AB-1234 (Tata 407)",
      driver: "Prakash Solanki",
      date: "28-Jun-2026",
    },
  },
];

const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: "ntf-1",
    title: "New material request",
    body: "MR-2026-0001 raised by Ketan Bhai Vaghela for Pedak Road (D.I. Pipeline).",
    kind: "request",
    audience: ["u-admin", "u-store-1"],
    readBy: [],
    date: "01-Jul-2026",
    href: "/warehouse",
  },
  {
    id: "ntf-2",
    title: "Materials dispatched",
    body: "MR-2026-0002 dispatched — Diesel & Safety Helmets sent to Ishwariya site.",
    kind: "dispatch",
    audience: ["u-admin", "u-site-1"],
    readBy: ["u-admin"],
    date: "28-Jun-2026",
    href: "/warehouse",
  },
];

function makeNotification(input: Omit<AppNotification, "id" | "readBy">): AppNotification {
  return {
    ...input,
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    readBy: [],
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: seedProjects(),
  attendance: ATTENDANCE,
  materials: MATERIALS,
  financials: FINANCIALS,
  scheduleTasks: seedScheduleTasks(),
  timesheets: [],
  parties: seedParties(),
  items: seedItems(),
  saleInvoices: SEED_INVOICES,
  purchaseEntries: SEED_PURCHASES,
  payments: SEED_PAYMENTS,
  todos: SEED_TODOS,
  transactions: SEED_TRANSACTIONS,
  paymentRequests: SEED_PAYMENT_REQUESTS,
  accounts: SEED_ACCOUNTS,
  warehouses: SEED_WAREHOUSES,
  warehouseItems: SEED_WAREHOUSE_ITEMS,
  stockMovements: SEED_STOCK_MOVEMENTS,
  checkouts: SEED_CHECKOUTS,
  users: SEED_USERS,
  currentUserId: null,
  materialRequests: SEED_MATERIAL_REQUESTS,
  notifications: SEED_NOTIFICATIONS,
  addProject: (input) => {
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: input.name,
      category: "",
      keyPersonnel: "",
      status: "Not Started",
      health: "Healthy",
      startDate: "",
      endDate: "",
      progress: 0,
      customerName: "",
      stage: "",
      address: input.address,
      city: input.city,
      inAmount: 0,
      outAmount: 0,
      todoCount: 0,
      projectCode: "",
      companyBranch: "",
      attendanceRadius: 500,
      projectValue: 0,
      orientation: "",
      dimension: "",
      scopeOfWork: "",
    };
    set({ projects: [project, ...get().projects] });
    return project;
  },
  updateProject: (id, updates) => {
    set({
      projects: get().projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    });
  },
  addTimesheet: (input) => {
    const entry: TimesheetEntry = {
      ...input,
      id: `ts-${Date.now()}`,
      status: "Pending",
    };
    set({ timesheets: [entry, ...get().timesheets] });
  },
  addParty: (input) => {
    const party: Party = { ...input, id: `party-${Date.now()}` };
    set({ parties: [party, ...get().parties] });
    return party;
  },
  addItem: (input) => {
    const item: FinanceItem = { ...input, id: `item-${Date.now()}` };
    set({ items: [item, ...get().items] });
    return item;
  },
  addSaleInvoice: (input) => {
    const items = get().items;
    const lines: InvoiceLine[] = input.lines
      .filter((l) => l.qty > 0)
      .map((l) => {
        const item = items.find((i) => i.id === l.itemId)!;
        return { itemId: item.id, itemName: item.name, qty: l.qty, rate: item.rate, amount: item.rate * l.qty };
      });
    const { subtotal, gstAmount, total } = lineTotals(lines, items);
    const invoice: SaleInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2026-${String(1000 + get().saleInvoices.length).padStart(4, "0")}`,
      partyId: input.partyId,
      projectId: input.projectId,
      date: input.date,
      lines,
      subtotal,
      gstAmount,
      total,
      received: input.received ?? 0,
      status:
        (input.received ?? 0) >= total && total > 0
          ? "Paid"
          : (input.received ?? 0) > 0
            ? "Partial"
            : "Pending",
    };
    set({ saleInvoices: [invoice, ...get().saleInvoices] });
    if (invoice.received > 0) {
      get().addPayment({
        direction: "In",
        partyId: input.partyId,
        projectId: input.projectId,
        date: input.date,
        amount: invoice.received,
        mode: "Bank Transfer",
        note: `Received against ${invoice.invoiceNumber}`,
      });
    }
    return invoice;
  },
  addPurchaseEntry: (input) => {
    const items = get().items;
    const lines: InvoiceLine[] = input.lines
      .filter((l) => l.qty > 0)
      .map((l) => {
        const item = items.find((i) => i.id === l.itemId)!;
        return { itemId: item.id, itemName: item.name, qty: l.qty, rate: item.rate, amount: item.rate * l.qty };
      });
    const { subtotal, gstAmount, total } = lineTotals(lines, items);
    const entry: PurchaseEntry = {
      id: `pur-${Date.now()}`,
      billNumber: `PUR-2026-${String(1000 + get().purchaseEntries.length).padStart(4, "0")}`,
      partyId: input.partyId,
      projectId: input.projectId,
      date: input.date,
      lines,
      subtotal,
      gstAmount,
      total,
    };
    set({ purchaseEntries: [entry, ...get().purchaseEntries] });
    return entry;
  },
  addPayment: (input) => {
    const payment: PaymentEntry = { ...input, id: `pay-${Date.now()}` };
    set({ payments: [payment, ...get().payments] });
    const project = get().projects.find((p) => p.id === input.projectId);
    if (project) {
      if (input.direction === "In") {
        get().updateProject(project.id, { inAmount: project.inAmount + input.amount });
      } else {
        get().updateProject(project.id, { outAmount: project.outAmount + input.amount });
      }
    }
    return payment;
  },
  addTodo: (input) => {
    const todo: TodoTask = { ...input, id: `todo-${Date.now()}` };
    set({ todos: [todo, ...get().todos] });
    return todo;
  },
  updateTodo: (id, updates) => {
    set({
      todos: get().todos.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    });
  },
  deleteTodo: (id) => {
    set({ todos: get().todos.filter((t) => t.id !== id) });
  },
  addTransaction: (input) => {
    const meta = TXN_TYPE_META[input.type];
    const transaction: FinanceTransaction = {
      id: `t-${Date.now()}`,
      type: input.type,
      category: meta.category,
      flow: meta.flow,
      date: input.date,
      partyId: input.partyId,
      projectId: input.projectId,
      amount: input.amount,
      description: input.description,
      paid: input.paid ?? meta.category === "Payment",
    };
    set({ transactions: [transaction, ...get().transactions] });

    // Keep project In/Out and party balances coherent so the whole app reflects the entry.
    const project = get().projects.find((p) => p.id === input.projectId);
    if (project) {
      if (meta.flow === "in") get().updateProject(project.id, { inAmount: project.inAmount + input.amount });
      else if (meta.flow === "out") get().updateProject(project.id, { outAmount: project.outAmount + input.amount });
    }
    set({
      parties: get().parties.map((p) => {
        if (p.id !== input.partyId) return p;
        if (input.type === "Sales Invoice" || input.type === "Material Sales") {
          return { ...p, toReceive: p.toReceive + (input.paid ? 0 : input.amount) };
        }
        if (input.type === "Payment In") {
          return { ...p, toReceive: Math.max(0, p.toReceive - input.amount) };
        }
        if (["Material Purchase", "Sub Con Bill", "Other Expense", "Equipment Expense"].includes(input.type)) {
          return { ...p, toPay: p.toPay + (input.paid ? 0 : input.amount) };
        }
        if (input.type === "Payment Out") {
          return { ...p, toPay: Math.max(0, p.toPay - input.amount) };
        }
        return p;
      }),
    });
    return transaction;
  },
  addPaymentRequest: (input) => {
    const request: PaymentRequest = {
      ...input,
      id: `pr-${Date.now()}`,
      number: `#-${get().paymentRequests.length + 31}`,
      status: "Unpaid",
    };
    set({ paymentRequests: [request, ...get().paymentRequests] });
    return request;
  },
  addBankAccount: (input) => {
    const account: BankAccount = { ...input, id: `acc-${Date.now()}` };
    set({ accounts: [...get().accounts, account] });
    return account;
  },
  addWarehouse: (input) => {
    const warehouse: Warehouse = { ...input, id: `wh-${Date.now()}` };
    set({ warehouses: [...get().warehouses, warehouse] });
    return warehouse;
  },
  updateWarehouse: (id, updates) => {
    set({
      warehouses: get().warehouses.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    });
  },
  addWarehouseItem: (input) => {
    const item: WarehouseItem = { ...input, id: `wi-${Date.now()}` };
    set({ warehouseItems: [item, ...get().warehouseItems] });
    return item;
  },
  receiveStock: (input) => {
    const item = get().warehouseItems.find((i) => i.id === input.itemId);
    if (!item) return;
    const movement: StockMovement = {
      id: `sm-${Date.now()}`,
      itemId: item.id,
      warehouseId: item.warehouseId,
      date: input.date,
      type: "Received",
      quantity: input.quantity,
      reference: input.reference,
    };
    set({ stockMovements: [movement, ...get().stockMovements] });
  },
  issueStock: (input) => {
    const item = get().warehouseItems.find((i) => i.id === input.itemId);
    if (!item) return;
    const now = Date.now();
    // Returnable items open a checkout so we can track what's still out with whom.
    const checkoutId = item.kind === "Returnable" ? `co-${now}-${item.id}` : undefined;
    const movement: StockMovement = {
      id: `sm-${now}-${item.id}`,
      itemId: item.id,
      warehouseId: item.warehouseId,
      date: input.date,
      type: "Issued",
      quantity: input.quantity,
      projectId: input.projectId,
      issuedTo: input.issuedTo,
      reference: input.reference,
      checkoutId,
      requestId: input.requestId,
    };
    set({ stockMovements: [movement, ...get().stockMovements] });
    if (checkoutId) {
      const checkout: Checkout = {
        id: checkoutId,
        itemId: item.id,
        warehouseId: item.warehouseId,
        issuedTo: input.issuedTo ?? "—",
        projectId: input.projectId,
        qty: input.quantity,
        returnedQty: 0,
        date: input.date,
        status: "Out",
        requestId: input.requestId,
      };
      set({ checkouts: [checkout, ...get().checkouts] });
    }
  },
  returnCheckout: (checkoutId, quantity, date) => {
    const checkout = get().checkouts.find((c) => c.id === checkoutId);
    if (!checkout) return;
    const remaining = checkout.qty - checkout.returnedQty;
    const qty = Math.min(quantity, remaining);
    if (qty <= 0) return;
    const returnedQty = checkout.returnedQty + qty;
    const status: Checkout["status"] = returnedQty >= checkout.qty ? "Returned" : "Partially Returned";
    const movement: StockMovement = {
      id: `sm-${Date.now()}`,
      itemId: checkout.itemId,
      warehouseId: checkout.warehouseId,
      date,
      type: "Returned",
      quantity: qty,
      issuedTo: checkout.issuedTo,
      reference: "Return",
      checkoutId,
    };
    set({
      stockMovements: [movement, ...get().stockMovements],
      checkouts: get().checkouts.map((c) =>
        c.id === checkoutId ? { ...c, returnedQty, status } : c
      ),
    });
  },
  login: (userId) => {
    set({ currentUserId: userId });
    if (typeof window !== "undefined") localStorage.setItem(AUTH_STORAGE_KEY, userId);
  },
  logout: () => {
    set({ currentUserId: null });
    if (typeof window !== "undefined") localStorage.removeItem(AUTH_STORAGE_KEY);
  },
  rehydrateAuth: (userId) => {
    if (get().users.some((u) => u.id === userId)) set({ currentUserId: userId });
  },
  addMaterialRequest: (input) => {
    const number = `MR-2026-${String(get().materialRequests.length + 1).padStart(4, "0")}`;
    const request: MaterialRequest = {
      id: `mr-${Date.now()}`,
      number,
      projectId: input.projectId,
      warehouseId: input.warehouseId,
      requestedById: input.requestedById,
      date: input.date,
      neededBy: input.neededBy,
      note: input.note,
      status: "Pending",
      lines: input.lines
        .filter((l) => l.qty > 0)
        .map((l) => ({ itemId: l.itemId, qty: l.qty, issuedQty: 0, returnedQty: 0 })),
    };
    // Notify the warehouse's store keeper(s) and admins.
    const audience = get()
      .users.filter(
        (u) => u.role === "Admin" || (u.role === "Store Keeper" && u.warehouseId === input.warehouseId)
      )
      .map((u) => u.id)
      .filter((id) => id !== input.requestedById);
    const requester = get().users.find((u) => u.id === input.requestedById);
    const project = get().projects.find((p) => p.id === input.projectId);
    const notification = makeNotification({
      title: "New material request",
      body: `${number} raised by ${requester?.name ?? "a site"} for ${project?.name ?? "a project"}.`,
      kind: "request",
      audience,
      date: input.date,
      href: "/warehouse",
    });
    set({
      materialRequests: [request, ...get().materialRequests],
      notifications: [notification, ...get().notifications],
    });
    return request;
  },
  fulfillMaterialRequest: (requestId, input) => {
    const request = get().materialRequests.find((r) => r.id === requestId);
    if (!request) return;
    // Issue each line from the warehouse — this drives stock + checkouts.
    for (const line of input.issued) {
      if (line.qty <= 0) continue;
      get().issueStock({
        itemId: line.itemId,
        quantity: line.qty,
        date: input.dispatch.date,
        projectId: request.projectId,
        issuedTo: input.dispatch.workers,
        reference: request.number,
        requestId: request.id,
      });
    }
    const admins = get().users.filter((u) => u.role === "Admin").map((u) => u.id);
    const warehouse = get().warehouses.find((w) => w.id === request.warehouseId);
    const notification = makeNotification({
      title: "Materials dispatched",
      body: `${request.number} dispatched from ${warehouse?.name ?? "warehouse"} · collected by ${input.dispatch.workers} (${input.dispatch.vehicle}).`,
      kind: "dispatch",
      audience: [request.requestedById, ...admins],
      date: input.dispatch.date,
      href: "/warehouse",
    });
    set({
      materialRequests: get().materialRequests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: "Dispatched",
              dispatch: input.dispatch,
              lines: r.lines.map((l) => ({
                ...l,
                issuedQty: input.issued.find((i) => i.itemId === l.itemId)?.qty ?? l.issuedQty,
              })),
            }
          : r
      ),
      notifications: [notification, ...get().notifications],
    });
  },
  returnMaterialRequest: (requestId, input) => {
    const request = get().materialRequests.find((r) => r.id === requestId);
    if (!request) return;
    const items = get().warehouseItems;
    for (const ret of input.returns) {
      if (ret.qty <= 0) continue;
      const item = items.find((i) => i.id === ret.itemId);
      if (!item) continue;
      // A returnable item routed through this request has an open checkout — reuse
      // the checkout return so stock + checkout status stay in sync.
      const checkout = get().checkouts.find(
        (c) => c.requestId === requestId && c.itemId === ret.itemId && c.status !== "Returned"
      );
      if (checkout) {
        get().returnCheckout(checkout.id, ret.qty, input.date);
      } else {
        // Leftover consumable coming back — record a plain return movement.
        const movement: StockMovement = {
          id: `sm-${Date.now()}-${ret.itemId}`,
          itemId: ret.itemId,
          warehouseId: item.warehouseId,
          date: input.date,
          type: "Returned",
          quantity: ret.qty,
          reference: `${request.number} return`,
          requestId,
        };
        set({ stockMovements: [movement, ...get().stockMovements] });
      }
    }
    const newLines = request.lines.map((l) => ({
      ...l,
      returnedQty: l.returnedQty + (input.returns.find((i) => i.itemId === l.itemId)?.qty ?? 0),
    }));
    // Closed once nothing returnable is still out; otherwise partially returned.
    const outstandingReturnable = newLines.reduce((sum, l) => {
      const item = items.find((i) => i.id === l.itemId);
      if (item?.kind !== "Returnable") return sum;
      return sum + Math.max(0, l.issuedQty - l.returnedQty);
    }, 0);
    const status: RequestStatus = outstandingReturnable === 0 ? "Closed" : "Partially Returned";
    const admins = get().users.filter((u) => u.role === "Admin").map((u) => u.id);
    const notification = makeNotification({
      title: status === "Closed" ? "Request closed" : "Items returned",
      body: `${request.number} — items returned to warehouse${status === "Closed" ? " and request closed." : "."}`,
      kind: "return",
      audience: [request.requestedById, ...admins],
      date: input.date,
      href: "/warehouse",
    });
    set({
      materialRequests: get().materialRequests.map((r) =>
        r.id === requestId ? { ...r, lines: newLines, status } : r
      ),
      notifications: [notification, ...get().notifications],
    });
  },
  markNotificationRead: (id, userId) => {
    set({
      notifications: get().notifications.map((n) =>
        n.id === id && !n.readBy.includes(userId) ? { ...n, readBy: [...n.readBy, userId] } : n
      ),
    });
  },
  markAllNotificationsRead: (userId) => {
    set({
      notifications: get().notifications.map((n) =>
        n.audience.includes(userId) && !n.readBy.includes(userId)
          ? { ...n, readBy: [...n.readBy, userId] }
          : n
      ),
    });
  },
}));
