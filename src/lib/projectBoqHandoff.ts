import * as api from "./projectTargetApi";
import { costRateOf, expenseAmount, groupedBoq } from "./tenderAnalysisCalc";
import type { TenderAnalysis } from "./tenderAnalysisTypes";
import type { HandoffOptions } from "./projectBoqStore";

/**
 * Turning a won tender's analysis into the project's BOQ — the conversion that makes the tender
 * module worth having.
 *
 * <p>This used to write to a local store, which meant a handover produced a BOQ the project screens
 * could not see once they moved to the server. It now PUTs the document, and the server does two
 * things the client used to guess at:
 *
 * <ul>
 *   <li><b>It creates the families</b> as records, from the group each line names, so the BOQ arrives
 *       organised rather than as one long list.
 *   <li><b>It creates one target per line.</b> The old options offered per-family targets, which is
 *       what the site team complained about: a family mixing cum, rmt and nos has no meaningful
 *       summed quantity. {@link HandoffOptions.targets} now only decides <em>whether</em> targets are
 *       made, not how coarse they are.
 * </ul>
 */
export async function handoffToServer(
  projectId: number,
  analysis: TenderAnalysis,
  opts: HandoffOptions,
): Promise<api.ApiProjectBoq> {
  const factor = opts.rateBasis === "AWARDED" ? 1 - analysis.bidPct / 100 : 1;
  const groups = groupedBoq(analysis.boqLines, analysis.groups);

  // Site overheads are the only cost the analysis does not hold per line. Spread by value so the
  // project's budget still totals what the bid said the job would cost.
  const tenderValue = analysis.boqLines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const overheads = analysis.expenseLines.reduce((sum, e) => sum + expenseAmount(e, tenderValue), 0);
  const overheadShare = tenderValue > 0 ? overheads / tenderValue : 0;

  const items = [];
  for (const g of groups) {
    for (const { line } of g.lines) {
      items.push({
        srNo: line.srNo,
        groupKey: g.key,
        groupLabel: g.label,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        saleRate: line.rate * factor,
        // The line's own material + labour + other, plus its share of the site overheads.
        costRate: opts.carryCost ? (costRateOf(line) ?? 0) + line.rate * overheadShare : 0,
        overheadRate: opts.carryCost ? line.rate * overheadShare : 0,
        sourceLineId: null,
      });
    }
  }

  // A non-empty list means "measure this job"; the server decides the granularity, which is always
  // one target per line. NONE sends nothing and the project gets a BOQ with no targets yet.
  const targets =
    opts.targets === "NONE" ? [] : [{ key: 1, name: "per line", unit: "each", targetQty: 1 }];

  return api.saveBoq(projectId, {
    tenderRef: null,
    analysisId: null,
    title: analysis.title ?? null,
    clientName: opts.clientName,
    boqNo: opts.boqNo || null,
    boqDate: new Date().toISOString().slice(0, 10),
    bidPct: analysis.bidPct,
    items,
    targets,
  });
}
