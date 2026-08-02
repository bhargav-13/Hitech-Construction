"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { useTenderStore } from "@/lib/tenderStore";
import { MILESTONE_STEPS } from "@/lib/tenderTypes";
import type { TenderMilestones } from "@/lib/tenderTypes";
import { tdate, tval } from "@/lib/tenderHelpers";
import { Check, ListChecks, Search } from "lucide-react";

/** Progress across the 11 milestone steps. */
function progressOf(m: TenderMilestones) {
  const done = MILESTONE_STEPS.filter((s) => m[s.key] === true).length;
  return Math.round((done / MILESTONE_STEPS.length) * 100);
}

export default function TenderTrackerPage() {
  const milestones = useTenderStore((s) => s.milestones);
  const toggleMilestone = useTenderStore((s) => s.toggleMilestone);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return milestones;
    return milestones.filter((m) => (m.nameOfWork ?? "").toLowerCase().includes(q) || (m.tenderId ?? "").toLowerCase().includes(q));
  }, [milestones, search]);

  return (
    <TenderShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Status Tracker</h1>
            <p className="text-sm text-gray-500">Milestone checklist per tender — click any cell to toggle it.</p>
          </div>
          <div className="text-sm text-gray-500">{filtered.length} tenders</div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name of work or tender ID"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <TenderEmpty icon={ListChecks} title="No tenders tracked" hint="Try a different search." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-medium">Name of Work</th>
                  {MILESTONE_STEPS.map((s) => (
                    <th key={String(s.key)} className="px-2 py-2 text-center text-[10px] font-medium whitespace-nowrap">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Work Start</th>
                  <th className="px-3 py-2 text-left font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const pct = progressOf(m);
                  return (
                    <tr key={m.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                      <td className="sticky left-0 z-10 max-w-[280px] bg-white px-4 py-2.5 text-gray-700">
                        <span className="block truncate" title={m.nameOfWork ?? ""}>{tval(m.nameOfWork)}</span>
                        <span className="text-[11px] text-gray-400">{tval(m.tenderId)}</span>
                      </td>
                      {MILESTONE_STEPS.map((s) => {
                        const on = m[s.key] === true;
                        return (
                          <td key={String(s.key)} className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => toggleMilestone(m.id, s.key)}
                              aria-label={`${s.label}: ${on ? "done" : "pending"}`}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 active:scale-90 ${
                                on
                                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                  : "border border-gray-200 text-transparent hover:border-emerald-300 hover:text-emerald-200"
                              }`}
                            >
                              <Check size={13} />
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{tdate(m.workStartDate)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-accent"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs whitespace-nowrap text-gray-500">{m.progress ? m.progress : `${pct}%`}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TenderShell>
  );
}
