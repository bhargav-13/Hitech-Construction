"use client";

import { useMemo, useState } from "react";
import { Plus, Target, Trash2, TrendingDown } from "lucide-react";
import { inr } from "@/lib/format";
import { analysisTotals, sensitivity } from "@/lib/tenderAnalysisCalc";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { useTenderStore } from "@/lib/tenderStore";
import type { HealthBand, TenderAnalysis } from "@/lib/tenderAnalysisTypes";

/**
 * Bid positions side by side, plus the two things a spreadsheet can't answer: what happens if costs
 * move, and what this department has actually accepted before.
 */

const BAND_TEXT: Record<HealthBand, string> = {
  strong: "text-emerald-600",
  thin: "text-amber-600",
  risk: "text-rose-600",
  none: "text-gray-400",
};

export function AnalysisScenariosTab({ analysis }: { analysis: TenderAnalysis }) {
  const addScenario = useAnalysisStore((s) => s.addScenario);
  const removeScenario = useAnalysisStore((s) => s.removeScenario);
  const setBidPct = useAnalysisStore((s) => s.setBidPct);

  const [name, setName] = useState("");
  const [pct, setPct] = useState("");

  const base = useMemo(() => analysisTotals(analysis), [analysis]);

  // The live bid always appears, even when it isn't one of the saved positions — comparing saved
  // scenarios against each other while the actual bid sits off-screen would be the wrong table.
  const rows = useMemo(() => {
    const saved = analysis.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      bidPct: s.bidPct,
      saved: true,
      totals: analysisTotals(analysis, s.bidPct),
    }));
    if (!saved.some((s) => Math.abs(s.bidPct - analysis.bidPct) < 0.005)) {
      saved.push({
        id: "current",
        name: "Current bid",
        bidPct: analysis.bidPct,
        saved: false,
        totals: analysisTotals(analysis, analysis.bidPct),
      });
    }
    return saved.sort((a, b) => a.bidPct - b.bidPct);
  }, [analysis]);

  const shocks = useMemo(() => sensitivity(analysis), [analysis]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <Target size={14} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Bid positions</h3>
          <span className="ml-auto text-xs text-gray-400 tabular-nums">
            Break-even at −{base.breakEvenPct.toFixed(2)}%
          </span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-gray-100 text-[11px] tracking-wide text-gray-400 uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Position</th>
                <th className="px-4 py-2 text-right font-medium">Bid</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
                <th className="px-4 py-2 text-right font-medium">Margin</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const live = Math.abs(r.bidPct - analysis.bidPct) < 0.005;
                return (
                  <tr key={r.id} className={`border-b border-gray-50 ${live ? "bg-cyan-50/50" : "hover:bg-gray-50/60"}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-700">{r.name}</span>
                      {live && (
                        <span className="ml-2 rounded bg-brand-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          live
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">−{r.bidPct.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{inr(r.totals.revenueAtBid)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{inr(r.totals.cost)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${BAND_TEXT[r.totals.band]}`}>
                      {inr(r.totals.profitAtBid)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${BAND_TEXT[r.totals.band]}`}>
                      {r.totals.profitPctAtBid.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!live && (
                          <button
                            type="button"
                            onClick={() => setBidPct(analysis.id, r.bidPct)}
                            className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 transition-colors duration-150 hover:bg-gray-50"
                          >
                            Use
                          </button>
                        )}
                        {r.saved && (
                          <button
                            type="button"
                            onClick={() => removeScenario(analysis.id, r.id)}
                            aria-label={`Remove ${r.name}`}
                            className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form
          className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(pct);
            if (!name.trim() || !Number.isFinite(v)) return;
            addScenario(analysis.id, { name: name.trim(), bidPct: v });
            setName("");
            setPct("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Position name"
            aria-label="Scenario name"
            className="w-44 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-brand-accent focus:outline-none"
          />
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-400">−</span>
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Bid percentage"
              className="w-20 rounded-lg border border-gray-200 px-2.5 py-1.5 text-right text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
            <span className="text-sm text-gray-400">%</span>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            <Plus size={13} /> Save position
          </button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
            <TrendingDown size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">If costs move</h3>
            <span className="ml-auto text-xs text-gray-400">at the current bid</span>
          </header>
          <table className="w-full text-sm">
            <tbody>
              {shocks.map((s) => (
                <tr key={s.label} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-gray-600">{s.label}</td>
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${BAND_TEXT[s.band]}`}>
                    {inr(s.profit)}
                  </td>
                  <td className={`w-20 px-4 py-2.5 text-right tabular-nums ${BAND_TEXT[s.band]}`}>
                    {s.profitPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
            Government BOQs are measured on actual quantity, and DI pipe is a commodity — a bid that only works at
            quoted rates is a bid with no room in it.
          </p>
        </section>

        <DepartmentHistory analysis={analysis} />
      </div>
    </div>
  );
}

/**
 * What this department has actually awarded at.
 *
 * <p>Built from the L1 values already recorded on decided tenders — the module has been collecting
 * this all along without anywhere to show it, and it is the one input the spreadsheet can never
 * have: whether the number you are about to quote has ever won.
 */
function DepartmentHistory({ analysis }: { analysis: TenderAnalysis }) {
  const tenders = useTenderStore((s) => s.tenders);

  const { department, decided, avgDiscount, wouldLose } = useMemo(() => {
    const self = tenders.find((t) => t.id === analysis.tenderRef);
    const dept = self?.department ?? null;
    if (!dept) return { department: null, decided: [], avgDiscount: null, wouldLose: 0 };

    const decided = tenders
      .filter(
        (t) =>
          t.department === dept &&
          t.id !== analysis.tenderRef &&
          (t.stage === "WON" || t.stage === "LOST") &&
          t.estimatedCost != null &&
          t.estimatedCost > 0,
      )
      .map((t) => {
        // The winning price, whoever won it: our contract value if we took it, the L1 value if not.
        const winning = t.stage === "WON" ? (t.contractValue ?? t.estimatedCost!) : (t.l1Value ?? null);
        const discount = winning == null ? null : (1 - winning / t.estimatedCost!) * 100;
        return { t, discount };
      })
      .filter((x) => x.discount != null && Number.isFinite(x.discount))
      .slice(0, 12);

    const ds = decided.map((x) => x.discount as number);
    const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    return {
      department: dept,
      decided,
      avgDiscount: avg,
      wouldLose: ds.filter((d) => d > analysis.bidPct).length,
    };
  }, [tenders, analysis.tenderRef, analysis.bidPct]);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-700">What this department awards at</h3>
      </header>

      {decided.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">
          {department
            ? "No decided tenders from this department yet — record the L1 value on won and lost bids and this fills itself in."
            : "This tender has no department recorded, so there is nothing to compare against."}
        </p>
      ) : (
        <>
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-600">
              The last {decided.length} decided tenders from{" "}
              <strong className="font-medium text-gray-800">{department}</strong> went at an average of{" "}
              <strong className="font-semibold text-gray-800 tabular-nums">−{avgDiscount!.toFixed(2)}%</strong>.
            </p>
            <p className={`mt-1 text-sm ${wouldLose > decided.length / 2 ? "text-rose-600" : "text-emerald-600"}`}>
              Your −{analysis.bidPct.toFixed(2)}% would have been beaten on {wouldLose} of {decided.length}.
            </p>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {decided.map(({ t, discount }) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-2 last:border-0">
                <span className="min-w-0 flex-1 truncate text-xs text-gray-500" title={t.nameOfWork ?? t.tenderId}>
                  {t.nameOfWork ?? t.tenderId}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    t.stage === "WON" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {t.stage === "WON" ? "Won" : "Lost"}
                </span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-600">
                  −{(discount as number).toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
