/**
 * The Tender module's structure: the left-rail tree. Mirrors the client's tender-analysis
 * workbook — the pipeline (Sorting → Research → Applied) plus the trackers that ride alongside
 * an applied tender (milestones, documents, hardcopy), the money view, and the reference data.
 */

export interface TenderNavNode {
  label: string;
  href?: string;
  /** Roles & Access feature this screen needs ("TENDER_TRACKER"); hidden from roles without it. */
  feature?: string | string[];
  icon?: string;
  /** Section break rendered above this item. */
  section?: string;
  /**
   * Live counter shown on the right of the item:
   *   "due:SORTING" — tenders in that stage due within a week
   *   "emd"         — EMD sitting against decided tenders with no refund recorded
   *   "approvals"   — stage moves waiting on the signed-in user
   */
  badge?: "due:SORTING" | "due:RESEARCH" | "due:APPLIED" | "due:PIPELINE" | "emd" | "approvals";
  /** Other routes that should light this item up (the pipeline's table views). */
  activeAlso?: string[];
}

export const TENDER_NAV: TenderNavNode[] = [
  { label: "Dashboard", href: "/tender", icon: "home" },
  // Stage moves parked on the approval ladder. They used to be visible only inside each tender
  // drawer, so an approver had no way to find what was waiting on them.
  { label: "Approvals", href: "/tender/approvals", feature: "TENDER_TENDERS", icon: "approval", badge: "approvals" },

  // The pipeline is one kanban board — Sorting → Research → Applied → Won → Lost — instead of a rail
  // entry per stage. The per-stage tables still exist (each column's "List" link) for bulk moves and
  // exports. A won tender leaves this module entirely — it becomes a record in the existing Project
  // module, reached from the tender itself; Tender owns bidding, Project owns execution.
  {
    label: "Pipeline",
    href: "/tender/pipeline",
    feature: "TENDER_TENDERS",
    icon: "filter",
    section: "Pipeline",
    badge: "due:PIPELINE",
    activeAlso: ["/tender/sorting", "/tender/research", "/tender/applied"],
  },
  // Costing sits inside the pipeline rather than beside it: analysis *is* the research step, and
  // the bid percentage it produces is what the Applied stage records.
  { label: "Health Analysis", href: "/tender/analysis", feature: "TENDER_ANALYSIS", icon: "clipboard" },

  // Time and money.
  { label: "Calendar", href: "/tender/calendar", feature: "TENDER_TENDERS", icon: "calendar", section: "Planning" },
  { label: "EMD Register", href: "/tender/emd", feature: "TENDER_TENDERS", icon: "bank", badge: "emd" },

  // Trackers for applied / won tenders.
  { label: "Status Tracker", href: "/tender/tracker", feature: "TENDER_TRACKER", icon: "check", section: "Trackers" },
  { label: "Documents", href: "/tender/documents", feature: "TENDER_DOCUMENTS", icon: "file" },
  { label: "Hardcopy", href: "/tender/hardcopy", feature: "TENDER_DOCUMENTS", icon: "truck" },

  // Reference data and configuration.
  { label: "Materials", href: "/tender/materials", feature: "TENDER_MATERIALS", icon: "boxes", section: "Reference" },
  { label: "Settings", href: "/tender/settings", icon: "settings" },
];
