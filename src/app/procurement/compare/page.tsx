"use client";

import { useMemo, useState } from "react";
import { Award, CheckCircle2, Clock, Scale, Star, Trophy } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { RFQ_STATUS_CLS } from "@/lib/procurementConfig";
import { formatRupee } from "@/lib/projectHelpers";

export default function ComparePage() {
  const rfqs = useProcurementStore((s) => s.rfqs);
  const awardRfq = useProcurementStore((s) => s.awardRfq);

  // Only RFQs with at least one quote can be compared.
  const comparable = useMemo(() => rfqs.filter((r) => r.quotes.length > 0), [rfqs]);
  const [selectedId, setSelectedId] = useState<string | null>(comparable[0]?.id ?? null);
  const rfq = comparable.find((r) => r.id === selectedId) ?? comparable[0] ?? null;

  if (!rfq) {
    return (
      <ProcurementShell>
        <ProcurementHeader title="Comparison" subtitle="Compare vendor quotes and award the order." />
        <ProcurementEmpty icon={Scale} title="Nothing to compare yet" hint="RFQs with vendor quotes will appear here." />
      </ProcurementShell>
    );
  }

  const cheapest = Math.min(...rfq.quotes.map((q) => q.amount));
  const fastest = Math.min(...rfq.quotes.map((q) => q.deliveryDays));
  const bestRated = Math.max(...rfq.quotes.map((q) => q.rating));

  return (
    <ProcurementShell>
      <ProcurementHeader title="Comparative Statement" subtitle="Weigh price, delivery and track record, then award the order to one vendor." />

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* RFQ selector */}
        <div className="space-y-1.5">
          {comparable.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                r.id === rfq.id ? "border-brand-accent bg-cyan-50/60" : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="text-xs font-semibold text-gray-800">{r.number}</div>
              <div className="mt-0.5 truncate text-[11px] text-gray-500">{r.title}</div>
              <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${RFQ_STATUS_CLS[r.status]}`}>{r.status}</span>
            </button>
          ))}
        </div>

        {/* Comparative table */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">{rfq.title}</h2>
              <p className="text-xs text-gray-400">{rfq.project} · {rfq.quotes.length} quotes</p>
            </div>
            {rfq.awardedVendor && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <Trophy size={13} /> Awarded to {rfq.awardedVendor}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">Vendor</th>
                  <th className="py-2 px-2 text-right font-medium">Quote</th>
                  <th className="py-2 px-2 text-right font-medium">Delivery</th>
                  <th className="py-2 px-2 text-center font-medium">Rating</th>
                  <th className="py-2 pl-2 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {[...rfq.quotes]
                  .sort((a, b) => a.amount - b.amount)
                  .map((q) => {
                    const isWinner = rfq.awardedVendor === q.vendor;
                    return (
                      <tr key={q.vendor} className={`border-b border-gray-50 last:border-b-0 ${isWinner ? "bg-emerald-50/40" : ""}`}>
                        <td className="py-2.5 pr-2">
                          <div className="font-medium text-gray-800">{q.vendor}</div>
                          {q.note && <div className="text-[11px] text-gray-400">{q.note}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className={`font-medium tabular-nums ${q.amount === cheapest ? "text-emerald-600" : "text-gray-700"}`}>{formatRupee(q.amount)}</span>
                          {q.amount === cheapest && <div className="text-[10px] font-medium text-emerald-600">lowest</div>}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <span className={`inline-flex items-center gap-1 tabular-nums ${q.deliveryDays === fastest ? "text-cyan-600" : "text-gray-600"}`}>
                            <Clock size={12} /> {q.deliveryDays}d
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 ${q.rating === bestRated ? "text-amber-500" : "text-gray-400"}`}>
                            <Star size={12} className="fill-current" /> {q.rating.toFixed(0)}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          {rfq.awardedVendor ? (
                            isWinner ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <CheckCircle2 size={14} /> Awarded
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )
                          ) : (
                            <button
                              onClick={() => awardRfq(rfq.id, q.vendor)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
                            >
                              <Award size={13} /> Award
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {!rfq.awardedVendor && (
            <p className="mt-3 text-xs text-gray-400">
              Awarding creates a draft Purchase Order for that vendor (demo — the PO already exists in the Orders tab).
            </p>
          )}
        </div>
      </div>
    </ProcurementShell>
  );
}
