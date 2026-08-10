"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search, Send } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { INDENT_STATUS_CLS, PRIORITY_CLS } from "@/lib/procurementConfig";

const FILTERS = ["All", "Open", "RFQ Raised", "Ordered", "Closed"] as const;

export default function IndentsPage() {
  const indents = useProcurementStore((s) => s.indents);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return indents.filter((i) => {
      if (filter !== "All" && i.status !== filter) return false;
      if (!q) return true;
      return [i.number, i.project, i.requestedBy, ...i.lines.map((l) => l.itemName)]
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [indents, filter, search]);

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Indents"
        subtitle="Material requisitions raised at each site — the start of every purchase."
        right={
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90">
            <Plus size={15} /> New Indent
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
            placeholder="Search indent, project, item"
            className="w-52 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <ProcurementEmpty icon={ClipboardList} title="No indents found" hint="Try a different filter or search." />
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <div key={i.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{i.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${INDENT_STATUS_CLS[i.status]}`}>{i.status}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PRIORITY_CLS[i.priority]}`}>{i.priority}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {i.project} · by {i.requestedBy} · raised {i.date} · needed {i.neededBy}
                    </div>
                  </div>
                </div>
                {i.status === "Open" && (
                  <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-brand-accent/5">
                    <Send size={14} /> Raise RFQ
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                {i.lines.map((l) => (
                  <span key={l.itemName} className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                    {l.itemName} · <span className="font-medium text-gray-800">{l.qty} {l.unit}</span>
                  </span>
                ))}
              </div>

              {i.note && <p className="mt-2 text-xs text-gray-400">{i.note}</p>}
            </div>
          ))}
        </div>
      )}
    </ProcurementShell>
  );
}
