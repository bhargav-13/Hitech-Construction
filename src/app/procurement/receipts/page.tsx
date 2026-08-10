"use client";

import Link from "next/link";
import { Plus, Receipt, Truck } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { GRN_STATUS_CLS } from "@/lib/procurementConfig";

export default function ReceiptsPage() {
  const grns = useProcurementStore((s) => s.grns);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Goods Receipt"
        subtitle="What actually arrived at site, checked against the order. A matched receipt becomes a Vyapar Purchase Bill."
        right={
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90">
            <Plus size={15} /> Record Receipt
          </button>
        }
      />

      {grns.length === 0 ? (
        <ProcurementEmpty icon={Truck} title="No receipts yet" hint="Receipts recorded against a PO show here." />
      ) : (
        <div className="space-y-3">
          {grns.map((g) => (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                    <Truck size={18} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{g.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${GRN_STATUS_CLS[g.status]}`}>{g.status}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      against <span className="font-medium text-cyan-600">{g.poNumber}</span> · {g.vendor} · {g.project} · {g.date}
                    </div>
                  </div>
                </div>
                {g.status === "Billed" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
                    <Receipt size={14} /> Billed in Vyapar
                  </span>
                ) : (
                  <Link
                    href="/vyapar/purchase"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-brand-accent/5"
                    title="Runs the 3-way match and creates a Vyapar Purchase Bill"
                  >
                    <Receipt size={14} /> Convert to Bill
                  </Link>
                )}
              </div>

              {/* Lines: ordered vs received */}
              <div className="mt-3 overflow-x-auto border-t border-gray-50 pt-3">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="pb-1.5 pr-2 font-medium">Item</th>
                      <th className="pb-1.5 px-2 text-right font-medium">Ordered</th>
                      <th className="pb-1.5 px-2 text-right font-medium">Received</th>
                      <th className="pb-1.5 pl-2 text-right font-medium">Short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l) => {
                      const short = l.ordered - l.received;
                      return (
                        <tr key={l.itemName} className="border-t border-gray-50">
                          <td className="py-1.5 pr-2 text-gray-700">{l.itemName}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{l.ordered} {l.unit}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-medium text-gray-800">{l.received} {l.unit}</td>
                          <td className={`py-1.5 pl-2 text-right tabular-nums ${short > 0 ? "text-rose-600" : "text-gray-300"}`}>
                            {short > 0 ? `${short} ${l.unit}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </ProcurementShell>
  );
}
