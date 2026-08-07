"use client";

import Link from "next/link";
import { Drawer } from "@/components/Drawer";
import { StepEditor } from "@/components/tender/StepEditor";
import { useTenderStore } from "@/lib/tenderStore";
import type { Tender, TenderMilestones } from "@/lib/tenderTypes";
import { tdate, tval } from "@/lib/tenderHelpers";
import { ArrowUpRight, CalendarDays, Check, ListChecks, Pencil, Trash2 } from "lucide-react";

/**
 * Status-tracker detail for a single tender's milestone checklist.
 *
 * Opens when a milestone card is clicked (the card used to open the tender-data drawer — the client
 * wanted the *tracker* detail there instead). Highlights the current stage (the first step still
 * pending), counts what is left, lets each step be toggled, and lets the stage list grow on the fly.
 */
export function TrackerDetailDrawer({
  milestone,
  tender,
  onClose,
  onEdit,
}: {
  milestone: TenderMilestones;
  tender?: Tender;
  onClose: () => void;
  onEdit?: (m: TenderMilestones) => void;
}) {
  const steps = useTenderStore((s) => s.milestoneSteps);
  const toggleMilestone = useTenderStore((s) => s.toggleMilestone);
  const removeMilestone = useTenderStore((s) => s.removeMilestone);
  const addMilestoneStep = useTenderStore((s) => s.addMilestoneStep);
  const removeMilestoneStep = useTenderStore((s) => s.removeMilestoneStep);
  const renameMilestoneStep = useTenderStore((s) => s.renameMilestoneStep);
  // Read live so toggles reflect immediately after a mutation.
  const m = useTenderStore((s) => s.milestones.find((x) => x.id === milestone.id)) ?? milestone;

  const done = steps.filter((s) => m[s.key] === true).length;
  const total = steps.length;
  const pending = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  // Current stage = the first step still pending; if all are done there is no current stage.
  const currentIndex = steps.findIndex((s) => m[s.key] !== true);
  const current = currentIndex >= 0 ? steps[currentIndex] : null;

  function del() {
    if (window.confirm("Remove this tender from the status tracker?")) {
      removeMilestone(m.id);
      onClose();
    }
  }

  return (
    <Drawer title="Status Tracker" onClose={onClose} width="max-w-xl">
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-gray-800">{tval(m.nameOfWork)}</h3>
          <p className="text-sm text-gray-500">Tender ID {tval(m.tenderId)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {tender && (
              <Link
                href={`/tender/${routeForStage(tender)}?open=${tender.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-brand-accent ring-1 ring-inset ring-cyan-600/20 hover:bg-cyan-100"
              >
                Open full tender <ArrowUpRight size={11} />
              </Link>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(m)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                <Pencil size={11} /> Edit
              </button>
            )}
            <button
              onClick={del}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={11} /> Remove
            </button>
          </div>
        </div>

        {/* Summary: progress + current stage + how many are left */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Complete" value={`${done}/${total}`} tone={pending === 0 ? "emerald" : "gray"} />
          <Stat label="Pending" value={String(pending)} tone={pending === 0 ? "emerald" : "amber"} />
          <Stat label="Progress" value={`${pct}%`} tone={pending === 0 ? "emerald" : "gray"} />
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-sm">
          {current ? (
            <span className="text-gray-600">
              Current stage: <span className="font-semibold text-amber-700">{current.label}</span>
              <span className="text-gray-400"> · {pending} stage{pending === 1 ? "" : "s"} pending</span>
            </span>
          ) : (
            <span className="font-medium text-emerald-600">All stages complete 🎉</span>
          )}
        </div>

        {m.workStartDate && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <CalendarDays size={13} /> Work start at {tdate(m.workStartDate)}
          </div>
        )}

        {/* The checklist — the current stage is ringed so it stands out. */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
            <ListChecks size={13} /> Stages
          </div>
          <div className="divide-y divide-gray-50 rounded-xl border border-gray-100">
            {steps.map((step, i) => {
              const on = m[step.key] === true;
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={step.key}
                  onClick={() => toggleMilestone(m.id, step.key)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                    isCurrent ? "bg-amber-50/60 ring-1 ring-inset ring-amber-400/40" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                      on ? "bg-emerald-500 text-white" : "border border-gray-300 text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                  <span className={`flex-1 text-sm ${on ? "text-gray-500 line-through" : "text-gray-700"}`}>
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add / rename / remove stages on the fly — the stage list is not fixed. */}
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Manage stages</div>
          <StepEditor
            title="stage"
            steps={steps}
            onAdd={addMilestoneStep}
            onRemove={removeMilestoneStep}
            onRename={renameMilestoneStep}
          />
        </div>
      </div>
    </Drawer>
  );
}

function routeForStage(t: Tender): string {
  if (t.stage === "SORTING") return "sorting";
  if (t.stage === "RESEARCH") return "research";
  return "applied";
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "gray" }) {
  const text: Record<string, string> = { emerald: "text-emerald-600", amber: "text-amber-600", gray: "text-gray-800" };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <div className={`text-lg font-semibold ${text[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{label}</div>
    </div>
  );
}
