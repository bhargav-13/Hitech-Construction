/**
 * Every number the Tender dashboard shows, derived from the store — nothing is stored pre-computed,
 * so an import or a single edit updates the whole dashboard live.
 *
 * The definitions here deliberately mirror the client's `Dashboard Data` sheet rather than
 * inventing our own, because they will check our figures against their workbook. Where we differ
 * on purpose (see `successRate`) the difference is surfaced in the UI, never hidden.
 */
import type { EmdMode, SecurityType, Tender, TenderBucket, LossReason } from "./tenderTypes";
import { BUCKET_ORDER } from "./tenderTypes";
import { tmonthKey, tmonthLabel, tdays } from "./tenderHelpers";

/**
 * Map a tender onto one of the client's eight reporting buckets. Their sheet separates
 * "Under Review" and "Cancelled/Retendered" from "Applied", and "Completed" from "Won" — our five
 * stages do not, so the split is derived from stage + status here.
 */
export function bucketOf(t: Tender): TenderBucket {
  if (t.stage === "SORTING") return "SHORTLISTED";
  if (t.stage === "RESEARCH") return "UNDER_RESEARCH";
  if (t.status === "RETENDERED" || t.status === "CANCELLED") return "CANCELLED_RETENDERED";
  if (t.status === "COMPLETED") return "COMPLETED";
  if (t.stage === "WON") return "WON";
  if (t.stage === "LOST") return "LOST";
  if (t.status === "SUBMITTED" || t.status === "TECH_OPENED" || t.status === "TECH_QUALIFIED") return "UNDER_REVIEW";
  return "APPLIED";
}

export interface BucketRow {
  bucket: TenderBucket;
  count: number;
  estimated: number;
  contract: number;
  fee: number;
  emd: number;
}

/** The client's "STATUS WISE TENDER ESTIMATED COST & CONTRACT VALUE" table, plus fee/EMD columns. */
export function bucketRows(tenders: Tender[]): BucketRow[] {
  const blank = () => ({ count: 0, estimated: 0, contract: 0, fee: 0, emd: 0 });
  const map = new Map<TenderBucket, ReturnType<typeof blank>>(BUCKET_ORDER.map((b) => [b, blank()]));
  for (const t of tenders) {
    const row = map.get(bucketOf(t))!;
    row.count += 1;
    row.estimated += t.estimatedCost ?? 0;
    row.contract += t.contractValue ?? 0;
    row.fee += t.fee ?? 0;
    row.emd += t.emd ?? 0;
  }
  return BUCKET_ORDER.map((bucket) => ({ bucket, ...map.get(bucket)! }));
}

export interface SuccessRate {
  /** Awarded only, matching the client's numerator. */
  won: number;
  completed: number;
  lost: number;
  /** Everything bid on, excluding cancelled/retendered. The client's denominator. */
  contested: number;
  /** Won ÷ contested — the figure their sheet reports (0.2292 on the source data). */
  rate: number;
  /** (Won + Completed) ÷ contested — arguably the truer number; shown alongside, never instead. */
  rateInclCompleted: number;
  cancelled: number;
}

/**
 * The client's sheet computes 11/48 = 22.9%: awarded ÷ (everything bid on − cancelled/retendered),
 * with Completed counted separately from Won. We report exactly that, and also the variant that
 * counts completed jobs as wins, so nobody has to guess which definition a number came from.
 */
export function successRate(tenders: Tender[]): SuccessRate {
  let won = 0, completed = 0, lost = 0, cancelled = 0, bid = 0;
  for (const t of tenders) {
    const b = bucketOf(t);
    if (b === "SHORTLISTED" || b === "UNDER_RESEARCH") continue;
    bid += 1;
    if (b === "WON") won += 1;
    else if (b === "COMPLETED") completed += 1;
    else if (b === "LOST") lost += 1;
    else if (b === "CANCELLED_RETENDERED") cancelled += 1;
  }
  const contested = bid - cancelled;
  return {
    won,
    completed,
    lost,
    cancelled,
    contested,
    rate: contested ? won / contested : 0,
    rateInclCompleted: contested ? (won + completed) / contested : 0,
  };
}

/* ---------- financial exposure ---------- */

export interface Exposure {
  /**
   * EMD paid, not released, on a tender that is still live or won — the headline "money blocked"
   * figure, matching the client's "Total block EMD". Money sitting against a *lost* bid is
   * refundable and is reported as `emdRecoverable` instead, so the two never get confused.
   */
  emdBlocked: number;
  emdByMode: Record<EmdMode, number>;
  /** EMD blocked on bids still awaiting an outcome (the sheet's "Locked EMD"). */
  emdLocked: number;
  /** EMD we will have to furnish on tenders still in the pipeline (the sheet's "Required EMD"). */
  emdRequired: number;
  /**
   * Paid EMD on a decided (lost / cancelled) tender with no recorded release. The workbook never
   * tracked refunds at all, so this is money nobody is chasing — the list is worth real cash.
   */
  emdRecoverable: number;
  securityByType: Record<SecurityType, number>;
  additionalByType: Record<SecurityType, number>;
  securityBlocked: number;
  /** Cost of carrying bank guarantees — a real expense, not blocked capital. */
  bgCharges: number;
  feeSpent: number;
  feePipeline: number;
  feeByBucket: Record<TenderBucket, number>;
  /** Everything genuinely locked up: EMD + security + additional security. */
  totalBlocked: number;
}

const zeroModes = (): Record<EmdMode, number> => ({ ONLINE: 0, DD: 0, FDR: 0, BG: 0, EXEMPT: 0 });
const zeroSecurity = (): Record<SecurityType, number> => ({ FDR: 0, BG: 0, CASH: 0 });

/** An EMD counts as blocked once paid and until it is released (forfeited money is gone, not blocked). */
export const isEmdBlocked = (t: Tender): boolean => t.emdState === "PAID" && !t.emdReleasedOn;

/** Paid EMD on a tender that is already decided against us and still not refunded. */
export const isEmdRecoverable = (t: Tender): boolean => {
  const b = bucketOf(t);
  return isEmdBlocked(t) && (b === "LOST" || b === "CANCELLED_RETENDERED");
};

export function exposure(tenders: Tender[]): Exposure {
  const e: Exposure = {
    emdBlocked: 0,
    emdByMode: zeroModes(),
    emdLocked: 0,
    emdRequired: 0,
    emdRecoverable: 0,
    securityByType: zeroSecurity(),
    additionalByType: zeroSecurity(),
    securityBlocked: 0,
    bgCharges: 0,
    feeSpent: 0,
    feePipeline: 0,
    feeByBucket: Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<TenderBucket, number>,
    totalBlocked: 0,
  };

  for (const t of tenders) {
    const bucket = bucketOf(t);
    const amount = t.emd ?? 0;
    const pipeline = bucket === "SHORTLISTED" || bucket === "UNDER_RESEARCH";

    if (isEmdBlocked(t)) {
      if (isEmdRecoverable(t)) {
        e.emdRecoverable += amount;
      } else {
        e.emdBlocked += amount;
        if (t.emdMode) e.emdByMode[t.emdMode] += amount;
        if (bucket === "UNDER_REVIEW" || bucket === "APPLIED") e.emdLocked += amount;
      }
    } else if (pipeline) {
      e.emdRequired += amount;
    }

    if (!t.securityReleasedOn) {
      if (t.securityType && t.securityAmount) {
        e.securityByType[t.securityType] += t.securityAmount;
        e.securityBlocked += t.securityAmount;
      }
      if (t.additionalSecurityType && t.additionalSecurityAmount) {
        e.additionalByType[t.additionalSecurityType] += t.additionalSecurityAmount;
        e.securityBlocked += t.additionalSecurityAmount;
      }
    }
    e.bgCharges += t.bgCharges ?? 0;

    const fee = t.fee ?? 0;
    e.feeByBucket[bucket] += fee;
    if (pipeline) e.feePipeline += fee;
    else e.feeSpent += fee;
  }

  e.totalBlocked = e.emdBlocked + e.securityBlocked;
  return e;
}

/* ---------- time series ---------- */

export interface MonthPoint {
  key: string;
  label: string;
  count: number;
  contract: number;
  estimated: number;
}

/** The sheet's "MONTHLY TENDER SUBMISSION & CONTRACT VALUE" block, gap-filled so the axis is continuous. */
export function monthlySubmissions(tenders: Tender[]): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (const t of tenders) {
    const key = tmonthKey(t.submissionDate);
    if (!key) continue;
    const point = map.get(key) ?? { key, label: tmonthLabel(key), count: 0, contract: 0, estimated: 0 };
    point.count += 1;
    point.contract += t.contractValue ?? 0;
    point.estimated += t.estimatedCost ?? 0;
    map.set(key, point);
  }
  const keys = [...map.keys()].sort();
  if (keys.length === 0) return [];

  // Fill the empty months so the trend line does not lie about the gaps.
  const out: MonthPoint[] = [];
  const [startY, startM] = keys[0].split("-").map(Number);
  const [endY, endM] = keys[keys.length - 1].split("-").map(Number);
  for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(map.get(key) ?? { key, label: tmonthLabel(key), count: 0, contract: 0, estimated: 0 });
  }
  return out;
}

/* ---------- deadlines ---------- */

export type DeadlineKind = "deadline" | "hardcopy" | "preBid" | "techOpen" | "priceOpen" | "opening";

export interface DeadlineItem {
  tender: Tender;
  kind: DeadlineKind;
  date: string;
  days: number;
}

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  deadline: "Bid deadline",
  hardcopy: "Hardcopy due",
  preBid: "Pre-bid meeting",
  techOpen: "Technical opening",
  priceOpen: "Price opening",
  opening: "Bid opening",
};

const LIVE_STAGES = new Set(["SORTING", "RESEARCH", "APPLIED"]);

/**
 * Every dated event on a live tender, flattened and sorted. This is the block the client's own
 * sheet tries to show and currently renders as `#N/A`.
 */
export function deadlineItems(tenders: Tender[]): DeadlineItem[] {
  const out: DeadlineItem[] = [];
  const push = (tender: Tender, kind: DeadlineKind, date?: string | null) => {
    if (!date) return;
    const days = tdays(date);
    if (days == null) return; // free-text cell, not a real date
    out.push({ tender, kind, date, days });
  };
  for (const t of tenders) {
    if (!LIVE_STAGES.has(t.stage)) continue;
    push(t, "deadline", t.deadline);
    push(t, "hardcopy", t.hardcopyDue);
    push(t, "preBid", t.preBidDate);
    push(t, "techOpen", t.techOpen);
    push(t, "priceOpen", t.priceOpen);
    push(t, "opening", t.openingDate);
  }
  return out.sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));
}

/**
 * How far back an overdue item is still worth showing. Anything older than this is a stale row
 * somebody forgot to close, not a deadline — without the floor a long-lived sheet buries the next
 * fortnight under a year of expired tenders.
 */
const OVERDUE_GRACE_DAYS = 30;

/** Items due within the next `days` days, plus anything that went overdue in the last month. */
export function upcomingDeadlines(tenders: Tender[], days = 14): DeadlineItem[] {
  return deadlineItems(tenders).filter((i) => i.days <= days && i.days >= -OVERDUE_GRACE_DAYS);
}

/** Count of live tenders closing within `days` (or recently overdue) — drives the nav badge. */
export function dueSoonCount(tenders: Tender[], stage: Tender["stage"], days = 7): number {
  return tenders.filter((t) => {
    if (t.stage !== stage) return false;
    const n = tdays(t.deadline);
    return n != null && n <= days && n >= -OVERDUE_GRACE_DAYS;
  }).length;
}

/** Live tenders whose deadline passed more than a month ago — they should have been closed. */
export function staleCount(tenders: Tender[]): number {
  return tenders.filter((t) => {
    if (!LIVE_STAGES.has(t.stage)) return false;
    const n = tdays(t.deadline);
    return n != null && n < -OVERDUE_GRACE_DAYS;
  }).length;
}

/* ---------- outcome analysis ---------- */

export interface LossRow {
  reason: LossReason | "UNSPECIFIED";
  count: number;
  estimated: number;
}

/** Why we lose — the question the spreadsheet cannot answer at all. */
export function lossBreakdown(tenders: Tender[]): LossRow[] {
  const map = new Map<LossReason | "UNSPECIFIED", LossRow>();
  for (const t of tenders) {
    if (t.stage !== "LOST") continue;
    const reason = t.lossReason ?? "UNSPECIFIED";
    const row = map.get(reason) ?? { reason, count: 0, estimated: 0 };
    row.count += 1;
    row.estimated += t.estimatedCost ?? 0;
    map.set(reason, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export interface CompetitorRow {
  bidder: string;
  wins: number;
  value: number;
  /** Average % by which they undercut our bid, where both numbers are known. */
  avgMarginPct: number | null;
}

/** Who keeps beating us, and by how much. Built from the L1 fields captured on a loss. */
export function competitorRows(tenders: Tender[]): CompetitorRow[] {
  const map = new Map<string, { wins: number; value: number; margins: number[] }>();
  for (const t of tenders) {
    if (!t.l1Bidder) continue;
    const row = map.get(t.l1Bidder) ?? { wins: 0, value: 0, margins: [] };
    row.wins += 1;
    row.value += t.l1Value ?? 0;
    if (t.l1Value && t.contractValue) row.margins.push(((t.contractValue - t.l1Value) / t.contractValue) * 100);
    map.set(t.l1Bidder, row);
  }
  return [...map.entries()]
    .map(([bidder, r]) => ({
      bidder,
      wins: r.wins,
      value: r.value,
      avgMarginPct: r.margins.length ? r.margins.reduce((a, b) => a + b, 0) / r.margins.length : null,
    }))
    .sort((a, b) => b.wins - a.wins || b.value - a.value);
}

export interface DeptRow {
  department: string;
  total: number;
  won: number;
  lost: number;
  value: number;
  winRate: number;
}

/** Which departments actually award us work — useful for deciding where to spend bidding effort. */
export function departmentRows(tenders: Tender[], limit = 8): DeptRow[] {
  const map = new Map<string, DeptRow>();
  for (const t of tenders) {
    const department = t.department ?? "Unknown";
    const row = map.get(department) ?? { department, total: 0, won: 0, lost: 0, value: 0, winRate: 0 };
    const b = bucketOf(t);
    if (b === "SHORTLISTED" || b === "UNDER_RESEARCH") continue;
    row.total += 1;
    if (b === "WON" || b === "COMPLETED") {
      row.won += 1;
      row.value += t.contractValue ?? t.estimatedCost ?? 0;
    }
    if (b === "LOST") row.lost += 1;
    map.set(department, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, winRate: r.won + r.lost ? r.won / (r.won + r.lost) : 0 }))
    .sort((a, b) => b.won - a.won || b.total - a.total)
    .slice(0, limit);
}
