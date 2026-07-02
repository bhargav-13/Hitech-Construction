import { create } from "zustand";
import type {
  AttendanceDay,
  FinanceItem,
  FinancialMonth,
  InvoiceLine,
  MaterialReceived,
  Party,
  PaymentEntry,
  Project,
  PurchaseEntry,
  SaleInvoice,
  ScheduleTask,
  TimesheetEntry,
  TodoTask,
} from "./types";

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
> &
  Partial<
    Pick<Project, "address" | "inAmount" | "outAmount" | "todoCount">
  >;

const PROJECTS: SeedProject[] = [
  { name: "Construction of CC Road", category: "Directorate Urban Administration and Development", status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "Received LOA", address: "" },
  { name: "HI-TECH OFFICE", category: "", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "Ishwariya (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Ishwariya, Tal. Kunkavav, Amreli" },
  { name: "Jetpur (Fire System)", category: "", status: "Completed", health: "At Risk", startDate: "22-Oct-2024", endDate: "22-Nov-2024", stage: "Completed", address: "Jetpur, Jetpur" },
  { name: "Lakhapadar (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Lakhapadar, Ta. Kunkavav, Amreli" },
  { name: "Mayapadar (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Maya padar Tal. Kunkavav, Amreli", inAmount: 26 },
  { name: "Morvada (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "13-Jan-2026", endDate: "13-Jul-2026", stage: "Pending For Land Clearance", address: "Village Morvada, Tal. Kunkavav, Amreli" },
  { name: "Navagam (D.I. Pipeline)", category: "", status: "Completed", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "New Jagnathplot (D.I. Pipeline)", category: "", status: "Completed", health: "Healthy", startDate: "17-Feb-2025", endDate: "", stage: "", address: "" },
  { name: "Old Jagnathplot (D.I. Pipeline)", category: "", status: "Onhold", health: "At Risk", startDate: "17-Feb-2025", endDate: "17-Dec-2026", stage: "", address: "" },
  { name: "Pedak Road (D.I. Pipeline)", category: "Rajkot Municipal Corporation", status: "Completed", health: "At Risk", startDate: "24-Feb-2025", endDate: "23-Mar-2026", stage: "Final Bill In Progress", address: "" },
  { name: "Raydi (Animal Husbandary EPI Center)", category: RB_DIVISION, status: "Ongoing", health: "At Risk", startDate: "02-Jan-2026", endDate: "02-Jul-2026", stage: "Sample Testing At GERI", address: "Village Rayadim, Ta. Jamkandorana, Rajkot", outAmount: 100000, todoCount: 1 },
  { name: "RMC D.I. Pipeline - Phase 1", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "At Risk", startDate: "", endDate: "", stage: "", address: "" },
  { name: "RMC D.I. Pipeline - Phase 2", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "RMC D.I. Pipeline - Phase 3", category: "Rajkot Municipal Corporation", status: "Ongoing", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "Vanthali (Gram Panchayat) at Junagadh", category: RB_DIVISION, status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "Ta. Vanthali, Junagadh" },
  { name: "Trambakpur (Gram Panchayat) Amreli", category: RB_DIVISION, status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "Vavdi Road Widening", category: "", status: "Not Started", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
  { name: "Wankaner Water Supply Scheme", category: "", status: "Completed", health: "Healthy", startDate: "", endDate: "", stage: "", address: "" },
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
  { name: "Rajkot Municipal Corporation", type: "Client", phone: "079-23456789", gstin: "24AAACR1234F1Z5" },
  { name: "Amreli Gram Panchayat", type: "Client", phone: "02792-223344", gstin: "24AAALG5678H1Z2" },
  { name: "GERI Testing Labs", type: "Client", phone: "079-26301234", gstin: "24AABCG9012J1Z8" },
  { name: "Ambuja Cement Suppliers", type: "Vendor", phone: "98250-11223", gstin: "24AAECA3456K1Z1" },
  { name: "Shree Steel Traders", type: "Vendor", phone: "98240-55667", gstin: "24AAFCS7890L1Z4" },
  { name: "Vishwas Bhai Ujjain", type: "Subcontractor", phone: "90999-11111", gstin: "" },
  { name: "Shubham Bhai Ujjain", type: "Subcontractor", phone: "90999-22222", gstin: "" },
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
  addPurchaseEntry: (input: {
    partyId: string;
    projectId: string;
    date: string;
    lines: { itemId: string; qty: number }[];
  }) => PurchaseEntry;
  addPayment: (input: Omit<PaymentEntry, "id">) => PaymentEntry;
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
      address: [input.address, input.city].filter(Boolean).join(", "),
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
}));
