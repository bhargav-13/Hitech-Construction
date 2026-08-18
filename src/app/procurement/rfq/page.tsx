"use client";

import Link from "next/link";
import { Plus, Scale, Send } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { RFQ_STATUS_CLS } from "@/lib/procurementConfig";
import { inr } from "@/lib/format";

/**
 * RFQ list — enquiries out to suppliers.
 *
 * A quote is priced per line, so the list shows the range across responses rather than a single
 * "amount": with a five-line enquiry split across three suppliers there is no one number, and
 * showing one would invite a decision the comparison screen exists to make properly.
 */
export default function RfqPage() {
  const rfqs = useProcurementStore((s) => s.rfqs);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="RFQ"
        subtitle="What we've asked suppliers to quote, and what has come back."
        right={
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90">
            <Plus size={15} /> New RFQ
          </button>
        }
      />

      {rfqs.length === 0 ? (
        <ProcurementEmpty icon={Send} title="No enquiries yet" hint="Raise an RFQ to ask suppliers for a price." />
      ) : (
        <div className="space-y-3">
          {rfqs.map((r) => {
            const decided = r.lines.filter((l) => l.awardedTo).length;
            // The cheapest and dearest way to buy the whole enquiry, line by line.
            const range = r.lines.reduce(
              (acc, line, i) => {
                const rates = r.quotes.map((q) => q.lines[i]?.rate).filter((x): x is number => x != null);
                if (!rates.length) return acc;
                return {
                  low: acc.low + Math.min(...rates) * line.qty,
                  high: acc.high + Math.max(...rates) * line.qty,
                };
              },
              { low: 0, high: 0 },
            );

            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{r.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${RFQ_STATUS_CLS[r.status]}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-gray-600">{r.title}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {r.project} · raised {r.date}
                      {r.dueBy && <> · replies due {r.dueBy}</>}
                    </div>
                  </div>

                  {r.quotes.length > 0 && (
                    <Link
                      href="/procurement/compare"
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-brand-accent/5"
                    >
                      <Scale size={14} /> Compare
                    </Link>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-gray-50 pt-3 text-xs text-gray-500">
                  <span>
                    {r.lines.length} line{r.lines.length > 1 ? "s" : ""}
                  </span>
                  <span>
                    {r.quotes.length} quote{r.quotes.length === 1 ? "" : "s"} in
                  </span>
                  {range.low > 0 && (
                    <span className="tabular-nums">
                      {inr(range.low)}
                      {range.high > range.low && <> – {inr(range.high)}</>}
                    </span>
                  )}
                  {decided > 0 && (
                    <span className="font-medium text-emerald-700">
                      {decided} of {r.lines.length} awarded
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ProcurementShell>
  );
}
