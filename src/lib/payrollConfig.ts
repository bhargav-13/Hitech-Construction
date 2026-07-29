/**
 * The Payroll module's structure, transcribed from PagarBook (with UX cues from Keka and Zoho
 * Payroll) so our ERP is a like-for-like staff-management + payroll system: the sidebar tree,
 * the employee categories, attendance codes and the full report catalogue.
 */

export interface PayrollNavNode {
  label: string;
  href?: string;
  icon?: string;
  children?: PayrollNavNode[];
  badge?: string;
}

/** Left rail — flat, deduplicated. Attendance is one page with a Day/Month toggle; shift + weekly-off
 *  + grace + OT rules live on the Shift record in Setup (no separate "Attendance Settings" screen).
 *  Payroll Run's lock/unlock is inline on the runs page (no separate "Approvals" screen). */
export const PAYROLL_NAV: PayrollNavNode[] = [
  { label: "Dashboard", href: "/payroll", icon: "home" },
  // Pre-setup: reusable policies (shifts, holidays, leave) configured once and assigned to people.
  { label: "Setup", href: "/payroll/setup", icon: "sliders" },
  { label: "People", href: "/payroll/staff", icon: "users" },
  { label: "Locations", href: "/payroll/locations", icon: "pin" },
  // Combined Day + Month view (formerly two pages).
  { label: "Attendance", href: "/payroll/attendance", icon: "calendar" },
  {
    label: "Leave",
    icon: "calendar",
    children: [
      { label: "All Requests", href: "/payroll/leave" },
      { label: "Approval Queue", href: "/payroll/leave/approvals" },
    ],
  },
  { label: "Monthly Runs", href: "/payroll/run", icon: "wallet" },
  { label: "Loans", href: "/payroll/loans", icon: "landmark" },
  { label: "Reimbursements", href: "/payroll/reimbursements", icon: "receipt" },
  // Payments (payout tracking) and Tax Profiles are not wired to the backend yet — hidden from
  // nav so no mock data reaches users. Re-add once Phase 6 (payroll_payments) ships.
  { label: "Reports", href: "/payroll/reports", icon: "chart" },
  // Tasks are handled by the dedicated Taskopad module — link out to it rather than duplicating.
  { label: "Tasks", href: "/taskopad", icon: "check" },
  { label: "Others", href: "/payroll/others", icon: "grid" },
];

/** The self-service rail — what a regular employee (VIEW-only) sees: just their own records. */
export const PAYROLL_SELF_NAV: PayrollNavNode[] = [
  { label: "My Dashboard", href: "/payroll", icon: "home" },
  { label: "My Attendance", href: "/payroll/me/attendance", icon: "calendar" },
  { label: "My Leave", href: "/payroll/me/leave", icon: "calendar" },
  { label: "My Payslips", href: "/payroll/me/payslips", icon: "wallet" },
  { label: "My Loans", href: "/payroll/me/loans", icon: "landmark" },
  { label: "My Reimbursements", href: "/payroll/me/reimbursements", icon: "receipt" },
  { label: "My Profile", href: "/payroll/me/profile", icon: "users" },
];

/** The three employment categories PagarBook offers when adding staff. */
export type StaffCategory = "REGULAR" | "CONTRACTOR" | "WORK_BASIS";

export interface CategoryConfig {
  key: StaffCategory;
  title: string;
  blurb: string;
  suitableFor: string[];
  features: string[];
  /** How this category is paid — drives which salary fields the Add-Staff form shows. */
  payBasis: "MONTHLY" | "CONTRACT" | "WORK";
}

export const STAFF_CATEGORIES: CategoryConfig[] = [
  {
    key: "REGULAR",
    title: "Regular Employee",
    blurb: "Permanent or regular employees with a complete salary structure and full HR features.",
    suitableFor: ["Full-time employees", "Permanent staff", "Office employees"],
    features: [
      "Attendance & Leave Management",
      "Full Salary Structure",
      "Statutory Components (PF / ESIC / PT)",
      "Tax Declarations & FBP Support",
    ],
    payBasis: "MONTHLY",
  },
  {
    key: "CONTRACTOR",
    title: "Contractor",
    blurb: "Contract-based employees with attendance tracking and a simplified salary structure.",
    suitableFor: ["Contract employees", "Temporary workers", "Project-based staff"],
    features: ["Attendance Tracking", "Simplified Salary Structure", "Statutory Compliance"],
    payBasis: "CONTRACT",
  },
  {
    key: "WORK_BASIS",
    title: "Work Basis",
    blurb: "Paid by daily work, hours worked, or completed tasks — no fixed salary structure.",
    suitableFor: ["Daily wage workers", "Hourly employees", "Piece-rate workers", "Casual labour"],
    features: ["Daily / Hourly / Piece-rate pay", "Simplified payroll", "Bulk work entry"],
    payBasis: "WORK",
  },
];

export const categoryConfig = (key: StaffCategory) => STAFF_CATEGORIES.find((c) => c.key === key)!;

/** Attendance status codes used across the dashboard and muster roll. */
export type AttendanceCode = "P" | "A" | "HD" | "PL" | "NM" | "WO";

export const ATTENDANCE_META: Record<AttendanceCode, { label: string; short: string; className: string }> = {
  P: { label: "Present", short: "P", className: "bg-emerald-100 text-emerald-700" },
  A: { label: "Absent", short: "A", className: "bg-rose-100 text-rose-700" },
  HD: { label: "Half Day", short: "HD", className: "bg-amber-100 text-amber-700" },
  PL: { label: "Paid Leave", short: "PL", className: "bg-blue-100 text-blue-700" },
  NM: { label: "Not Marked", short: "NM", className: "bg-gray-100 text-gray-500" },
  WO: { label: "Week Off", short: "WO", className: "bg-slate-100 text-slate-500" },
};

/** Report catalogue — the five groups from the PagarBook Reports page. */
export interface ReportGroup {
  key: string;
  title: string;
  icon: string;
  reports: { name: string; desc: string }[];
}

export const PAYROLL_REPORT_GROUPS: ReportGroup[] = [
  {
    key: "attendance",
    title: "Attendance & Leave",
    icon: "calendar",
    reports: [
      { name: "Muster Roll & Daily Logs", desc: "Monthly & daily attendance, punch in/out, selfie/location logs, shift details." },
      { name: "Leave Management", desc: "Applied leaves, balances, summaries and sandwich-leave deductions." },
      { name: "Attendance Audit", desc: "Shift performance, worked hours, overtime, early-outs and late-fine logs." },
    ],
  },
  {
    key: "payroll",
    title: "Payroll & Finance",
    icon: "wallet",
    reports: [
      { name: "Payroll Logs", desc: "Monthly staff payroll statements and component-wise breakdowns." },
      { name: "Salary Slips & Transfers", desc: "Bulk salary slips, reimbursement slips, RTGS bank-transfer export." },
      { name: "Deductions & Advances", desc: "Advance payouts, staff fines, overtime earnings and loan summaries." },
    ],
  },
  {
    key: "statutory",
    title: "Statutory & Compliance",
    icon: "shield",
    reports: [
      { name: "PF & ESIC", desc: "Monthly PF txt for the EPFO portal and ESIC contributions." },
      { name: "PT & LWF", desc: "State-wise Professional Tax and Labour Welfare Fund liability summaries." },
      { name: "Compliance Overtime", desc: "Government-standard overtime records for regulatory compliance." },
    ],
  },
  {
    key: "performance",
    title: "Performance, Goals & Assets",
    icon: "trophy",
    reports: [
      { name: "Scorecards & Leaderboards", desc: "Rank staff on attendance, punctuality and discipline." },
      { name: "Goals & OKRs", desc: "Track KRA progress and measurable KPIs across cycles." },
      { name: "Asset Tracking", desc: "Assets assigned to employees, inventory status and warranty." },
    ],
  },
  {
    key: "hr",
    title: "HR & Miscellaneous",
    icon: "users",
    reports: [
      { name: "Staff Lifecycle", desc: "Joining, probation, designation-change and exit reports." },
      { name: "HR MIS & Details", desc: "Employee profiles, salary structure, bank accounts, birthdays." },
      { name: "Field Work & Tasks", desc: "Field-work entries, location routes and task proof reports." },
    ],
  },
];

/** The "Others" hub tiles. */
export const OTHERS_TILES: { name: string; desc: string; icon: string }[] = [
  { name: "Employment Letters", desc: "Offer, appointment, relieving and experience letters from templates.", icon: "file" },
  { name: "Active Sessions", desc: "Monitor staff web/mobile logins and revoke sessions remotely.", icon: "shield" },
  { name: "Asset Management", desc: "Assign laptops, phones, ID cards; track inventory and recovery.", icon: "grid" },
  { name: "Cashbook", desc: "Log daily cash paid out and received with a running balance.", icon: "wallet" },
  { name: "Goals", desc: "Set and monitor measurable Goals, KPIs and KRAs per staff.", icon: "trophy" },
  { name: "Performance Templates", desc: "Build evaluation templates and run structured review cycles.", icon: "check" },
  { name: "Scorecard", desc: "Live leaderboard ranking staff on punctuality and discipline.", icon: "trophy" },
  { name: "Job Posts", desc: "Publish job openings, share links and track applications.", icon: "users" },
  { name: "Celebrations", desc: "Alerts for upcoming birthdays and work anniversaries.", icon: "gift" },
];

/** Departments used to seed and group a construction company's workforce. */
export const DEPARTMENTS = [
  "Site Execution",
  "Civil",
  "Electrical",
  "Plumbing",
  "Safety",
  "Store & Logistics",
  "Accounts",
  "Administration",
];

/** Designations offered in the Add-Staff form. */
export const DESIGNATIONS = [
  "Site Engineer",
  "Project Manager",
  "Supervisor",
  "Foreman",
  "Mason",
  "Electrician",
  "Plumber",
  "Safety Officer",
  "Store Keeper",
  "Accountant",
  "Helper",
  "Labour",
];
