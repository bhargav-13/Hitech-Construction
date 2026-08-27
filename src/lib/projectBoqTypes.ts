/**
 * A project's Bill of Quantities, and the targets that execute it.
 *
 * <p>This is where a won tender lands. The BOQ item keeps the identity of the tender line it came
 * from — same description, same quantity, same unit — so the margin promised at bid time and the
 * margin being earned on site are measured on the same rows rather than in two disconnected books.
 *
 * <p><b>Targets, not tasks.</b> The project module already has tasks, and they track a percentage
 * somebody types in. A target tracks a <em>quantity</em> against a BOQ line — "18,320 of 24,750
 * Rmt laid" — which is how site work is actually reported and the only way physical progress can
 * be trusted to drive money. The two coexist: tasks are for things to do, targets are for things
 * to measure.
 */

/** How far along a target is. Derived from quantity, never set by hand. */
export type TargetStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

/** One priced line of work the client will be billed for. */
export interface BoqItem {
  id: string;
  /** Carried from the tender BOQ so the two documents can be read side by side. */
  srNo: string;
  groupKey: string;
  groupLabel: string;
  description: string;
  qty: number;
  unit: string;
  /** What the client pays per unit — the tender rate after the discount the job was won at. */
  saleRate: number;
  /** What it costs us per unit, carried across from the analysis. Zero when never costed. */
  costRate: number;
  /**
   * The slice of `costRate` that is site overhead rather than the item's own material / labour.
   *
   * <p>Overheads are the one cost the bid does not hold per line, so they are spread by value at
   * handover. Keeping the share visible means a site team can tell an item's real cost from its
   * loaded cost instead of wondering why a rate looks high.
   */
  overheadRate?: number;
  /** The target measuring this item's execution, if one was created. */
  targetId?: string | null;
  /** The tender analysis line this came from, for provenance. */
  sourceLineId?: string | null;
}

/** A single day's reported quantity. The audit trail behind a target's progress. */
export interface TargetEntry {
  id: string;
  date: string;
  qty: number;
  note: string | null;
  by: string | null;
}

/**
 * A measurable quantity goal.
 *
 * <p>Covers one BOQ item or a whole family — the client's live OnSite project runs nine targets
 * against a four-hundred-line BOQ, so per-family is the realistic default and per-line is the
 * option, not the other way round.
 */
export interface Target {
  id: string;
  name: string;
  unit: string;
  targetQty: number;
  doneQty: number;
  boqItemIds: string[];
  startDate: string | null;
  dueDate: string | null;
  assignee: string | null;
  entries: TargetEntry[];
}

export interface ProjectBoq {
  id: string;
  projectId: number;
  /** The tender this was converted from, when it came through the handoff. */
  tenderRef: string | null;
  analysisId: string | null;
  title: string;
  clientName: string | null;
  boqNo: string;
  boqDate: string;
  /** The discount the job was won at. Sale rates already reflect it; this is here to explain them. */
  bidPct: number;
  items: BoqItem[];
  targets: Target[];
  createdAt: string;
  updatedAt: string;
}

/* ---------------- derived shapes ---------------- */

export interface BoqItemCalc {
  item: BoqItem;
  /** qty × saleRate — what the client is billed when this line is complete. */
  value: number;
  /** qty × costRate — what it should cost us. */
  cost: number;
  /** saleRate − costRate. Negative means the line is priced below what it costs. */
  markup: number;
  markupPct: number;
  /** 0–1, from the target measuring this item. */
  progress: number;
  /** progress × value — earned value, the only honest measure of what a project has made. */
  doneValue: number;
  target: Target | null;
}

export interface BoqTotals {
  value: number;
  cost: number;
  markup: number;
  markupPct: number;
  doneValue: number;
  progressPct: number;
  itemCount: number;
  /** Lines whose sale rate is below what they cost — the same warning the bid analysis raised. */
  lossCount: number;
  targetCount: number;
  targetsComplete: number;
}
