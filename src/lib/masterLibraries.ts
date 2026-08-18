/**
 * Master libraries — the small reference tables the rest of the ERP picks values from (cost codes,
 * rates, deduction heads, progress stages…). Onsite keeps each of these as its own "Library"; we
 * expose the same set from one screen, chosen by the dropdown at the top of /library.
 *
 * They're all the same shape of thing — a flat list of rows over a handful of typed columns — so
 * rather than eleven near-identical screens there's one schema-driven table (`MasterLibrary`) and
 * this file holds the schema. Adding a library is adding a spec here.
 *
 * Storage is client-side for now (same reasoning as useItemMasters / usePartySettings): none of
 * these have backend endpoints yet, and the values are per-firm reference data, not transactions.
 * When the endpoints land, `useMasterLibrary` is the single place that changes.
 *
 * Party, Material and Material Category are deliberately NOT here — those already have real
 * records elsewhere (members + Vyapar parties, Vyapar items) and get their own components rather
 * than a second copy of the data.
 */

/** The libraries backed by this generic schema-driven table. */
export const MASTER_LIBRARY_IDS = [
  "asset-type",
  "cost-code",
  "deduction",
  "progress",
  "rate",
  "subcontractor-rate",
  "retention",
  "todo",
  "workforce",
] as const;
export type MasterLibraryId = (typeof MASTER_LIBRARY_IDS)[number];

/**
 * How a column is entered and rendered. `currency` and `percent` are numbers underneath — they only
 * differ in formatting and in the suffix/prefix hint shown on the form.
 */
export type MasterFieldType = "text" | "textarea" | "number" | "currency" | "percent" | "select";

export interface MasterField {
  key: string;
  label: string;
  type: MasterFieldType;
  required?: boolean;
  /** Choices for `select`. Free text is not allowed — these are the whole point of a master. */
  options?: string[];
  placeholder?: string;
  /** Kept off the table and shown only in the add/edit form — for long text that would wreck a row. */
  formOnly?: boolean;
}

export interface MasterRow {
  /** Stable local id; the row's own columns live alongside it. */
  id: string;
  [column: string]: string | number;
}

export interface MasterLibrarySpec {
  id: MasterLibraryId;
  /** Name in the dropdown, e.g. "Cost Code Library". */
  label: string;
  /** Singular record name, used for buttons and empty states, e.g. "Cost Code". */
  noun: string;
  /** One line under the heading saying what the library is for and who consumes it. */
  blurb: string;
  fields: MasterField[];
  /** Rows a fresh install starts with, so the library is useful before anyone types into it. */
  seed: Omit<MasterRow, "id">[];
}

/** Numeric column types render right-aligned and format as money / percent. */
export function isNumericField(f: MasterField): boolean {
  return f.type === "number" || f.type === "currency" || f.type === "percent";
}

const SKILL_LEVELS = ["Unskilled", "Semi-skilled", "Skilled", "Highly skilled", "Technical"];

export const MASTER_LIBRARIES: Record<MasterLibraryId, MasterLibrarySpec> = {
  "asset-type": {
    id: "asset-type",
    label: "Asset Type Library",
    noun: "Asset Type",
    blurb: "Classes of owned asset — drives how equipment and tools are grouped and depreciated.",
    fields: [
      { key: "name", label: "Asset Type", type: "text", required: true, placeholder: "e.g. Excavator" },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: ["Vehicle", "Machinery", "Equipment", "Tools", "Electronics", "Furniture"],
      },
      { key: "depreciation", label: "Depreciation / yr", type: "percent" },
      { key: "notes", label: "Notes", type: "textarea", formOnly: true },
    ],
    seed: [
      { name: "Tipper / Dumper", category: "Vehicle", depreciation: 15, notes: "" },
      { name: "Excavator", category: "Machinery", depreciation: 15, notes: "" },
      { name: "Concrete Mixer", category: "Machinery", depreciation: 15, notes: "" },
      { name: "Vibrator / Compactor", category: "Equipment", depreciation: 20, notes: "" },
      { name: "Hand Tools", category: "Tools", depreciation: 25, notes: "" },
      { name: "Site Computer", category: "Electronics", depreciation: 40, notes: "" },
      { name: "Site Office Furniture", category: "Furniture", depreciation: 10, notes: "" },
    ],
  },

  "cost-code": {
    id: "cost-code",
    label: "Cost Code Library",
    noun: "Cost Code",
    blurb: "The chart of work heads every expense, indent and bill is booked against.",
    fields: [
      { key: "code", label: "Code", type: "text", required: true, placeholder: "e.g. CC-101" },
      { key: "description", label: "Description", type: "text", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: ["Civil", "Pipeline", "Roads", "Electrical", "Plumbing", "Finishing", "Overheads"],
      },
      { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Cum" },
    ],
    seed: [
      { code: "CC-101", description: "Earthwork & Excavation", category: "Civil", unit: "Cum" },
      { code: "CC-102", description: "PCC & RCC Work", category: "Civil", unit: "Cum" },
      { code: "CC-103", description: "Pipe Laying & Jointing", category: "Pipeline", unit: "Mtr" },
      { code: "CC-104", description: "Manhole Construction", category: "Pipeline", unit: "Nos" },
      { code: "CC-105", description: "Road Restoration", category: "Roads", unit: "Sqm" },
      { code: "CC-106", description: "Internal Electrification", category: "Electrical", unit: "Point" },
      { code: "CC-201", description: "Site Establishment & Overheads", category: "Overheads", unit: "LS" },
    ],
  },

  deduction: {
    id: "deduction",
    label: "Deduction Library",
    noun: "Deduction",
    blurb: "Standing deductions applied to running bills and subcontractor payments.",
    fields: [
      { key: "name", label: "Deduction", type: "text", required: true, placeholder: "e.g. TDS on Contract" },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        options: ["Tax", "Statutory", "Retention", "Advance Recovery", "Penalty", "Other"],
      },
      { key: "rate", label: "Rate", type: "percent", required: true },
      {
        key: "appliesTo",
        label: "Applies To",
        type: "select",
        required: true,
        options: ["Client Bill", "Subcontractor Bill", "Supplier Bill", "Salary"],
      },
      { key: "notes", label: "Notes", type: "textarea", formOnly: true },
    ],
    seed: [
      { name: "TDS on Contract", type: "Tax", rate: 2, appliesTo: "Subcontractor Bill", notes: "u/s 194C" },
      { name: "TDS on Professional Fees", type: "Tax", rate: 10, appliesTo: "Supplier Bill", notes: "u/s 194J" },
      { name: "Labour Cess", type: "Statutory", rate: 1, appliesTo: "Client Bill", notes: "" },
      { name: "Security Deposit", type: "Retention", rate: 5, appliesTo: "Client Bill", notes: "" },
      { name: "Mobilisation Advance Recovery", type: "Advance Recovery", rate: 10, appliesTo: "Subcontractor Bill", notes: "" },
      { name: "Provident Fund", type: "Statutory", rate: 12, appliesTo: "Salary", notes: "" },
    ],
  },

  progress: {
    id: "progress",
    label: "Progress Library",
    noun: "Progress Stage",
    blurb: "Named stages with weightage — how percent-complete is computed on a project.",
    fields: [
      { key: "stage", label: "Progress Stage", type: "text", required: true, placeholder: "e.g. Foundation" },
      {
        key: "workType",
        label: "Work Type",
        type: "select",
        required: true,
        options: ["Building", "Pipeline", "Road", "Common"],
      },
      { key: "weightage", label: "Weightage", type: "percent", required: true },
      { key: "sequence", label: "Sequence", type: "number", required: true },
    ],
    seed: [
      { stage: "Site Mobilisation", workType: "Common", weightage: 5, sequence: 1 },
      { stage: "Excavation", workType: "Building", weightage: 10, sequence: 2 },
      { stage: "Foundation", workType: "Building", weightage: 25, sequence: 3 },
      { stage: "Superstructure", workType: "Building", weightage: 35, sequence: 4 },
      { stage: "Finishing", workType: "Building", weightage: 25, sequence: 5 },
      { stage: "Trench & Bedding", workType: "Pipeline", weightage: 30, sequence: 2 },
      { stage: "Pipe Laying & Testing", workType: "Pipeline", weightage: 45, sequence: 3 },
      { stage: "Backfill & Restoration", workType: "Pipeline", weightage: 25, sequence: 4 },
    ],
  },

  rate: {
    id: "rate",
    label: "Rate Library",
    noun: "Rate",
    blurb: "Standard in-house rates per activity — the baseline for estimates and internal costing.",
    fields: [
      { key: "activity", label: "Activity", type: "text", required: true, placeholder: "e.g. Excavation (soft soil)" },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: ["Civil", "Pipeline", "Roads", "Electrical", "Plumbing", "Finishing"],
      },
      { key: "unit", label: "Unit", type: "text", required: true, placeholder: "e.g. Cum" },
      { key: "rate", label: "Rate", type: "currency", required: true },
      { key: "effectiveFrom", label: "Effective From", type: "text", placeholder: "e.g. Apr-2026" },
    ],
    seed: [
      { activity: "Excavation (soft soil)", category: "Civil", unit: "Cum", rate: 220, effectiveFrom: "Apr-2026" },
      { activity: "Excavation (hard rock)", category: "Civil", unit: "Cum", rate: 640, effectiveFrom: "Apr-2026" },
      { activity: "PCC 1:4:8", category: "Civil", unit: "Cum", rate: 4200, effectiveFrom: "Apr-2026" },
      { activity: "170 Dia Pipe Laying", category: "Pipeline", unit: "Mtr", rate: 450, effectiveFrom: "Apr-2026" },
      { activity: "Manhole Construction", category: "Pipeline", unit: "Nos", rate: 18500, effectiveFrom: "Apr-2026" },
      { activity: "CC Road (M20)", category: "Roads", unit: "Sqm", rate: 780, effectiveFrom: "Apr-2026" },
      { activity: "Internal Plaster (12mm)", category: "Finishing", unit: "Sqm", rate: 185, effectiveFrom: "Apr-2026" },
    ],
  },

  "subcontractor-rate": {
    id: "subcontractor-rate",
    label: "Subcontractor Rate Library",
    noun: "Subcontractor Rate",
    blurb: "Rates we award work at — kept apart from the in-house Rate Library so margin stays visible.",
    fields: [
      { key: "workItem", label: "Work Item", type: "text", required: true, placeholder: "e.g. Shuttering & Centering" },
      {
        key: "trade",
        label: "Trade",
        type: "select",
        required: true,
        options: ["Labour Contract", "Civil", "Pipeline", "Electrical", "Plumbing", "Painting", "Fabrication"],
      },
      { key: "unit", label: "Unit", type: "text", required: true, placeholder: "e.g. Sqm" },
      { key: "rate", label: "Awarded Rate", type: "currency", required: true },
      { key: "scope", label: "Scope", type: "select", options: ["Labour only", "With material", "Turnkey"] },
    ],
    seed: [
      { workItem: "Shuttering & Centering", trade: "Civil", unit: "Sqm", rate: 245, scope: "Labour only" },
      { workItem: "Bar Bending & Fixing", trade: "Civil", unit: "MT", rate: 4800, scope: "Labour only" },
      { workItem: "Brickwork 230mm", trade: "Civil", unit: "Cum", rate: 1150, scope: "Labour only" },
      { workItem: "Trench Excavation by JCB", trade: "Pipeline", unit: "Cum", rate: 165, scope: "Turnkey" },
      { workItem: "Internal Wiring per Point", trade: "Electrical", unit: "Point", rate: 620, scope: "With material" },
      { workItem: "Two-coat Emulsion", trade: "Painting", unit: "Sqm", rate: 78, scope: "With material" },
    ],
  },

  retention: {
    id: "retention",
    label: "Retention Library",
    noun: "Retention Policy",
    blurb: "How much is held back on a bill and when it is released — attached per contract.",
    fields: [
      { key: "name", label: "Retention Policy", type: "text", required: true, placeholder: "e.g. Standard Govt Contract" },
      { key: "rate", label: "Retention", type: "percent", required: true },
      {
        key: "release",
        label: "Release Trigger",
        type: "select",
        required: true,
        options: ["On completion", "After DLP", "Split — completion & DLP", "On final bill"],
      },
      { key: "dlpMonths", label: "DLP (months)", type: "number" },
      { key: "notes", label: "Notes", type: "textarea", formOnly: true },
    ],
    seed: [
      { name: "Standard Govt Contract", rate: 5, release: "After DLP", dlpMonths: 12, notes: "" },
      { name: "RMC Works", rate: 10, release: "Split — completion & DLP", dlpMonths: 6, notes: "50% released on completion" },
      { name: "Private Client — Short", rate: 5, release: "On completion", dlpMonths: 0, notes: "" },
      { name: "Subcontractor Standard", rate: 5, release: "After DLP", dlpMonths: 6, notes: "" },
    ],
  },

  todo: {
    id: "todo",
    label: "Todo Library",
    noun: "Todo Template",
    blurb: "Reusable task templates — pick one instead of retyping the same checklist each time.",
    fields: [
      { key: "template", label: "Todo Template", type: "text", required: true, placeholder: "e.g. Site inspection checklist" },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: ["Quality", "Safety", "Procurement", "Documentation", "Billing", "Statutory"],
      },
      {
        key: "assigneeRole",
        label: "Default Assignee",
        type: "select",
        options: ["Site Engineer", "Project Manager", "Store Keeper", "Accountant", "Safety Officer"],
      },
      { key: "checklist", label: "Checklist", type: "textarea", formOnly: true, placeholder: "One item per line" },
    ],
    seed: [
      {
        template: "Site inspection checklist",
        category: "Quality",
        assigneeRole: "Site Engineer",
        checklist: "Line & level\nCover blocks\nReinforcement as per drawing\nShuttering rigidity",
      },
      { template: "Material request", category: "Procurement", assigneeRole: "Store Keeper", checklist: "" },
      {
        template: "Safety audit",
        category: "Safety",
        assigneeRole: "Safety Officer",
        checklist: "PPE compliance\nScaffolding tags\nFirst-aid box\nBarricading",
      },
      { template: "Monthly RA bill preparation", category: "Billing", assigneeRole: "Accountant", checklist: "" },
      { template: "Statutory register update", category: "Statutory", assigneeRole: "Project Manager", checklist: "" },
    ],
  },

  workforce: {
    id: "workforce",
    label: "Workforce Library",
    noun: "Workforce Role",
    blurb: "Trades and their standard day rates — the defaults behind attendance and labour costing.",
    fields: [
      { key: "role", label: "Role", type: "text", required: true, placeholder: "e.g. Mason" },
      { key: "skill", label: "Skill Level", type: "select", required: true, options: SKILL_LEVELS },
      { key: "dayRate", label: "Day Rate", type: "currency", required: true },
      { key: "otRate", label: "OT Rate / hr", type: "currency" },
    ],
    seed: [
      { role: "Mason", skill: "Skilled", dayRate: 800, otRate: 130 },
      { role: "Carpenter", skill: "Skilled", dayRate: 850, otRate: 140 },
      { role: "Bar Bender", skill: "Skilled", dayRate: 820, otRate: 135 },
      { role: "Helper", skill: "Unskilled", dayRate: 550, otRate: 90 },
      { role: "Electrician", skill: "Skilled", dayRate: 900, otRate: 150 },
      { role: "Plumber", skill: "Semi-skilled", dayRate: 700, otRate: 115 },
      { role: "Site Engineer", skill: "Technical", dayRate: 1200, otRate: 0 },
      { role: "Surveyor", skill: "Technical", dayRate: 1100, otRate: 0 },
    ],
  },
};
