"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, FileDown, Scale, Zap } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useRfqs } from "@/lib/useRfqs";
import { downloadPdf } from "@/lib/vyaparExport";
import { inr } from "@/lib/format";
import type { Rfq, Quote } from "@/lib/procurementApi";

/**
 * Comparative statement — the screen the whole module exists for.
 *
 * Shape: **items down, vendors across.** The left spine is what was asked for; each column is what
 * one supplier came back with. That is how a comparative statement is read on paper, and it is what
 * the client's own tool does.
 *
 * The decision it supports is per line, not per enquiry. A five-line RFQ routinely ends up split
 * across three suppliers — cheapest cement here, fastest steel there — so every row carries its own
 * winner. Awarding then produces one purchase order per winning vendor.
 *
 * Three judgements are deliberate:
 *
 *  - **A tolerance band.** Marking only the single lowest cell is misleading: ₹40 on a ₹31,000 line
 *    is not a decision. Anything within `LEVEL_BAND` of the best reads as level pegging, and the
 *    buyer picks on lead time or track record instead.
 *  - **Never colour alone.** Every signal is also a word or a weight change, because a comparative
 *    statement gets printed and signed, and roughly one man in twelve cannot separate red from green.
 *  - **A missing quote is "No quote", never zero.** A blank cell reads as free and has caused real
 *    mistakes.
 */

/** Within this much of the cheapest rate, two quotes are treated as level rather than ranked. */
const LEVEL_BAND = 0.02;

export default function ComparePage() {
  const { rfqs, loading, error, award } = useRfqs();

  const comparable = useMemo(() => rfqs.filter((r) => r.quotes.length > 0), [rfqs]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rfq = comparable.find((r) => r.id === selectedId) ?? comparable[0];

  if (loading) {
    return (
      <ProcurementShell>
        <ProcurementHeader title="Comparison" subtitle="Compare what each supplier quoted, line by line." />
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading quotes…
        </div>
      </ProcurementShell>
    );
  }

  if (!rfq) {
    return (
      <ProcurementShell>
        <ProcurementHeader title="Comparison" subtitle="Compare what each supplier quoted, line by line." />
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        <ProcurementEmpty icon={Scale} title="Nothing to compare yet" hint="Quotes received against an RFQ show here." />
      </ProcurementShell>
    );
  }

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Comparison"
        subtitle="What each supplier quoted, line by line. Award each line to whoever should get it."
        right={
          <div className="flex items-center gap-2">
            <Select
              value={String(rfq.id)}
              onChange={(v) => setSelectedId(Number(v))}
              className="min-w-[240px]"
              options={comparable.map((r) => ({ value: String(r.id), label: `${r.rfqNo} · ${r.title}` }))}
            />
          </div>
        }
      />
      <Matrix key={rfq.id} rfq={rfq} onAward={award} />
    </ProcurementShell>
  );
}

// =====================================================================================

/** One vendor's priced total for the whole enquiry, and per line. */
function quoteTotals(rfq: Rfq, q: Quote) {
  const lineTotals = rfq.lines.map((l) => {
    const cell = q.lines.find((c) => c.rfqLineId === l.id);
    if (cell?.rate == null) return null;
    return cell.rate * (cell.quantity ?? l.quantity);
  });
  const subtotal = lineTotals.reduce<number>((s, t) => s + (t ?? 0), 0);
  const afterDiscount = subtotal - (q.discount ?? 0) + (q.charges ?? 0);
  const tax = (afterDiscount * (q.taxPercent ?? 0)) / 100;
  return { lineTotals, subtotal, tax, total: afterDiscount + tax };
}

function Matrix({
  rfq,
  onAward,
}: {
  rfq: Rfq;
  onAward: (rfqId: number, lineId: number, vendorPartyId: number | null, reason?: string) => void;
}) {
  const totals = useMemo(() => rfq.quotes.map((q) => quoteTotals(rfq, q)), [rfq]);

  /** Per line: the best rate offered, and which vendors are within the tolerance band of it. */
  const perLine = useMemo(
    () =>
      rfq.lines.map((line) => {
        const offers = rfq.quotes
          .map((q, qi) => ({
            qi,
            vendorPartyId: q.vendorPartyId,
            vendorName: q.vendorName,
            rate: q.lines.find((c) => c.rfqLineId === line.id)?.rate ?? null,
          }))
          .filter((o) => o.rate != null) as {
          qi: number;
          vendorPartyId: number;
          vendorName: string;
          rate: number;
        }[];
        const best = offers.length ? Math.min(...offers.map((o) => o.rate)) : null;
        const level = new Set(
          best == null ? [] : offers.filter((o) => o.rate <= best * (1 + LEVEL_BAND)).map((o) => o.qi),
        );
        const cheapest = offers.find((o) => o.rate === best) ?? null;
        return { line, offers, best, level, cheapest };
      }),
    [rfq],
  );

  /** What the current selection costs, against the two yardsticks that matter. */
  const summary = useMemo(() => {
    let selected = 0;
    let cheapest = 0;
    let budget = 0;
    let decided = 0;
    for (let i = 0; i < rfq.lines.length; i++) {
      const line = rfq.lines[i];
      const { best, cheapest: cheapestOffer } = perLine[i];
      if (best != null) cheapest += best * line.quantity;
      if (line.budgetRate != null) budget += line.budgetRate * line.quantity;
      const chosen = line.awardedVendorPartyId;
      if (chosen != null) {
        decided += 1;
        const q = rfq.quotes.find((x) => x.vendorPartyId === chosen);
        const rate = q?.lines.find((c) => c.rfqLineId === line.id)?.rate ?? null;
        selected += (rate ?? 0) * line.quantity;
      } else if (cheapestOffer) {
        // Undecided lines are costed at the cheapest offer, so the running total means something
        // before every row has been settled.
        selected += cheapestOffer.rate * line.quantity;
      }
    }
    return { selected, cheapest, budget, decided, of: rfq.lines.length };
  }, [rfq, perLine]);

  /** Awarding produces one purchase order per winning vendor. */
  const byVendor = useMemo(() => {
    const map = new Map<string, { lines: string[]; value: number }>();
    rfq.lines.forEach((line) => {
      if (line.awardedVendorPartyId == null) return;
      const q = rfq.quotes.find((x) => x.vendorPartyId === line.awardedVendorPartyId);
      const rate = q?.lines.find((c) => c.rfqLineId === line.id)?.rate ?? 0;
      const name = line.awardedVendorName ?? q?.vendorName ?? "Vendor";
      const cur = map.get(name) ?? { lines: [], value: 0 };
      cur.lines.push(line.itemName);
      cur.value += rate * line.quantity;
      map.set(name, cur);
    });
    return [...map.entries()];
  }, [rfq]);

  function awardAllCheapest() {
    perLine.forEach((p, i) => {
      if (p.cheapest) onAward(rfq.id, rfq.lines[i].id, p.cheapest.vendorPartyId, "Lowest quote");
    });
  }

  function exportPdf() {
    const head = ["Item", "Qty", ...rfq.quotes.map((q) => q.vendorName)];
    const rows = rfq.lines.map((line) => [
      line.itemName,
      `${line.quantity} ${line.unit ?? ""}`.trim(),
      ...rfq.quotes.map((q) => {
        const r = q.lines.find((c) => c.rfqLineId === line.id)?.rate;
        return r == null ? "No quote" : inr(r);
      }),
    ]);
    rows.push(["Total", "", ...totals.map((t) => inr(t.total))]);
    rows.push(["Awarded to", "", ...rfq.quotes.map((q) =>
      rfq.lines.some((l) => l.awardedVendorPartyId === q.vendorPartyId) ? "Yes" : "—")]);
    downloadPdf(`Comparative Statement — ${rfq.rfqNo}`, head, rows, {
      subtitle: rfq.title,
      rightAlignFrom: 2,
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {rfq.quotes.length} quotes · {summary.decided} of {summary.of} lines decided
          {rfq.dueBy && <> · replies due {rfq.dueBy}</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={awardAllCheapest}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
          >
            <Zap size={14} /> Award all to cheapest
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
          >
            <FileDown size={14} /> Export
          </button>
        </div>
      </div>

      {/* The matrix. The item spine is sticky so vendor columns can scroll under it. */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="sticky left-0 z-10 min-w-[260px] bg-gray-50 px-4 py-3 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                Item
              </th>
              {rfq.quotes.map((q, qi) => (
                <th key={q.id} className="min-w-[190px] border-l border-gray-200 px-4 py-3 text-left align-top">
                  <div className="font-semibold text-gray-800">{q.vendorName}</div>
                  <div className="mt-0.5 text-[11px] font-normal text-gray-400">
                    Quote {q.version}
                    {q.receivedOn && <> · {q.receivedOn}</>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-normal">
                    {q.deliveryDays != null && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{q.deliveryDays}d delivery</span>
                    )}
                    {!!q.discount && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">disc {inr(q.discount)}</span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-gray-700">{inr(totals[qi].total)}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rfq.lines.map((line, i) => {
              const { offers, best, level } = perLine[i];
              return (
                <tr key={i} className="border-b border-gray-100 align-top last:border-b-0">
                  {/* Spine: what was asked for, and who is getting it */}
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <div className="font-medium text-gray-800">{line.itemName}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {line.quantity} {line.unit ?? ""}
                      {line.budgetRate != null && <> · budget {inr(line.budgetRate)}</>}
                    </div>
                    <div className="mt-2">
                      <Select
                        value={line.awardedVendorPartyId != null ? String(line.awardedVendorPartyId) : ""}
                        onChange={(v) => onAward(rfq.id, line.id, v ? Number(v) : null)}
                        size="sm"
                        placeholder="Not decided"
                        className="w-full"
                        options={[
                          { value: "", label: "Not decided" },
                          ...offers.map((o) => ({ value: String(o.vendorPartyId), label: o.vendorName })),
                        ]}
                      />
                    </div>
                    {line.awardedVendorPartyId != null && (
                      <input
                        defaultValue={line.awardReason ?? ""}
                        onBlur={(e) => onAward(rfq.id, line.id, line.awardedVendorPartyId, e.target.value)}
                        placeholder="Reason (optional)"
                        className="mt-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500"
                      />
                    )}
                  </td>

                  {/* One cell per vendor */}
                  {rfq.quotes.map((q, qi) => {
                    const cell = q.lines.find((c) => c.rfqLineId === line.id);
                    const rate = cell?.rate ?? null;
                    const won = line.awardedVendorPartyId === q.vendorPartyId;

                    if (rate == null) {
                      return (
                        <td key={q.id} className="border-l border-gray-100 px-4 py-3">
                          <span className="text-xs text-gray-400 italic">No quote</span>
                          {cell?.note && <div className="mt-0.5 text-[11px] text-gray-400">{cell.note}</div>}
                        </td>
                      );
                    }

                    const isBest = best != null && rate === best;
                    const isLevel = level.has(qi) && !isBest;
                    const overBudget = line.budgetRate != null && rate > line.budgetRate;
                    const delta = best != null && best > 0 ? ((rate - best) / best) * 100 : 0;

                    return (
                      <td
                        key={q.id}
                        className={`border-l border-gray-100 px-4 py-3 transition-colors duration-150 ${
                          won ? "bg-emerald-50/70 ring-1 ring-inset ring-emerald-500/30" : isBest ? "bg-emerald-50/30" : ""
                        }`}
                      >
                        <div className={`tabular-nums ${isBest ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {inr(rate)}
                          {line.unit && <span className="text-xs font-normal text-gray-400">/{line.unit}</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 tabular-nums">{inr(rate * line.quantity)}</div>

                        {/* Signals: always a word, never colour alone. */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {won && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              <Check size={10} /> Awarded
                            </span>
                          )}
                          {isBest && !won && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              Lowest
                            </span>
                          )}
                          {isLevel && (
                            <span
                              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                              title={`Within ${LEVEL_BAND * 100}% of the lowest — treat as level`}
                            >
                              Level
                            </span>
                          )}
                          {!isBest && !isLevel && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 tabular-nums">
                              +{delta.toFixed(1)}%
                            </span>
                          )}
                          {overBudget && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              <AlertTriangle size={9} /> Over budget
                            </span>
                          )}
                        </div>
                        {cell?.note && <div className="mt-1 text-[11px] text-gray-400">{cell.note}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Whole-quote terms, below the lines they apply to */}
            <tr className="border-t border-gray-200 bg-gray-50/60 text-xs">
              <td className="sticky left-0 z-10 bg-gray-50/60 px-4 py-3 font-medium text-gray-500">
                Discount · Charges · Tax
              </td>
              {rfq.quotes.map((q, qi) => (
                <td key={q.id} className="border-l border-gray-100 px-4 py-3 text-gray-600 tabular-nums">
                  <div>Sub {inr(totals[qi].subtotal)}</div>
                  {!!q.discount && <div className="text-emerald-700">− {inr(q.discount)} discount</div>}
                  {!!q.charges && <div>+ {inr(q.charges)} charges</div>}
                  <div>+ {inr(totals[qi].tax)} tax</div>
                  <div className="mt-1 font-semibold text-gray-800">{inr(totals[qi].total)}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pinned decision bar — the number the choice actually turns on. */}
      <div className="sticky bottom-0 z-20 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <Figure label="Current selection" value={inr(summary.selected)} strong />
            <Figure
              label="All-cheapest"
              value={inr(summary.cheapest)}
              delta={summary.selected - summary.cheapest}
              hint="What it would cost taking the lowest quote on every line"
            />
            {summary.budget > 0 && (
              <Figure
                label="Budget"
                value={inr(summary.budget)}
                delta={summary.selected - summary.budget}
                hint="From the agreed rate cards"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {byVendor.length === 0 ? (
              <span className="text-sm text-gray-400">Decide at least one line to award.</span>
            ) : (
              <>
                <span className="text-sm text-gray-500">
                  {byVendor.length} purchase order{byVendor.length > 1 ? "s" : ""} to raise
                </span>
                <Link
                  href="/vyapar/purchase-order?new=1"
                  className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
                >
                  Award <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>

        {byVendor.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {byVendor.map(([vendor, v]) => (
              <span key={vendor} className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                <span className="font-medium text-gray-800">{vendor}</span> · {v.lines.length} line
                {v.lines.length > 1 ? "s" : ""} · {inr(v.value)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  delta,
  strong,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`tabular-nums ${strong ? "text-xl font-semibold text-gray-900" : "text-base text-gray-700"}`}>
        {value}
      </div>
      {delta != null && Math.round(delta) !== 0 && (
        <div className={`text-xs tabular-nums ${delta > 0 ? "text-amber-700" : "text-emerald-700"}`}>
          {delta > 0 ? "+" : "−"}
          {inr(Math.abs(delta))} {delta > 0 ? "more" : "less"}
        </div>
      )}
    </div>
  );
}
