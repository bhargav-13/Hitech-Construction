// Tender module domain model. One `Tender` record moves through the pipeline
// (Sorting → Research → Applied → Won/Lost); winning hands off to the Project module.
// Mirrors the client's tender-analysis workbook — see tenderSeed.ts.

export type TenderSource = "PORTAL" | "GEM";

/**
 * Where a tender sits in the funnel, in flow order: Sorting (first-pass analysis) → Research
 * (deep-dive / bid decision) → Applied (bid submitted) → Won / Lost. The allowed moves between
 * these are defined once in tenderStateMachine.ts — this type is just the set of states.
 */
export type TenderStage = "SORTING" | "RESEARCH" | "APPLIED" | "WON" | "LOST";

/** Sub-status once a tender has been applied to. Decoded from the workbook's STATUS column. */
export type TenderStatus =
  | "SUBMITTED"
  | "TECH_OPENED"
  | "TECH_QUALIFIED"
  | "TECH_DISQUALIFIED"
  | "WON"
  | "LOST"
  | "RETENDERED"
  | "CANCELLED"
  | "COMPLETED";

/**
 * How the EMD was furnished. The workbook's EMD TYPE column mixed this with payment *status*
 * ("Done", "Online", "F.D.R.", …) — the seed generator now splits the two, because blocked-capital
 * reporting needs the instrument (FDR/BG stay blocked) separate from whether it has been paid.
 */
export type EmdMode = "ONLINE" | "DD" | "FDR" | "BG" | "EXEMPT";

/** Lifecycle of the EMD money itself. RELEASED is what makes an EMD stop counting as blocked. */
export type EmdState = "PENDING" | "PAID" | "RELEASED" | "FORFEITED";

/** Instrument used for the security / additional-security deposit. */
export type SecurityType = "FDR" | "BG" | "CASH";

/** Why a tender ended up in LOST. Captured on every transition into that stage. */
export type LossReason =
  | "PRICE_TOO_HIGH"
  | "TECHNICALLY_DISQUALIFIED"
  | "PQ_NOT_MET"
  | "CLASS_NOT_MET"
  | "DEADLINE_MISSED"
  | "NOT_PURSUED"
  | "CANCELLED_BY_DEPT"
  | "RETENDERED"
  | "OTHER";

/** Bid priority. The GeM sheet had this column (with a "Meduim" typo) — normalised and applied to all sources. */
export type TenderPriority = "HIGH" | "MEDIUM" | "LOW";

export interface Tender {
  id: string;
  source: TenderSource;
  stage: TenderStage;
  status?: TenderStatus | null;
  /** Verbatim status text from the source sheet, for display fidelity. */
  statusLabel?: string | null;

  department?: string | null;
  tenderId: string;
  nameOfWork?: string | null;
  location?: string | null;
  officeAddress?: string | null;

  estimatedCost?: number | null;
  contractValue?: number | null;
  /** Bid variance vs estimate, %. */
  variancePct?: number | null;

  duration?: string | null;
  /** Parsed from `duration` ("9 months" → 9) so completion dates can be derived. */
  durationMonths?: number | null;
  deadline?: string | null;
  /** Next chase date on this tender — colour-coded by how far off it is (see followUpTone). */
  nextFollowUp?: string | null;
  dueDate?: string | null;
  submissionDate?: string | null;
  hardcopyDue?: string | null;
  techOpen?: string | null;
  priceOpen?: string | null;
  /** Bid validity — sometimes a day count (180), sometimes text ("120 days"). */
  validity?: string | number | null;
  /** Parsed from `validity` ("120 DAYS" → 120). */
  validityDays?: number | null;
  dlp?: string | null;
  /** GeM bid opening date (GEM SORTING sheet). */
  openingDate?: string | null;
  /** Date extracted from the free-text `preBidInfo`, so pre-bid meetings can reach the calendar. */
  preBidDate?: string | null;

  fee?: number | null;

  emd?: number | null;
  /** @deprecated Raw EMD TYPE text from the sheet. Read `emdMode` / `emdState` instead. */
  emdType?: string | null;
  emdMode?: EmdMode | null;
  emdState?: EmdState | null;
  emdPaidOn?: string | null;
  /** Without this an EMD can never stop counting as blocked capital. */
  emdReleasedOn?: string | null;
  /** FDR / BG reference number. */
  emdInstrumentNo?: string | null;
  /** FDR maturity or BG validity date. */
  emdExpiry?: string | null;

  pqCriteria?: string | null;
  classReq?: string | null;
  gst?: string | null;
  labTest?: string | null;
  priceEscalation?: string | null;
  depositDetails?: string | null;
  preBidInfo?: string | null;
  firm?: string | null;

  /** @deprecated Raw multi-line SECURITY DETAILS blob. Read the parsed fields below. */
  securityDetails?: string | null;
  securityType?: SecurityType | null;
  securityAmount?: number | null;
  additionalSecurityType?: SecurityType | null;
  additionalSecurityAmount?: number | null;
  bgCharges?: number | null;
  securityReleasedOn?: string | null;

  // Applied-stage fields
  receivedStatus?: string | null;
  dateOfReceived?: string | null;
  priceBidStage?: string | null;

  // Outcome intelligence — none of this exists in the workbook; it is why the app beats the sheet.
  lossReason?: LossReason | null;
  lossNote?: string | null;
  /** Who won it, and at what price. Feeds the competitor report. */
  l1Bidder?: string | null;
  l1Value?: number | null;
  /** Our rank in the price bid (1 = L1). */
  ourRank?: number | null;

  // GeM-only fields
  gemCategory?: string | null;
  msmeRelaxation?: string | null;
  experienceTurnover?: string | null;
  eligibilityStatus?: string | null;
  priority?: TenderPriority | null;

  stageDocuments?: string | null;
  uploadedDocuments?: string | null;
  viewDocuments?: string | null;
  /** Files attached in-app (data URLs — UI-only until there is a backend to store them). */
  attachments?: TenderAttachment[];
  remarks?: string | null;

  /** Set when a WON tender has been promoted into the Project module. */
  projectId?: number | null;
}

/** A file attached to a tender. `dataUrl` is only viable while the module is UI-only. */
export interface TenderAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  addedOn: string;
  dataUrl: string;
}

/** A single soft-copy / hard-copy availability flag pair, from the Document Status sheet. */
export interface DocPair {
  soft: boolean;
  hard: boolean;
}

/**
 * A configurable column in the Status / Documentation trackers. The set of steps is editable at
 * runtime (add anywhere, rename, remove), so `key` is an opaque string — the seed's fixed keys
 * ("analysis", "fee", …) plus any custom `tstep-*` keys the user adds later.
 */
export interface TrackerStep {
  key: string;
  label: string;
}

/**
 * Milestone checklist for an applied/won tender (Status sheet). Completion is stored per-step keyed
 * by the tracker step's `key`; the index signature lets custom (runtime-added) steps live alongside
 * the seed's original boolean fields.
 */
export interface TenderMilestones {
  id: string;
  tenderId: string;
  nameOfWork?: string | null;
  workStartDate?: string | null;
  progress?: string | null;
  /** Per-step completion — keyed by TrackerStep.key. Seeded keys are analysis/fee/emd/… */
  [key: string]: unknown;
}

/** Default milestone steps — seeded into the store, then user-editable. */
export const MILESTONE_STEPS: TrackerStep[] = [
  { key: "analysis", label: "Analysis" },
  { key: "fee", label: "Fee" },
  { key: "emd", label: "EMD" },
  { key: "applied", label: "Applied" },
  { key: "techBid", label: "Tech Bid" },
  { key: "priceBid", label: "Price Bid" },
  { key: "loa", label: "LOA" },
  { key: "security", label: "Security" },
  { key: "additionalSecurity", label: "Add. Security" },
  { key: "agreement", label: "Agreement" },
  { key: "workOrder", label: "Work Order" },
];

/**
 * Documentation tracker for a won tender (Document Status sheet). Each document category's soft/hard
 * status is stored keyed by its TrackerStep.key; the index signature lets custom (runtime-added)
 * document types live alongside the seed's original DocPair fields.
 */
export interface TenderDocuments {
  id: string;
  tenderId: string;
  nameOfWork?: string | null;
  /**
   * Running-account bills. The workbook laid out 5 columns but one project is already on its 6th
   * bill, so this is unbounded — never index it against a fixed label list.
   */
  raBills: DocPair[];
  progress?: string | null;
  viewDocuments?: string | null;
  /** Per-document-type soft/hard status — keyed by TrackerStep.key (competitiveReport, …). */
  [key: string]: unknown;
}

/** Default document categories (excludes raBills, handled separately) — seeded, then user-editable. */
export const DOCUMENT_STEPS: TrackerStep[] = [
  { key: "competitiveReport", label: "Competitive Report" },
  { key: "letterOfAcceptance", label: "Letter of Acceptance" },
  { key: "securityDeposit", label: "Security Deposit" },
  { key: "stampDutyAgreement", label: "Stamp Duty / Agreement" },
  { key: "workOrder", label: "Work Order" },
  { key: "generalCorrespondence", label: "General Correspondence" },
  { key: "finalBill", label: "Final Bill" },
  { key: "form3a", label: "Form 3A Certificate" },
];

/** Ordinal label for the nth running-account bill — unbounded, unlike the workbook's 5 columns. */
export function raLabel(index: number): string {
  const n = index + 1;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Hardcopy dispatch/courier tracking record (Hardcopy Tracker sheet). */
export interface HardcopyDispatch {
  id: string;
  /** Link to the tender. The source sheet had no such column — it matched on name of work alone. */
  tenderId?: string | null;
  date?: string | null;
  nameOfWork?: string | null;
  documentList?: string | null;
  packedBy?: string | null;
  dispatchBy?: string | null;
  trackingNo?: string | null;
  /** "ARRIVED" | "NOT ARRIVED" | free text. */
  arrived?: string | null;
  arrivedDate?: string | null;
  remarks?: string | null;
}

export interface MaterialParty {
  id: string;
  party?: string | null;
  manufacturerType?: string | null;
  make?: string | null;
  location?: string | null;
  contact?: string | null;
  email?: string | null;
}

/**
 * Record of a won tender being converted into a project in the **Project module**.
 *
 * Tender does not keep its own project list — execution is tracked in `/project`, which is
 * backend-backed. This is only the link plus the commercial payload that was pushed across, kept so
 * the conversion is auditable and can be retried if the project API was unreachable at the time.
 */
export interface TenderHandoff {
  id: string;
  /** Tender.id (not the portal tender number). */
  tenderRef: string;
  tenderId: string;
  /** Id in the Project module. Negative = created locally because the backend was unavailable. */
  projectId?: number | null;
  nameOfWork?: string | null;
  clientName?: string | null;
  location?: string | null;
  contractValue?: number | null;
  workOrderDate?: string | null;
  completionPeriod?: string | null;
  /** Derived: workOrderDate + durationMonths. */
  completionDate?: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  finalBillValue?: number | null;
  handedOverAt: string;
  /** False when only the bare create succeeded and the commercial fields still need pushing. */
  synced: boolean;
}

/* ---------- reporting buckets ---------- */

/**
 * The eight buckets the client's `Dashboard Data` sheet reports on. These are *derived* from
 * stage + status rather than stored, so the five-state pipeline stays simple while the dashboard
 * still speaks the client's language. See tenderMetrics.bucketOf.
 */
export type TenderBucket =
  | "SHORTLISTED"
  | "UNDER_RESEARCH"
  | "APPLIED"
  | "UNDER_REVIEW"
  | "CANCELLED_RETENDERED"
  | "WON"
  | "COMPLETED"
  | "LOST";

export const BUCKET_ORDER: TenderBucket[] = [
  "SHORTLISTED",
  "UNDER_RESEARCH",
  "APPLIED",
  "UNDER_REVIEW",
  "CANCELLED_RETENDERED",
  "WON",
  "COMPLETED",
  "LOST",
];

export const BUCKET_META: Record<TenderBucket, { label: string; bar: string; chip: string }> = {
  SHORTLISTED: { label: "Shortlisted", bar: "bg-slate-400", chip: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  UNDER_RESEARCH: { label: "Under Research", bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  APPLIED: { label: "Applied", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  UNDER_REVIEW: { label: "Under Review", bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  CANCELLED_RETENDERED: { label: "Cancelled / Retendered", bar: "bg-gray-400", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
  WON: { label: "Won", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  COMPLETED: { label: "Completed", bar: "bg-teal-500", chip: "bg-teal-50 text-teal-700 ring-teal-600/20" },
  LOST: { label: "Lost", bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

/* ---------- display meta ---------- */

export const STAGE_META: Record<TenderStage, { label: string; dot: string; chip: string }> = {
  SORTING: { label: "Sorting", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  RESEARCH: { label: "Research", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  APPLIED: { label: "Applied", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  WON: { label: "Won", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  LOST: { label: "Lost", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

export const STATUS_META: Record<TenderStatus, { label: string; chip: string }> = {
  SUBMITTED: { label: "Submitted / Under Review", chip: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  TECH_OPENED: { label: "Technical Opened", chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  TECH_QUALIFIED: { label: "Technically Qualified", chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  TECH_DISQUALIFIED: { label: "Technically Disqualified", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  WON: { label: "Awarded (Win)", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  LOST: { label: "Lost", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  RETENDERED: { label: "Retendered", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  CANCELLED: { label: "Cancelled", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
  COMPLETED: { label: "Completed", chip: "bg-teal-50 text-teal-700 ring-teal-600/20" },
};

export const SOURCE_META: Record<TenderSource, { label: string; chip: string }> = {
  PORTAL: { label: "Portal", chip: "bg-cyan-50 text-brand-accent ring-cyan-600/20" },
  GEM: { label: "GeM", chip: "bg-purple-50 text-purple-700 ring-purple-600/20" },
};

export const EMD_MODE_META: Record<EmdMode, { label: string; chip: string }> = {
  ONLINE: { label: "Online", chip: "bg-cyan-50 text-brand-accent ring-cyan-600/20" },
  DD: { label: "Demand Draft", chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  FDR: { label: "FDR", chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  BG: { label: "Bank Guarantee", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  EXEMPT: { label: "Exempt", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
};

export const EMD_STATE_META: Record<EmdState, { label: string; chip: string }> = {
  PENDING: { label: "Pending", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
  PAID: { label: "Paid — blocked", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  RELEASED: { label: "Released", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  FORFEITED: { label: "Forfeited", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

export const SECURITY_TYPE_META: Record<SecurityType, { label: string }> = {
  FDR: { label: "F.D.R." },
  BG: { label: "Bank Guarantee" },
  CASH: { label: "Cash / Online" },
};

export const LOSS_REASON_META: Record<LossReason, { label: string; hint: string }> = {
  PRICE_TOO_HIGH: { label: "Price too high", hint: "We were beaten on rate." },
  TECHNICALLY_DISQUALIFIED: { label: "Technically disqualified", hint: "Rejected at the technical stage." },
  PQ_NOT_MET: { label: "PQ criteria not met", hint: "Turnover / past experience shortfall." },
  CLASS_NOT_MET: { label: "Class not met", hint: "Registration class below requirement." },
  DEADLINE_MISSED: { label: "Deadline missed", hint: "Bid or hardcopy did not go in on time." },
  NOT_PURSUED: { label: "Not pursued", hint: "Deliberate decision not to bid." },
  CANCELLED_BY_DEPT: { label: "Cancelled by department", hint: "Tender withdrawn by the issuing office." },
  RETENDERED: { label: "Retendered", hint: "Floated again — may come back." },
  OTHER: { label: "Other", hint: "Explain in the note." },
};

export const PRIORITY_META: Record<TenderPriority, { label: string; chip: string }> = {
  HIGH: { label: "High", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  MEDIUM: { label: "Medium", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  LOW: { label: "Low", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
};

/** Ordered funnel stages for the dashboard. */
export const FUNNEL_ORDER: TenderStage[] = ["SORTING", "RESEARCH", "APPLIED", "WON", "LOST"];
