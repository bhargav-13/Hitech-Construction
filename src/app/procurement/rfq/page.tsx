"use client";

import Link from "next/link";
import { Plus, Scale, Send, Users } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { RFQ_STATUS_CLS } from "@/lib/procurementConfig";
import { formatRupee } from "@/lib/projectHelpers";

export default function RfqPage() {
  const rfqs = useProcurementStore((s) => s.rfqs);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Requests for Quotation"
        subtitle="Ask several vendors for a price, then compare their quotes side by side."
        right={
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90">
            <Plus size={15} /> New RFQ
          </button>
        }
      />

      {rfqs.length === 0 ? (
        <ProcurementEmpty icon={Send} title="No RFQs yet" hint="Raise one from an open indent." />
      ) : (
        <div className="space-y-3">
          {rfqs.map((r) => {
            const best = r.quotes.length ? Math.min(...r.quotes.map((q) => q.amount)) : null;
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{r.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${RFQ_STATUS_CLS[r.status]}`}>{r.status}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-gray-700">{r.title}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {r.project} · {r.date}
                      {r.indentRef && <> · from {r.indentRef}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
                        <Users size={12} /> Invited
                      </div>
                      <div className="text-sm font-semibold text-gray-700">{r.vendorsInvited}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Quotes in</div>
                      <div className="text-sm font-semibold text-gray-700">{r.quotes.length}</div>
                    </div>
                  </div>
                </div>

                {/* Quote preview */}
                {r.quotes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                    {r.quotes.map((q) => {
                      const isBest = q.amount === best;
                      const isWinner = r.awardedVendor === q.vendor;
                      return (
                        <span
                          key={q.vendor}
                          className={`rounded-lg px-2.5 py-1 text-xs ring-1 ring-inset ${
                            isWinner
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                              : isBest
                                ? "bg-cyan-50 text-cyan-700 ring-cyan-600/20"
                                : "bg-gray-50 text-gray-600 ring-transparent"
                          }`}
                        >
                          {q.vendor} · <span className="font-medium">{formatRupee(q.amount)}</span>
                          {isWinner && " · awarded"}
                          {!isWinner && isBest && " · lowest"}
                        </span>
                      );
                    })}
                  </div>
                )}

                {(r.status === "Responses In" || r.status === "Awarded") && (
                  <div className="mt-3">
                    <Link href="/procurement/compare" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-accent hover:underline">
                      <Scale size={13} /> Open comparison
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ProcurementShell>
  );
}
