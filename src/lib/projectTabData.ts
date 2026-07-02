import { pick, randomDate, seededRandom } from "./random";
import { formatLakh } from "./format";
import { useAppStore } from "./store";

const PEOPLE = [
  "Ramesh Patel",
  "Suresh Bhai",
  "Vikram Solanki",
  "Anjali Mehta",
  "Devendra Rana",
  "Kiran Joshi",
  "Priya Shah",
  "Nikhil Trivedi",
];

const TASK_STATUS = ["Pending", "In Progress", "Completed", "Delayed"];
const TASK_NAMES = [
  "Excavation - Foundation",
  "Shuttering Work",
  "Reinforcement Fixing",
  "Concrete Pouring",
  "Curing & QC Check",
  "Site Survey",
  "Material Inspection",
  "Safety Audit",
];

export interface TransactionRow {
  date: string;
  type: string;
  description: string;
  amount: string;
  balance: string;
  [key: string]: string;
}

export function generateTransactions(projectId: string, count = 6): TransactionRow[] {
  const rng = seededRandom(`${projectId}-transactions`);
  let balance = 200000 + Math.floor(rng() * 500000);
  return Array.from({ length: count }, () => {
    const isCredit = rng() > 0.5;
    const amount = 5000 + Math.floor(rng() * 150000);
    balance += isCredit ? amount : -amount;
    return {
      date: randomDate(rng),
      type: isCredit ? "Credit" : "Debit",
      description: pick(rng, [
        "Client Advance Payment",
        "Material Purchase - Cement",
        "Subcontractor Payment",
        "Equipment Rental",
        "Labour Wages",
        "Client Milestone Payment",
      ]),
      amount: formatLakh(amount),
      balance: formatLakh(balance),
    };
  });
}

export interface ProjectAttendanceRow {
  date: string;
  workers: number;
  [key: string]: string | number;
}

export function generateProjectAttendance(projectId: string, count = 7): ProjectAttendanceRow[] {
  const rng = seededRandom(`${projectId}-attendance`);
  return Array.from({ length: count }, (_, i) => ({
    date: `${String(25 + i > 30 ? i - 5 : 25 + i).padStart(2, "0")}-Jun-2026`,
    workers: 8 + Math.floor(rng() * 20),
  }));
}

export interface MaterialRow {
  date: string;
  material: string;
  movement: string;
  quantity: number;
  unit: string;
  [key: string]: string | number;
}

export function generateProjectMaterials(projectId: string, count = 6): MaterialRow[] {
  const rng = seededRandom(`${projectId}-materials`);
  const materialNames = useAppStore.getState().materials.map((m) => m.name);
  const units = ["Bag", "Kg", "Litre", "Nos", "Cum"];
  return Array.from({ length: count }, () => ({
    date: randomDate(rng),
    material: pick(rng, materialNames),
    movement: pick(rng, ["Received", "Issued"]),
    quantity: 5 + Math.floor(rng() * 200),
    unit: pick(rng, units),
  }));
}

export interface TaskRow {
  task: string;
  assignedTo: string;
  dueDate: string;
  status: string;
  [key: string]: string;
}

export function generateProjectTasks(projectId: string, count = 6): TaskRow[] {
  const rng = seededRandom(`${projectId}-tasks`);
  return Array.from({ length: count }, () => ({
    task: pick(rng, TASK_NAMES),
    assignedTo: pick(rng, PEOPLE),
    dueDate: randomDate(rng),
    status: pick(rng, TASK_STATUS),
  }));
}

export interface PhotoRow {
  date: string;
  caption: string;
  uploadedBy: string;
  [key: string]: string;
}

export function generateProjectPhotos(projectId: string, count = 6): PhotoRow[] {
  const rng = seededRandom(`${projectId}-photos`);
  return Array.from({ length: count }, () => ({
    date: randomDate(rng),
    caption: pick(rng, [
      "Foundation progress",
      "Site inspection",
      "Material delivery",
      "Safety compliance check",
      "Structural work",
      "Daily site view",
    ]),
    uploadedBy: pick(rng, PEOPLE),
  }));
}

export interface InvoiceRow {
  invoiceNumber: string;
  date: string;
  amount: string;
  status: string;
  [key: string]: string;
}

export function generateProjectInvoices(projectId: string, count = 5): InvoiceRow[] {
  const rng = seededRandom(`${projectId}-billing`);
  return Array.from({ length: count }, (_, i) => ({
    invoiceNumber: `INV-2026-${String(200 + i).padStart(4, "0")}`,
    date: randomDate(rng),
    amount: formatLakh(20000 + Math.floor(rng() * 400000)),
    status: pick(rng, ["Paid", "Pending", "Overdue"]),
  }));
}
