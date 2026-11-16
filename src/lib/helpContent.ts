/**
 * KAN-98: the Help module's content — one entry per ERP module, the concept in plain words, the
 * steps people actually ask about, and a video slot.
 *
 * `video` takes a YouTube / Vimeo / MP4 link. Until the client's videos are recorded the slot reads
 * "Video coming soon"; adding one is a one-line change here.
 */
export interface HelpTopic {
  key: string;
  module: string;
  /** Sidebar route the topic is about — "Open module" links here. */
  href: string;
  summary: string;
  concepts: string[];
  howTo: { q: string; steps: string[] }[];
  video?: string | null;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    key: "tender",
    module: "Tender",
    href: "/tender",
    summary: "Every tender from the portal to the work order: sort, research, apply, then win or lose — and hand a won tender over to a project.",
    concepts: [
      "Pipeline board: Sorting → Research → Applied → Won / Completed, or Lost / Cancelled. Drag a card to move it; Lost asks why.",
      "Health Analysis prices each BOQ item (material, labour, machinery) and shows the margin at your bid %.",
      "EMD register, document tracker and hard-copy tracker keep the paperwork for each tender in one place.",
      "A won tender becomes a project with its BOQ and targets in one click.",
    ],
    howTo: [
      { q: "Add a tender", steps: ["Tender → Pipeline → New tender", "Fill the department, tender ID, name of work, due date", "Save — it lands in Sorting"] },
      { q: "See overdue tenders", steps: ["Pipeline → Due date filter → passed (or all)"] },
      { q: "Turn a won tender into a project", steps: ["Drag it to Won (or Mark Won)", "Click Create project on its card", "Pick what to carry across — BOQ, targets"] },
    ],
  },
  {
    key: "project",
    module: "Project",
    href: "/project",
    summary: "One page per site: BOQ, targets and progress, transactions, parties, material, staff, attendance and files.",
    concepts: [
      "BOQ is organised in titles (Earthwork, Pipe laying…) with items inside; each item can have a target that measures progress.",
      "Target progress is reported in quantity against a BOQ line; the project's % follows the value of work done.",
      "Material tab is the site store: receive from POs, transfer, consume, and raise material requests.",
      "Office staff see every project; site staff see only the projects they are members of.",
    ],
    howTo: [
      { q: "Import a BOQ", steps: ["Project → BOQ → Import BOQ (Excel / PDF / OCR)", "Pick the Excel, PDF or a photo", "Check the rows, choose the title, Import"] },
      { q: "Report or correct progress", steps: ["Project → Target → open a target", "+ Progress to add; the pencil edits an entry"] },
    ],
  },
  {
    key: "taskopad",
    module: "Taskopad",
    href: "/taskopad",
    summary: "Tasks with assignees, due dates, checklists and approval of completion — plus a daily checklist that must be ticked before punch-out.",
    concepts: [
      "A task moves To Do → In Progress → Done; completion can need approval up the role ladder.",
      "Checklists repeat daily, weekly, monthly or by financial quarter / half / year.",
    ],
    howTo: [{ q: "Create a task", steps: ["Taskopad → + Task", "Assign people, set a due date, add checklist items", "Save — assignees are notified"] }],
  },
  {
    key: "vyapar",
    module: "Vyapar (Accounts)",
    href: "/vyapar",
    summary: "Sales, purchases, expenses, payments, bank and reports — the books of the company, project-wise.",
    concepts: [
      "Parties are customers and suppliers; their balance is what they owe you or you owe them.",
      "Sale invoices, purchase bills, orders, estimates, challans and returns all share one form.",
      "Payment-In / Payment-Out can be linked to the bills they settle; anything unlinked stays as an advance.",
      "Purchase orders and other documents can go through Multi Level Approval (Settings).",
      "Reports: Day Book, party statement, GST reports, profit & loss and more — all printable in the Vyapar layout.",
    ],
    howTo: [
      { q: "Record a purchase bill", steps: ["Vyapar → Purchase → Purchase Bills → Add", "Pick the party and project, add items, Payment For, save"] },
      { q: "Edit a payment's date", steps: ["Vyapar → Payment-Out (or In) → three dots → Edit"] },
      { q: "Set predefined Terms & Conditions", steps: ["Vyapar → Settings → Transaction → Terms & Conditions formats", "Fill a text per title; picking that title on a document fills it in"] },
    ],
  },
  {
    key: "procurement",
    module: "Procurement",
    href: "/procurement",
    summary: "Material requests → RFQ → quotes comparison → purchase order → receipt, and subcontract work orders with running bills.",
    concepts: [
      "An RFQ goes to several suppliers; Compare shows their quotes side by side with an AI view.",
      "Award a supplier and the PO is raised in one click.",
      "Work orders are subcontracts: items with rates; the subcontractor's running bills pick those items and track billed / un-billed quantity.",
    ],
    howTo: [
      { q: "Record a subcontractor bill", steps: ["Procurement → Work Order → open it → Bills → Subcon Bill", "Tick the items done, Next", "Enter quantity and rate, tax, deduction, retention", "Save — Book carries it into Vyapar"] },
      { q: "Reuse an address on a PO", steps: ["PO → Bill To / Ship To → Saved address"] },
    ],
  },
  {
    key: "payroll",
    module: "Payroll",
    href: "/payroll",
    summary: "Staff, attendance by punch (with selfie and location), leave, loans, reimbursements, salary runs and payslips.",
    concepts: [
      "Each person has a payroll profile: salary structure, shift, holiday policy and leave policy.",
      "Attendance comes from punches; HR can mark or correct days.",
      "Leave goes through the approval chain set for the person's office/site.",
      "My pages (My Attendance, My Leave, Payslips) are the employee's own self-service.",
    ],
    howTo: [
      { q: "Apply for leave", steps: ["Payroll → My Leave → Apply", "Pick the type and dates, add a reason, send"] },
      { q: "Run payroll", steps: ["Payroll → Run → pick the month", "Check attendance-based pay, approve, pay"] },
    ],
  },
  {
    key: "warehouse",
    module: "Warehouse",
    href: "/warehouse",
    summary: "Stores and stock: receipts, issues, transfers between stores and sites, and material requests.",
    concepts: ["Every movement is recorded against a store; stock is the sum of movements.", "Low-stock levels raise alerts."],
    howTo: [{ q: "Transfer material to a site", steps: ["Warehouse → Transfer", "Pick the items and the site store, dispatch", "The site receives it from its Material tab"] }],
  },
  {
    key: "approvals",
    module: "Approvals",
    href: "/approvals",
    summary: "Everything waiting on you — POs, bills, payments, leave, payroll runs, tender moves — and everything you raised.",
    concepts: [
      "Chains are set in Settings → Multi Level Approval, per document type and optionally per office/site.",
      "You are notified when something needs you, when a level below approves, and when it is finally approved or rejected.",
      "Super Admin's own documents are approved automatically.",
    ],
    howTo: [{ q: "Approve a request", steps: ["Approvals → Waiting on me", "Open it, check the details and attachments", "Approve or Reject with a note"] }],
  },
  {
    key: "settings",
    module: "Settings",
    href: "/settings",
    summary: "Users, roles & access, companies, approval chains and company profile.",
    concepts: [
      "Roles & Access: switch modules on/off per role and pick View / Create / Edit per feature.",
      "Companies: each company has its own books and staff; a person can work in more than one.",
    ],
    howTo: [{ q: "Give a role access to project material", steps: ["Settings → Roles & Access → the role → Project → Material", "Tick View / Create / Edit, Save"] }],
  },
];
