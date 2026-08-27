/**
 * Every derived number in a tender analysis. Nothing here is stored — call it and read the answer,
 * so a rate edit can never leave a stale total behind.
 *
 * <p>The arithmetic mirrors the client's sheet, including two choices that look arbitrary until you
 * read the workbook:
 *
 * <ul>
 *   <li><b>Site expenses are a percentage of the tender value, not of the bid.</b> They budget
 *       supervision against the job they were handed, not against the discount they chose to quote,
 *       so a deeper discount does not shrink the site office.</li>
 *   <li><b>The bid discount applies to revenue only.</b> Quoting 11.47% below does not make the
 *       pipe cheaper — which is exactly why margin collapses faster than the discount suggests.</li>
 * </ul>
 */
import type {
  AnalysisTotals,
  BoqGroup,
  BoqGroupCalc,
  BoqLine,
  BoqLineCalc,
  ExpenseLine,
  HealthBand,
  RateLibraryItem,
  TenderAnalysis,
} from "./tenderAnalysisTypes";

/** What the department pays for a BOQ line. */
export function boqAmount(l: BoqLine): number {
  return l.qty * l.rate;
}

/** The three cost components summed, or null when none of them has been worked out. */
export function costRateOf(l: BoqLine): number | null {
  if (l.materialRate == null && l.labourRate == null && l.otherRate == null) return null;
  return (l.materialRate ?? 0) + (l.labourRate ?? 0) + (l.otherRate ?? 0);
}

export function lineCalc(line: BoqLine): BoqLineCalc {
  const amount = boqAmount(line);
  const costRate = costRateOf(line);
  const marginPerUnit = costRate == null ? null : line.rate - costRate;
  return {
    line,
    amount,
    costRate,
    costAmount: (costRate ?? 0) * line.qty,
    marginPerUnit,
    lineMargin: marginPerUnit == null ? null : marginPerUnit * line.qty,
    priced: costRate != null,
    isLoss: marginPerUnit != null && marginPerUnit < 0,
  };
}

/**
 * BOQ lines bucketed into their item families, in sheet order.
 *
 * <p>A family's margin is null rather than zero when nothing in it has been costed — showing
 * "₹0 margin" would read as "this family makes nothing" rather than "we haven't priced it".
 */
export function groupedBoq(lines: BoqLine[], groups: BoqGroup[]): BoqGroupCalc[] {
  const byKey = new Map<string, BoqGroupCalc>();
  const order: string[] = [];

  for (const line of lines) {
    const key = line.groupKey;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        label: groups.find((x) => x.key === key)?.label ?? line.description,
        lines: [],
        amount: 0,
        costAmount: 0,
        margin: null,
        lossCount: 0,
      };
      byKey.set(key, g);
      order.push(key);
    }
    const c = lineCalc(line);
    g.lines.push(c);
    g.amount += c.amount;
    g.costAmount += c.costAmount;
    if (c.lineMargin != null) g.margin = (g.margin ?? 0) + c.lineMargin;
    if (c.isLoss) g.lossCount += 1;
  }

  return order.map((k) => byKey.get(k)!);
}

/**
 * The main serial number a line belongs to. "7a" → "7", "12" → "12".
 *
 * <p>This is how the client's schedule already reads: a main item with lettered sub-items under
 * it. Deriving the family from what they type in the Sr column means there is no second concept to
 * learn — type `7a`, `7b`, `7c` and the three become one family with a subtotal.
 */
export function srStem(srNo: string): string {
  const s = srNo.trim();
  return s.match(/^(\d+)/)?.[1] ?? s.toLowerCase();
}

/** True when a Sr number names a sub-item ("7a") rather than a main item ("7"). */
export const isSubSr = (srNo: string) => /^\d+\s*[a-z]/i.test(srNo.trim());

/**
 * A family's name, from the lines in it: their longest common leading / trailing word runs, with
 * dangling unit fragments trimmed. Falls back to the first line's description.
 */
export function familyLabel(descriptions: string[]): string {
  const clean = descriptions.filter((d) => d.trim());
  if (clean.length === 0) return "New item";
  if (clean.length === 1) return clean[0];

  const toks = clean.map((d) => d.split(/\s+/));
  const shortest = Math.min(...toks.map((t) => t.length));

  let pre = 0;
  while (pre < shortest && toks.every((t) => t[pre].toLowerCase() === toks[0][pre].toLowerCase())) pre += 1;

  let suf = 0;
  while (
    suf < shortest - pre &&
    toks.every((t) => t[t.length - 1 - suf].toLowerCase() === toks[0][toks[0].length - 1 - suf].toLowerCase())
  )
    suf += 1;

  const UNIT_FRAGMENT = /^(mm|cm|m|dia|kg|no|nos|mm\)|\)|-|–|&)$/i;
  const head = toks[0].slice(0, pre);
  const tail = toks[0].slice(toks[0].length - suf);
  while (head.length && UNIT_FRAGMENT.test(head[head.length - 1])) head.pop();
  while (tail.length && UNIT_FRAGMENT.test(tail[0])) tail.shift();

  const h = head.join(" ");
  const t = tail.join(" ");
  if (h.length + t.length < 4) return clean[0];
  if (!h) return t;
  if (!t) return h;
  return `${h} … ${t}`;
}

/** Site overheads resolve against the tender value — see the note at the top of this file. */
export function expenseAmount(e: ExpenseLine, tenderValue: number): number {
  return e.basis === "PCT_OF_TENDER" ? (tenderValue * e.value) / 100 : e.value;
}

/** Where a profit percentage puts the bid. Bands are the client's own comfort levels. */
export function bandFor(profitPct: number): HealthBand {
  if (profitPct >= 8) return "strong";
  if (profitPct >= 3) return "thin";
  return "risk";
}

/**
 * The whole verdict.
 *
 * <p>`bidPctOverride` lets the Scenarios tab price a position without mutating the analysis, which
 * is the difference between comparing three bids and having to save and undo three times.
 */
export function analysisTotals(a: TenderAnalysis, bidPctOverride?: number): AnalysisTotals {
  let tenderValue = 0;
  let material = 0;
  let labour = 0;
  let other = 0;
  let lossLineCount = 0;
  let linesPriced = 0;

  for (const l of a.boqLines) {
    tenderValue += l.qty * l.rate;
    material += (l.materialRate ?? 0) * l.qty;
    labour += (l.labourRate ?? 0) * l.qty;
    other += (l.otherRate ?? 0) * l.qty;

    const costRate = costRateOf(l);
    if (costRate == null) continue;
    linesPriced += 1;
    if (l.rate < costRate) lossLineCount += 1;
  }

  const directCost = material + labour + other;
  const expenses = a.expenseLines.reduce((s, e) => s + expenseAmount(e, tenderValue), 0);
  const cost = directCost + expenses;

  const marginAtEstimate = tenderValue - cost;
  const marginPctAtEstimate = tenderValue > 0 ? (marginAtEstimate / tenderValue) * 100 : 0;

  const bidPct = bidPctOverride ?? a.bidPct;
  const revenueAtBid = tenderValue * (1 - bidPct / 100);
  const profitAtBid = revenueAtBid - cost;

  return {
    tenderValue,
    material,
    labour,
    other,
    directCost,
    expenses,
    cost,
    marginAtEstimate,
    marginPctAtEstimate,
    bidPct,
    revenueAtBid,
    profitAtBid,
    profitPctAtBid: revenueAtBid > 0 ? (profitAtBid / revenueAtBid) * 100 : 0,
    // The discount that takes profit to zero. Expenses are fixed against the tender value, so this
    // is simply how much of the tender value is not already spoken for by cost.
    breakEvenPct: tenderValue > 0 ? (1 - cost / tenderValue) * 100 : 0,
    band: bandFor(revenueAtBid > 0 ? (profitAtBid / revenueAtBid) * 100 : 0),
    lossLineCount,
    linesPriced,
    linesTotal: a.boqLines.length,
  };
}

/**
 * How profit moves when a cost block moves.
 *
 * <p>Government BOQs are approximate-quantity contracts and DI pipe is a commodity, so "what if
 * material runs 10% over" is the question that decides whether a thin bid is survivable.
 */
export interface SensitivityRow {
  label: string;
  shockPct: number;
  profit: number;
  profitPct: number;
  band: HealthBand;
}

export function sensitivity(a: TenderAnalysis, bidPctOverride?: number): SensitivityRow[] {
  const base = analysisTotals(a, bidPctOverride);
  const revenue = base.revenueAtBid;

  const row = (label: string, shockPct: number, extraCost: number): SensitivityRow => {
    const profit = revenue - (base.cost + extraCost);
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { label, shockPct, profit, profitPct, band: bandFor(profitPct) };
  };

  return [
    row("Material 10% over", 10, base.material * 0.1),
    row("Labour 10% over", 10, base.labour * 0.1),
    // A quantity overrun lifts revenue and cost together, but the discount means the extra revenue
    // arrives already cut — so a 5% overrun on a thin bid still hurts.
    row("Quantities 5% over", 5, base.cost * 0.05 * (base.bidPct / 100)),
    row("Material 10% under", -10, -base.material * 0.1),
  ];
}

/* ---------------- rate library ---------------- */

/** Library lookups are on name + unit — see the note on RateLibraryItem for why not a hard link. */
export const libraryKey = (name: string, unit: string) => `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;

export function findLibraryRate(library: RateLibraryItem[], name: string, unit: string): RateLibraryItem | null {
  const k = libraryKey(name, unit);
  return library.find((x) => libraryKey(x.name, x.unit) === k) ?? null;
}

/**
 * Fold an analysis's rates back into the library, so every rate entered is a rate available next
 * time. Later analyses win on rate; usage counts accumulate.
 */
export function absorbIntoLibrary(library: RateLibraryItem[], a: TenderAnalysis, now: string): RateLibraryItem[] {
  const byKey = new Map(library.map((x) => [libraryKey(x.name, x.unit), { ...x }]));

  for (const l of a.boqLines) {
    if (costRateOf(l) == null || !l.description.trim()) continue;
    const k = libraryKey(l.description, l.unit);
    const existing = byKey.get(k);
    if (existing) {
      if (l.materialRate != null) existing.materialRate = l.materialRate;
      if (l.labourRate != null) existing.labourRate = l.labourRate;
      if (l.otherRate != null) existing.otherRate = l.otherRate;
      existing.lastUsedAt = now;
      if (!existing.sourceSheets.includes(a.tenderId)) {
        existing.sourceSheets = [a.tenderId, ...existing.sourceSheets].slice(0, 8);
        existing.usageCount += 1;
      }
    } else {
      byKey.set(k, {
        id: `rl-${k}`,
        name: l.description,
        unit: l.unit,
        materialRate: l.materialRate,
        labourRate: l.labourRate,
        otherRate: l.otherRate,
        usageCount: 1,
        sourceSheets: [a.tenderId],
        lastUsedAt: now,
      });
    }
  }

  return [...byKey.values()];
}
