/**
 * Tender health analysis — the domain model behind the client's estimating sheet.
 *
 * <p>One `TenderAnalysis` hangs off one `Tender` and answers a single question: <em>how far below
 * the department's estimate can we bid and still make money?</em>
 *
 * <p><b>Everything is priced on the item.</b> The workbook kept labour and material as separate
 * sheets that had to be reconciled against the BOQ by hand — the commonest way for the three to
 * drift apart. Here a line carries its own material, labour and other rates alongside the tender
 * rate, so a line's margin is readable on the line and the totals cannot disagree with it. Only
 * site overheads stay separate, because they genuinely are not per-item.
 *
 * <p>Nothing derived is stored. Amounts, margins, group subtotals, break-even — all computed in
 * tenderAnalysisCalc.ts, so a rate edit can never leave a stale total behind.
 */

/** Site overheads are quoted either as a share of the tender value or as a flat sum. */
export type ExpenseBasis = "PCT_OF_TENDER" | "FLAT";

/** An analysis is editable until it is marked final — after which the bid is a matter of record. */
export type AnalysisStatus = "DRAFT" | "FINAL";

/** The three cost components a line can carry. Used to drive the rate columns generically. */
export type CostComponent = "materialRate" | "labourRate" | "otherRate";

export const COST_COMPONENTS: { key: CostComponent; label: string; short: string }[] = [
  { key: "materialRate", label: "Material rate", short: "Material" },
  { key: "labourRate", label: "Labour rate", short: "Labour" },
  { key: "otherRate", label: "Other rate", short: "Other" },
];

/**
 * One priced line of the department's BOQ, with what it costs us to do.
 *
 * <p>The cost rates are nullable rather than zero because "not worked out yet" and "costs nothing"
 * are different answers, and an analysis that treats the first as the second reads as wildly
 * profitable right up until someone checks it.
 */
export interface BoqLine {
  id: string;
  /** As printed in the tender document — "7a", "12", "16c". Not unique enough to be the id. */
  srNo: string;
  /** The item family this line rolls up into. See BoqGroup. */
  groupKey: string;
  description: string;
  qty: number;
  unit: string;
  /** The department's rate. This is revenue. */
  rate: number;

  /** What the material for one unit costs us. */
  materialRate: number | null;
  /** What the labour for one unit costs us. */
  labourRate: number | null;
  /** Machinery, subcontract, carriage — anything that is neither material nor labour. */
  otherRate: number | null;

  /** Rate-library row this was matched to, when it came from there. */
  libraryItemId?: string | null;
  /** Free-text note against the line — a make, a supplier, a caveat on the rate. */
  note?: string | null;
}

/**
 * An item family — "DI K7 pipe supply", "sluice valve supply".
 *
 * <p>These come from the sheet's own `Sub Total` SUM() ranges rather than from the Sr No prefixes,
 * because the two disagree: rows 1–6 are a single excavation family with no shared prefix. The
 * subtotal is where the client's own eye lands, so it is what we group by.
 */
export interface BoqGroup {
  key: string;
  label: string;
}

/** A site overhead — profit reserve, supervision, RMC. Percentages are of the tender value. */
export interface ExpenseLine {
  id: string;
  item: string;
  basis: ExpenseBasis;
  /** Percent when PCT_OF_TENDER (5 = 5%), rupees when FLAT. */
  value: number;
}

/** A saved bid position, so aggressive/likely/safe can be compared side by side. */
export interface AnalysisScenario {
  id: string;
  name: string;
  /** Discount below the department estimate, in percent. 11.47 = bid 11.47% below. */
  bidPct: number;
}

export interface TenderAnalysis {
  id: string;
  /** Tender.id — the app's own key, not the portal number. */
  tenderRef: string;
  /** The portal tender number. Also the fallback key when backend ids are reassigned. */
  tenderId: string;
  title: string;
  /**
   * The bid, as a discount below the department's estimate in percent. Positive is below (the
   * normal case in a government tender); negative would be a bid above estimate.
   */
  bidPct: number;
  status: AnalysisStatus;
  boqLines: BoqLine[];
  groups: BoqGroup[];
  expenseLines: ExpenseLine[];
  scenarios: AnalysisScenario[];
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A rate the firm has used before, keyed by item + unit.
 *
 * <p>The workbook is 50 sheets of the same items priced over and over; this is that knowledge
 * turned into something queryable. Matching is on name + unit rather than a hard link to the
 * Vyapar/Procurement catalogue — the tender item names are far messier than the stock catalogue,
 * and blocking this feature on that cleanup would be the wrong trade.
 */
export interface RateLibraryItem {
  id: string;
  name: string;
  unit: string;
  labourRate: number | null;
  materialRate: number | null;
  otherRate?: number | null;
  /** How many sheets across the workbook priced this item. A proxy for how trustworthy the rate is. */
  usageCount: number;
  /** Which tenders/sheets it came from, for provenance. */
  sourceSheets: string[];
  lastUsedAt?: string | null;
}

/* ---------------- derived shapes (computed, never stored) ---------------- */

/** How a bid reads at a glance. Drives the chip colour everywhere a tender appears. */
export type HealthBand = "strong" | "thin" | "risk" | "none";

export interface BoqLineCalc {
  line: BoqLine;
  /** qty × rate — what the department pays for this line. */
  amount: number;
  /** material + labour + other, per unit. Null when none of the three has been worked out. */
  costRate: number | null;
  /** qty × costRate. */
  costAmount: number;
  /** rate − costRate, or null when the line has not been costed. */
  marginPerUnit: number | null;
  lineMargin: number | null;
  /** True once any cost component has been entered. */
  priced: boolean;
  /** True when we would be paid less than it costs us. */
  isLoss: boolean;
}

export interface BoqGroupCalc {
  key: string;
  label: string;
  lines: BoqLineCalc[];
  amount: number;
  costAmount: number;
  /** Null when no line in the family has been costed. */
  margin: number | null;
  lossCount: number;
}

export interface AnalysisTotals {
  /** What the department would pay at its own rates. */
  tenderValue: number;
  material: number;
  labour: number;
  other: number;
  /** material + labour + other — everything priced on the items. */
  directCost: number;
  expenses: number;
  cost: number;
  marginAtEstimate: number;
  marginPctAtEstimate: number;

  bidPct: number;
  revenueAtBid: number;
  profitAtBid: number;
  profitPctAtBid: number;

  /** The discount at which profit reaches zero. Bid past this and the job loses money. */
  breakEvenPct: number;
  band: HealthBand;
  lossLineCount: number;
  /** BOQ lines with at least one cost rate entered, over the total — how complete the analysis is. */
  linesPriced: number;
  linesTotal: number;
}
