"use client";

import { useMemo, useState } from "react";
import { Check, FileText, Plus, Search, ShieldAlert, X } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { APPROVAL_CLS, PO_STATUS_CLS } from "@/lib/procurementConfig";
import { APPROVAL_RULES } from "@/lib/procurementTypes";
import { formatRupee } from "@/lib/projectHelpers";

const FILTERS = ["All", "Pending Approval", "Approved", "Partially Received", "Received", "Closed"] as const;

/** Which approver a PO amount routes to, from the threshold rules. */
function approverFor(amount: number): string {
  return APPROVAL_RULES.find((r) => r.upto === null || amount <= r.upto)?.approver ?? "Director";
}

export default function OrdersPage() {
  const pos = useProcurementStore((s) => s.pos);
  const setPoApproval = useProcurementStore((s) => s.setPoApproval);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos.filter((p) => {
      if (filter !== "All" && p.status !== filter) return false;
      if (!q) return true;
      return [p.number, p.vendor, p.project].some((v) => v.toLowerCase().includes(q));
    });
  }, [pos, filter, search]);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Purchase Orders"
        subtitle="Approved orders are a committed spend. Big ones need a higher sign-off before they go out."
        right={
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90">
            <Plus size={15} /> Create PO
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                filter === f ? "bg-cyan-50 text-brand-accent ring-1 ring-inset ring-cyan-600/20" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO, vendor, project"
            className="w-48 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <ProcurementEmpty icon={FileText} title="No purchase orders found" hint="Try a different filter or search." />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const ordered = p.lines.reduce((s, l) => s + l.qty, 0);
            const received = p.lines.reduce((s, l) => s + l.received, 0);
            const pct = ordered ? Math.round((received / ordered) * 100) : 0;
            const showProgress = p.status === "Partially Received" || p.status === "Received";
            return (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{p.number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PO_STATUS_CLS[p.status]}`}>{p.status}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${APPROVAL_CLS[p.approval]}`}>{p.approval}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {p.vendor} · {p.project} · {p.date}
                        {p.rfqRef && <> · from {p.rfqRef}</>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-semibold text-gray-800">{formatRupee(p.amount)}</div>
                    {p.expectedBy && <div className="text-[11px] text-gray-400">expected {p.expectedBy}</div>}
                  </div>
                </div>

                {/* Lines */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                  {p.lines.map((l) => (
                    <span key={l.itemName} className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                      {l.itemName} · <span className="font-medium text-gray-800">{l.qty} {l.unit}</span> @ {formatRupee(l.rate)}
                      {l.received > 0 && l.received < l.qty && <span className="text-violet-600"> · {l.received} in</span>}
                    </span>
                  ))}
                </div>

                {showProgress && (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between text-[11px] text-gray-400">
                      <span>Received</span>
                      <span className="tabular-nums">{received} / {ordered} · {pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full ${pct === 100 ? "bg-emerald-400" : "bg-violet-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {/* Approval action row */}
                {p.approval === "Pending" ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                      <ShieldAlert size={13} /> Needs sign-off by <strong className="font-semibold">{approverFor(p.amount)}</strong>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPoApproval(p.id, "Rejected")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors duration-150 hover:bg-rose-50"
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        onClick={() => setPoApproval(p.id, "Approved")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90"
                      >
                        <Check size={14} /> Approve
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-gray-400">
                    Routed to {approverFor(p.amount)} · {p.approval}
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
