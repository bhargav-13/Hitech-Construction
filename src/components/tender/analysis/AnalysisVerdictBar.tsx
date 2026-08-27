"use client";

import { inr } from "@/lib/format";
import type { AnalysisTotals, HealthBand } from "@/lib/tenderAnalysisTypes";

/**
 * The summary block from the bottom of the client's sheet, kept in the same shape and read the
 * same way: tender value, the three cost blocks, cost, margin — then the percentage they decided
 * to quote at, and what that leaves.
 *
 * <p>The bid percentage is <b>typed, not dragged</b>. It is a decision taken outside the app —
 * against the department, the competition and how much work is on — and the app's job is to record
 * it and show what it costs, not to invite anyone to slide it around until the number looks nice.
 * Break-even is shown beside it as a fact, so a bid past it is obvious without being prevented.
 */

const BAND_TEXT: Record<HealthBand, string> = {
  strong: "text-emerald-600",
  thin: "text-amber-600",
  risk: "text-rose-600",
  none: "text-gray-400",
};

/** How the profit reads in words. A 2% profit is not a "loss", and calling it one erodes trust. */
function verdictWord(t: AnalysisTotals): string {
  if (t.profitAtBid < 0) return "loss-making";
  if (t.profitPctAtBid < 3) return "very thin";
  if (t.profitPctAtBid < 8) return "thin";
  return "healthy";
}

export function AnalysisVerdictBar({
  totals,
  bidPct,
  onBidChange,
  readOnly = false,
}: {
  totals: AnalysisTotals;
  bidPct: number;
  onBidChange: (v: number) => void;
  readOnly?: boolean;
}) {
  const t = totals;
  const pastBreakEven = t.bidPct > t.breakEvenPct;

  /**
   * Until the department's rates are in, every ratio here divides by zero and the guards return 0 —
   * which renders as a confident-looking wall of ₹0, 0.00% and a loss the size of the cost sheet.
   * Say what is missing instead; a verdict nobody can act on is worse than no verdict.
   */
  if (t.tenderValue <= 0) {
    const needRate = t.linesTotal;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-amber-900">Not enough to judge this bid yet</h2>
        <p className="mt-1 max-w-2xl text-sm text-amber-800">
          {needRate === 0 ? (
            <>Add the tender&apos;s items, then put the department&apos;s rate and quantity against each one.</>
          ) : (
            <>
              {needRate} item{needRate === 1 ? "" : "s"} added, but none carries the department&apos;s rate yet — so
              there is no contract value to measure a margin against. Fill the amber{" "}
              <strong className="font-semibold">Qty</strong> and <strong className="font-semibold">Tender rate</strong>{" "}
              cells below and the verdict appears here.
            </>
          )}
        </p>
        {t.directCost > 0 && (
          <p className="mt-2 text-xs text-amber-700 tabular-nums">
            Costed so far: {inr(t.directCost)} — material {inr(t.material)}, labour {inr(t.labour)}, other{" "}
            {inr(t.other)}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* The sheet's own summary rows, in its order. */}
      <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Tender" value={inr(t.tenderValue)} sub="at the department's rates" />
        <Cell label="Material" value={inr(t.material)} sub={pctOf(t.material, t.tenderValue)} />
        <Cell label="Labour" value={inr(t.labour)} sub={pctOf(t.labour, t.tenderValue)} />
        <Cell label="Other" value={inr(t.other)} sub={pctOf(t.other, t.tenderValue)} />
        <Cell label="Overheads" value={inr(t.expenses)} sub={pctOf(t.expenses, t.tenderValue)} />
        <Cell
          label="Cost"
          value={inr(t.cost)}
          sub={`${pctOf(t.cost, t.tenderValue)} · margin ${t.marginPctAtEstimate.toFixed(2)}%`}
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-4 py-4 sm:px-5">
        <div>
          <label htmlFor="bid-pct" className="block text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Bid below estimate
          </label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg text-gray-400">−</span>
            <input
              id="bid-pct"
              type="number"
              value={Number.isFinite(bidPct) ? bidPct : 0}
              step={0.01}
              min={-10}
              max={100}
              disabled={readOnly}
              onChange={(e) => onBidChange(Number(e.target.value))}
              className={`w-28 rounded-lg border px-2.5 py-1.5 text-right text-lg font-semibold tabular-nums focus:outline-none disabled:bg-gray-50 ${
                pastBreakEven ? "border-rose-300 text-rose-600" : "border-gray-200 text-gray-800 focus:border-brand-accent"
              }`}
            />
            <span className="text-lg text-gray-400">%</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 tabular-nums">
            Break-even at −{t.breakEvenPct.toFixed(2)}%
          </p>
        </div>

        <Figure label="Revenue at this bid" value={inr(t.revenueAtBid)} />

        <Figure
          label="Profit at this bid"
          value={inr(t.profitAtBid)}
          sub={`${t.profitPctAtBid.toFixed(2)}% — ${verdictWord(t)}`}
          tone={BAND_TEXT[t.band]}
        />

        <div className="ml-auto max-w-md text-xs text-gray-500">
          {pastBreakEven ? (
            <span className="text-rose-600">
              This bid is past break-even — at −{t.bidPct.toFixed(2)}% the job loses{" "}
              <strong className="font-semibold">{inr(Math.abs(t.profitAtBid))}</strong>.
            </span>
          ) : (
            <>
              At the department&apos;s own rates the job carries{" "}
              <strong className="font-medium text-gray-700">{inr(t.marginAtEstimate)}</strong> (
              {t.marginPctAtEstimate.toFixed(2)}%).
            </>
          )}
          {t.lossLineCount > 0 && (
            <>
              {" "}
              <span className="text-rose-600">
                {t.lossLineCount} item{t.lossLineCount === 1 ? "" : "s"} priced below cost.
              </span>
            </>
          )}
          {t.linesPriced < t.linesTotal && (
            <>
              {" "}
              <span className="text-amber-700">
                {t.linesTotal - t.linesPriced} not costed yet.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const pctOf = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1)}% of tender` : "—");

function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-gray-800">{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? "text-gray-800"}`}>{value}</div>
      {sub && <div className={`mt-0.5 text-[11px] ${tone ?? "text-gray-400"}`}>{sub}</div>}
    </div>
  );
}
