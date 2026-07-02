import { useAppStore } from "./store";
import type { ReportColumn } from "./reportSchema";
import { formatLakh } from "./format";
import { pick, randomDate, seededRandom } from "./random";

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

const CLIENTS = [
  "Rajkot Municipal Corporation",
  "Amreli Gram Panchayat",
  "GERI Testing Labs",
  "Directorate Urban Administration",
  "Hi-Tech Construction Pvt Ltd",
];

const PARTY_TYPES = ["Client", "Subcontractor", "Vendor"];
const SALE_TYPES = ["Tax Invoice", "Proforma Invoice", "Credit Note"];
const STATUS_POOL = ["Approved", "Pending", "In Progress", "Completed", "Rejected"];
const WAREHOUSES = ["Main Warehouse", "Site Store - Amreli", "Site Store - Rajkot"];
const UNITS = ["Nos", "Cum", "Sqm", "Kg", "Litre", "Bag"];
const EQUIPMENT = ["Excavator JCB 3D", "Tower Crane TC-40", "Concrete Mixer", "Vibrator Machine", "DG Set 62.5 KVA"];
const ROLES = ["Site Engineer", "Mason", "Helper", "Electrician", "Supervisor", "Plumber"];
const ITEM_DESCRIPTIONS = [
  "Cement OPC 53",
  "TMT Bar 12mm",
  "SFRC Pipe 600mm",
  "Excavation Work",
  "Shuttering Work",
  "Reinforcement Work",
];
const LIBRARY_CATEGORIES = ["Civil", "Electrical", "Plumbing", "Structural", "Finishing", "Mechanical"];

function valueForColumn(
  column: ReportColumn,
  rng: () => number,
  rowIndex: number,
  reportName: string,
  projectNames: string[],
  materialNames: string[]
): string {
  const label = column.label.toLowerCase();

  if (column.type === "date") return randomDate(rng);
  if (column.type === "percent") return `${pick(rng, [5, 12, 18, 28])}%`;
  if (column.type === "status") return pick(rng, STATUS_POOL);
  if (column.type === "number") {
    if (label.includes("hour")) return String(6 + Math.floor(rng() * 4));
    if (label.includes("rank")) return String(rowIndex + 1);
    return String(1 + Math.floor(rng() * 48));
  }
  if (column.type === "currency") return formatLakh(1000 + Math.floor(rng() * 500000));

  // Bare "Name"/"Category" columns are ambiguous on their own (Library reports reuse
  // them for very different things), so resolve using the report name first.
  if (label === "name") {
    if (reportName.includes("Party Library")) return pick(rng, CLIENTS);
    if (reportName.includes("Material Library")) return pick(rng, materialNames);
    if (reportName.includes("Equipment Library")) return pick(rng, EQUIPMENT);
    if (reportName.includes("Payroll Library")) return pick(rng, ROLES);
    if (reportName.includes("Library")) return pick(rng, ITEM_DESCRIPTIONS);
    if (reportName.includes("Leaderboard")) return pick(rng, PEOPLE);
  }
  if (label === "category" && reportName.includes("Library")) return pick(rng, LIBRARY_CATEGORIES);

  if (label.includes("project")) return pick(rng, projectNames);
  if (label.includes("material")) return pick(rng, materialNames);
  if (label.includes("warehouse")) return pick(rng, WAREHOUSES);
  if (label.includes("client") || label.includes("company")) return pick(rng, CLIENTS);
  if (label.includes("party")) return pick(rng, CLIENTS);
  if (label.includes("vendor")) return pick(rng, CLIENTS);
  if (label.includes("party type")) return pick(rng, PARTY_TYPES);
  if (label.includes("sale type")) return pick(rng, SALE_TYPES);
  if (label.includes("payment type")) return pick(rng, ["Bank Transfer", "Cheque", "Cash", "UPI"]);
  if (label.includes("unit")) return pick(rng, UNITS);
  if (label.includes("gstin")) return `24ABCDE${1000 + rowIndex}F1Z${rowIndex % 10}`;
  if (
    label.includes("worker") ||
    label.includes("assigned") ||
    label.includes("name") ||
    label.includes("creator")
  )
    return pick(rng, PEOPLE);
  if (label.includes("check in")) return "09:0" + (rowIndex % 6) + " AM";
  if (label.includes("check out")) return "06:1" + (rowIndex % 6) + " PM";
  if (label.includes("code")) return `CC-${100 + rowIndex}`;
  if (label.includes("invoice") || label.includes("reference"))
    return `INV-2026-${String(100 + rowIndex).padStart(4, "0")}`;
  if (label.includes("month")) return pick(rng, ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]);
  if (label.includes("description") || label.includes("item"))
    return pick(rng, ITEM_DESCRIPTIONS);

  return pick(rng, projectNames);
}

export function generateReportRows(
  slug: string,
  reportName: string,
  columns: ReportColumn[],
  count = 6
): Record<string, string>[] {
  const rng = seededRandom(slug);
  const projectNames = useAppStore.getState().projects.map((p) => p.name);
  const materialNames = useAppStore.getState().materials.map((m) => m.name);

  return Array.from({ length: count }, (_, rowIndex) => {
    const row: Record<string, string> = {};
    for (const column of columns) {
      row[column.key] = valueForColumn(column, rng, rowIndex, reportName, projectNames, materialNames);
    }
    return row;
  });
}
