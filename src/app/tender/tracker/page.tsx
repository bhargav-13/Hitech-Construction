"use client";

import { useMemo, useState } from "react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { StepEditor } from "@/components/tender/StepEditor";
import { TenderDetailDrawer } from "@/components/tender/TenderDetailDrawer";
import { useTenderStore } from "@/lib/tenderStore";
import type { Tender, TenderMilestones, TrackerStep } from "@/lib/tenderTypes";
import { tdate, tval } from "@/lib/tenderHelpers";
import { CalendarDays, ListChecks, Search, SlidersHorizontal } from "lucide-react";

export default function TenderTrackerPage() {
  const milestones = useTenderStore((s) => s.milestones);
  const tenders = useTenderStore((s) => s.tenders);
  const steps = useTenderStore((s) => s.milestoneSteps);
  const toggleMilestone = useTenderStore((s) => s.toggleMilestone);
  const addMilestoneStep = useTenderStore((s) => s.addMilestoneStep);
  const removeMilestoneStep = useTenderStore((s) => s.removeMilestoneStep);
  const renameMilestoneStep = useTenderStore((s) => s.renameMilestoneStep);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Tender | null>(null);

  // Each milestone row links back to a tender by its portal tender ID, so clicking a card can open
  // the full tender detail.
  const tenderByPortalId = useMemo(() => {
    const map = new Map<string, Tender>();
    for (const t of tenders) if (t.tenderId) map.set(t.tenderId, t);
    return map;
  }, [tenders]);

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
            <p className="text-sm text-gray-500">Milestone checklist per tender — click any step to toggle it.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                editing ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal size={14} /> Edit steps
            </button>
            <div className="text-sm text-gray-500">{filtered.length} tenders</div>
          </div>
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

        {editing && (
          <StepEditor
            title="milestone"
            steps={steps}
            onAdd={addMilestoneStep}
            onRemove={removeMilestoneStep}
            onRename={renameMilestoneStep}
          />
        )}

        {filtered.length === 0 ? (
          <TenderEmpty icon={ListChecks} title="No tenders tracked" hint="Try a different search." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((m) => {
              const tender = m.tenderId ? tenderByPortalId.get(m.tenderId) : undefined;
              return (
                <MilestoneCard
                  key={m.id}
                  m={m}
                  steps={steps}
                  onToggle={(key) => toggleMilestone(m.id, key)}
                  onOpen={tender ? () => setSelected(tender) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {selected && <TenderDetailDrawer tender={selected} onClose={() => setSelected(null)} />}
    </TenderShell>
  );
}

function MilestoneCard({
  m,
  steps,
  onToggle,
  onOpen,
}: {
  m: TenderMilestones;
  steps: TrackerStep[];
  onToggle: (key: string) => void;
  onOpen?: () => void;
}) {
  const done = steps.filter((s) => m[s.key] === true).length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;

  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`rounded-xl border border-gray-200 bg-white p-4 transition-all duration-150 ${
        onOpen ? "cursor-pointer hover:border-cyan-300 hover:shadow-sm" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-800" title={m.nameOfWork ?? ""}>
            {tval(m.nameOfWork)}
          </h3>
          <p className="text-[11px] text-gray-400">{tval(m.tenderId)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
            complete ? "bg-emerald-50 text-emerald-600 ring-emerald-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"
          }`}
        >
          {complete ? "Complete" : "In Progress"}
        </span>
      </div>

      {/* Milestone segments — one clickable bar per step. Scrolls sideways when there are many.
          Stops propagation so toggling a step doesn't also open the card's detail drawer. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" onClick={(e) => e.stopPropagation()}>
        {steps.map((s) => {
          const on = m[s.key] === true;
          return (
            <button
              key={s.key}
              onClick={() => onToggle(s.key)}
              title={`${s.label}: ${on ? "done" : "pending"}`}
              className="group flex min-w-[52px] flex-1 flex-col items-center gap-1"
            >
              <span className="w-full truncate text-center text-[9px] font-medium text-gray-500" title={s.label}>
                {s.label}
              </span>
              <span className={`h-1.5 w-full rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-gray-200 group-hover:bg-emerald-200"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {done}/{total} Milestone Complete
        </span>
        <span className={`font-semibold ${complete ? "text-emerald-600" : "text-gray-600"}`}>{pct}%</span>
      </div>

      {m.workStartDate ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
          <CalendarDays size={12} /> Work start at {tdate(m.workStartDate)}
        </div>
      ) : null}
    </div>
  );
}
