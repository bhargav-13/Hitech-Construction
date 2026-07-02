export interface ReportItem {
  name: string;
  hasDownload?: boolean;
}

export interface ReportCategory {
  name: string;
  icon: "trending" | "credit" | "clipboard" | "repeat" | "users" | "truck" | "package";
  reports: ReportItem[];
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    name: "Sales",
    icon: "trending",
    reports: [
      { name: "Company Sales Report", hasDownload: true },
      { name: "Item Wise Sales Report" },
      { name: "Sales Deduction / Retention Report" },
      { name: "CRM Lead Detail Report" },
      { name: "Lead Status Funnel Report" },
      { name: "Project Wise Sales Summary" },
    ],
  },
  {
    name: "Payments",
    icon: "credit",
    reports: [
      { name: "Company Payments", hasDownload: true },
      { name: "Bank Statement" },
      { name: "Project Wise Payment Summary" },
      { name: "Project Payment Report" },
      { name: "Payment Request Report" },
    ],
  },
  {
    name: "Progress & task",
    icon: "clipboard",
    reports: [
      { name: "Daily Progress Report" },
      { name: "Task Report" },
      { name: "Task Measurement Book" },
      { name: "Task Material Report" },
      { name: "To Do Report" },
      { name: "Task Resource Budget Vs Actual Report" },
      { name: "Site Inspection Report" },
      { name: "Task Revenue & Expense Report" },
      { name: "Task BOQ Billed & Unbilled Qty Report" },
      { name: "Task Attendance Report" },
    ],
  },
  {
    name: "Purchase & Expense",
    icon: "repeat",
    reports: [
      { name: "Purchase Order Report" },
      { name: "Expense Report" },
      { name: "Vendor Bill Report" },
      { name: "Sales (GSTR-1)", hasDownload: true },
      { name: "Purchase (GSTR-2)" },
    ],
  },
  {
    name: "Party Balances",
    icon: "users",
    reports: [
      { name: "Party Ledger Report" },
      { name: "Outstanding Balance Report" },
      { name: "Subcon Workorder Summary Report" },
      { name: "Subcon Measurement Book" },
      { name: "Subcon Deduction / Retention Report" },
      { name: "Subcon Material Issue Summary" },
    ],
  },
  {
    name: "Materials & Inventory",
    icon: "truck",
    reports: [
      { name: "Warehouse Stock Movement Report" },
      { name: "Warehouse Transaction Report" },
      { name: "Warehouse Current Stock Report" },
      { name: "Material Received Report" },
      { name: "Material Issued Report" },
    ],
  },
  {
    name: "Misc.",
    icon: "package",
    reports: [
      { name: "Project Financial Summary", hasDownload: true },
      { name: "Project Operational Summary" },
      { name: "Company Transactions Report" },
      { name: "Monthly P&L Report" },
      { name: "Project Activity Leaderboard" },
      { name: "Company User Activity Leaderboard" },
    ],
  },
  {
    name: "Library",
    icon: "package",
    reports: [
      { name: "Party Library" },
      { name: "Cost Code Library" },
      { name: "Material Library" },
      { name: "Rate Card Library" },
      { name: "Payroll Library" },
      { name: "Equipment Library" },
    ],
  },
  {
    name: "BOQ",
    icon: "package",
    reports: [
      { name: "BOQ Workorder Summary Report" },
      { name: "BOQ Item Report" },
      { name: "Quotation Report" },
      { name: "Quotation Item Report" },
      { name: "BOQ Measurement Book" },
    ],
  },
  {
    name: "Budget",
    icon: "package",
    reports: [
      { name: "BOQ BOM Report" },
      { name: "Budget vs Actual (Material Cost)" },
      { name: "Budget vs Actual (Material Qty)" },
      { name: "Budget vs Actual (Cost Code)" },
    ],
  },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function findReport(
  slug: string
): { category: ReportCategory; report: ReportItem } | undefined {
  for (const category of REPORT_CATEGORIES) {
    const report = category.reports.find((r) => slugify(r.name) === slug);
    if (report) return { category, report };
  }
  return undefined;
}
