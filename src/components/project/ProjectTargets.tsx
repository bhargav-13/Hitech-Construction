"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, Target as TargetIcon, Trash2 } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { inr } from "@/lib/format";
import { boqTotals, itemCalc, targetProgress, targetStatus, useProjectBoqStore } from "@/lib/projectBoqStore";
import type { ProjectBoq as ProjectBoqType, Target, TargetStatus } from "@/lib/projectBoqTypes";

/**
 * Targets — the project's own screen for what is actually being built.
 *
 * <p>Separate from the BOQ on purpose. The BOQ is the commercial document: what we bill and what we
 * budgeted. Targets are the site's view of the same rows — how much of each is done — and the
 * people who open them are not the people reading margins. Sharing a screen made the site team
 * scroll past a wall of money to find their work.
 *
 * <p>They read the way the client already reads work in OnSite: a quantity, not a percentage.
 */
export function ProjectTargets({ projectId }: { projectId: number }) {
  const boq = useProjectBoqStore((s) => s.boqs.find((b) => b.projectId === projectId) ?? null);
  const generateTargets = useProjectBoqStore((s) => s.generateTargets);

  if (!boq) {
    return (
      <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
          <TargetIcon size={24} />
        </div>
        <div className="text-base font-semibold text-gray-700">No targets yet</div>
        <p className="mt-1 max-w-md text-sm text-gray-400">
          Targets are built from the project&apos;s BOQ items, so the work being measured is the work being billed.
          Create the BOQ first and the targets follow.
        </p>
        <Link
          href={`/project/${projectId}`}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          Go to the BOQ tab <ArrowUpRight size={12} />
        </Link>
      </div>
    );
  }

  const totals = boqTotals(boq);

  return (
    <div className="animate-fade-in space-y-4">
      <header className="grid grid-cols-2 divide-x divide-gray-100 rounded-xl border border-gray-200 bg-white lg:grid-cols-4">
        <Stat label="Targets" value={`${totals.targetsComplete}/${totals.targetCount}`} sub="complete" />
        <Stat label="Physical progress" value={`${totals.progressPct.toFixed(1)}%`} sub="by value of work done" />
        <Stat label="Work done" value={inr(totals.doneValue)} sub={`of ${inr(totals.value)} BOQ value`} />
        <Stat label="Remaining" value={inr(totals.value - totals.doneValue)} sub="still to build" />
      </header>

      <TargetsTable boq={boq} onGenerate={(mode) => generateTargets(boq.id, mode)} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-gray-800">{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

/**
 * Targets, laid out the way the client already reads work in OnSite: a serial, the name, a status
 * dot, a quantity pill (`5,655 / 6,360 RMT`), whether it is running late, who is on it, how long it
 * runs and its schedule.
 *
 * <p>Progress is a **quantity**, never a typed percentage — that is the whole reason targets exist
 * rather than tasks. A row opens a drawer with the running log of what was reported, by whom.
 */

const TARGET_STATUS_META = {
  NOT_STARTED: { label: "Not started", dot: "bg-slate-400", text: "text-slate-500" },
  IN_PROGRESS: { label: "Ongoing", dot: "bg-blue-500", text: "text-blue-600" },
  COMPLETED: { label: "Completed", dot: "bg-emerald-500", text: "text-emerald-600" },
} as const;

/** Working days between two dates, Sundays excluded — the "wd" OnSite shows. */
function workingDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return null;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
    : null;

/**
 * Whether a target is behind. Compares how much is built against how much of its window has gone —
 * a target 20% done with 80% of its time spent is at risk even though nothing is formally overdue.
 */
function delayOf(t: Target): { label: string; tone: string } {
  const done = targetProgress(t);
  if (done >= 1) return { label: "Done", tone: "text-emerald-600" };
  if (!t.startDate || !t.dueDate) return { label: "—", tone: "text-gray-300" };
  const start = +new Date(t.startDate);
  const end = +new Date(t.dueDate);
  const now = Date.now();
  if (now < start) return { label: "Not started", tone: "text-gray-400" };
  const elapsed = end > start ? (now - start) / (end - start) : 1;
  // Ten points of slack before calling a target late; site work is lumpy day to day.
  return elapsed - done > 0.1 ? { label: "At Risk", tone: "text-amber-600" } : { label: "On Track", tone: "text-emerald-600" };
}

function TargetsTable({ boq, onGenerate }: { boq: ProjectBoqType; onGenerate: (m: "PER_GROUP" | "PER_LINE") => void }) {
  const removeTarget = useProjectBoqStore((s) => s.removeTarget);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"ALL" | TargetStatus>("ALL");

  const rows = useMemo(
    () => boq.targets.filter((t) => status === "ALL" || targetStatus(t) === status),
    [boq.targets, status],
  );

  if (boq.targets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <TargetIcon size={22} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-500">No targets on this BOQ yet.</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-gray-400">
          Targets measure work in the BOQ&apos;s own units — &ldquo;5,655 of 6,360 RMT laid&rdquo; — which is what
          drives physical progress and earned value. Build them from the {boq.items.length} items now.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onGenerate("PER_GROUP")}
            className="rounded-lg bg-brand-accent px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            One target per family
          </button>
          <button
            type="button"
            onClick={() => onGenerate("PER_LINE")}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            One per item ({boq.items.length})
          </button>
        </div>
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      {/* Toolbar — the filters OnSite puts above its task list. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "ALL" | TargetStatus)}
          aria-label="Filter by status"
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-600 focus:border-brand-accent focus:outline-none"
        >
          <option value="ALL">All Status</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">Ongoing</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <span className="text-xs text-gray-400">
          {rows.length} of {boq.targets.length} targets · {boq.items.length} BOQ items
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerate("PER_GROUP")}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Rebuild per family
          </button>
          <button
            type="button"
            onClick={() => onGenerate("PER_LINE")}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Rebuild per item
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="w-14 px-3 py-3 text-left font-medium">S No.</th>
              <th className="px-3 py-3 text-left font-medium">Target name</th>
              <th className="px-3 py-3 text-left font-medium">Status</th>
              <th className="px-3 py-3 text-left font-medium">Progress</th>
              <th className="px-3 py-3 text-left font-medium">Delay</th>
              <th className="px-3 py-3 text-right font-medium">Value earned</th>
              <th className="px-3 py-3 text-right font-medium">Duration</th>
              <th className="px-3 py-3 text-left font-medium">Schedule</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const st = targetStatus(t);
              const meta = TARGET_STATUS_META[st];
              const delay = delayOf(t);
              const members = boq.items.filter((x) => x.targetId === t.id);
              const earned = members.reduce((sum, x) => sum + itemCalc(x, boq.targets).doneValue, 0);
              const wd = workingDays(t.startDate, t.dueDate);
              const isOpen = expanded.has(t.id);

              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-gray-100 transition-colors duration-150 hover:bg-gray-50/70">
                    <td className="px-3 py-3 text-xs tabular-nums text-gray-400">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggle(t.id)}
                            aria-label={isOpen ? `Collapse ${t.name}` : `Expand ${t.name}`}
                            className="text-gray-400 transition-colors duration-150 hover:text-gray-600"
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpen(t.id)}
                          className="max-w-[280px] truncate text-left font-semibold text-gray-800 hover:text-brand-accent"
                          title={t.name}
                        >
                          {t.name}
                        </button>
                      </div>
                      {members.length > 1 && (
                        <span className="ml-5 text-[11px] text-gray-400">{members.length} BOQ items</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm ${meta.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <QtyPill target={t} />
                    </td>
                    <td className={`px-3 py-3 text-sm font-medium ${delay.tone}`}>{delay.label}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{inr(earned)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                      {wd == null ? <span className="text-gray-300">—</span> : <>{wd} <span className="text-[11px] text-gray-400">wd</span></>}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-gray-500">
                      {t.startDate || t.dueDate ? (
                        `${shortDate(t.startDate) ?? "—"} - ${shortDate(t.dueDate) ?? "—"}`
                      ) : (
                        <span className="text-gray-300">Not scheduled</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeTarget(boq.id, t.id)}
                        aria-label={`Remove target ${t.name}`}
                        className="text-gray-300 transition-colors duration-150 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>

                  {isOpen &&
                    members.map((m) => {
                      const c = itemCalc(m, boq.targets);
                      return (
                        <tr key={m.id} className="border-b border-gray-50 bg-gray-50/40">
                          <td />
                          <td className="py-2 pr-3 pl-10 text-[13px] text-gray-600">
                            <span className="mr-1.5 text-gray-400">{m.srNo}</span>
                            {m.description}
                          </td>
                          <td colSpan={2} className="px-3 py-2 text-xs tabular-nums text-gray-500">
                            {m.qty.toLocaleString("en-IN")} {m.unit}
                          </td>
                          <td />
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-500">{inr(c.doneValue)}</td>
                          <td colSpan={3} />
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <TargetDrawer
          boq={boq}
          target={boq.targets.find((t) => t.id === open)!}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The quantity pill: done, total and unit — OnSite's `5,655 / 6,360 RMT`. */
function QtyPill({ target }: { target: Target }) {
  const pr = targetProgress(target);
  const n = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (
    <span
      className="relative inline-flex items-center overflow-hidden rounded-full bg-gray-100 px-3 py-1"
      title={`${(pr * 100).toFixed(1)}% complete`}
    >
      <span
        className="absolute inset-y-0 left-0 bg-cyan-200/60"
        style={{ width: `${pr * 100}%` }}
        aria-hidden
      />
      <span className="relative text-[13px] font-semibold tabular-nums text-gray-800">{n(target.doneQty)}</span>
      <span className="relative text-[13px] tabular-nums text-gray-400">&nbsp;/ {n(target.targetQty)}</span>
      <span className="relative ml-1 text-[10px] tracking-wide text-gray-400 uppercase">{target.unit}</span>
    </span>
  );
}

/**
 * One target, opened: its numbers at the top, then the running log of what was reported against it
 * and a composer to add to that log. Mirrors the drawer OnSite opens from a task row.
 */
function TargetDrawer({ boq, target, onClose }: { boq: ProjectBoqType; target: Target; onClose: () => void }) {
  const logProgress = useProjectBoqStore((s) => s.logProgress);
  const removeEntry = useProjectBoqStore((s) => s.removeEntry);
  const updateTarget = useProjectBoqStore((s) => s.updateTarget);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const st = targetStatus(target);
  const meta = TARGET_STATUS_META[st];
  const pr = targetProgress(target);
  const members = boq.items.filter((x) => x.targetId === target.id);
  const earned = members.reduce((s, x) => s + itemCalc(x, boq.targets).doneValue, 0);
  const remaining = target.targetQty - target.doneQty;
  const n = Number(qty);
  const valid = Number.isFinite(n) && n > 0;

  return (
    <Drawer title={target.name} onClose={onClose} width="max-w-2xl" guardOnClose={false}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <QtyPill target={target} />
          <span className={`inline-flex items-center gap-1.5 text-sm ${meta.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className="ml-auto text-sm tabular-nums text-gray-500">
            {(pr * 100).toFixed(1)}% · {inr(earned)} earned
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-gray-50/60 p-4 sm:grid-cols-3">
          <Meta label="BOQ items">{members.length}</Meta>
          <Meta label="Unit">{target.unit}</Meta>
          <Meta label="Remaining">
            {remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {target.unit}
          </Meta>
          <Meta label="Start">
            <input
              type="date"
              value={target.startDate ?? ""}
              onChange={(e) => updateTarget(boq.id, target.id, { startDate: e.target.value || null })}
              aria-label="Start date"
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs focus:border-brand-accent focus:outline-none"
            />
          </Meta>
          <Meta label="Due">
            <input
              type="date"
              value={target.dueDate ?? ""}
              onChange={(e) => updateTarget(boq.id, target.id, { dueDate: e.target.value || null })}
              aria-label="Due date"
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs focus:border-brand-accent focus:outline-none"
            />
          </Meta>
          <Meta label="Assigned to">
            <input
              value={target.assignee ?? ""}
              onChange={(e) => updateTarget(boq.id, target.id, { assignee: e.target.value || null })}
              placeholder="—"
              aria-label="Assigned to"
              className="w-28 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
            />
          </Meta>
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">BOQ items covered</h3>
          <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="w-8 shrink-0 text-gray-400">{m.srNo}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600" title={m.description}>
                  {m.description}
                </span>
                <span className="shrink-0 tabular-nums text-gray-500">
                  {m.qty.toLocaleString("en-IN")} {m.unit}
                </span>
              </li>
            ))}
            {members.length === 0 && <li className="px-3 py-3 text-xs text-gray-400">No BOQ items linked.</li>}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Progress</h3>
          {target.entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
              Nothing reported yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {target.entries.map((e) => (
                <li key={e.id} className="rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <span>{e.by ?? "Site"}</span>
                    <span>·</span>
                    <span>{shortDate(e.date)}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(boq.id, target.id, e.id)}
                      aria-label="Remove this entry"
                      className="ml-auto text-gray-300 transition-colors duration-150 hover:text-rose-600"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-800">
                    {e.qty.toLocaleString("en-IN")} {target.unit}
                  </div>
                  {e.note && <div className="mt-0.5 text-xs text-gray-500">{e.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <form
        className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          logProgress(boq.id, target.id, n, note.trim() || undefined);
          setQty("");
          setNote("");
        }}
      >
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label={`Quantity done in ${target.unit}`}
          className="w-24 rounded-lg border border-gray-200 px-2.5 py-2 text-right text-sm tabular-nums focus:border-brand-accent focus:outline-none"
        />
        <span className="text-xs text-gray-400">{target.unit}</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note — chainage, gang, anything worth recording"
          aria-label="Note"
          className="min-w-[180px] flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!valid || st === "COMPLETED"}
          className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          + Progress
        </button>
        {valid && n > remaining && (
          <p className="w-full text-[11px] text-amber-700">
            More than remains — it will be capped at {remaining.toLocaleString("en-IN")} {target.unit}.
          </p>
        )}
      </form>
    </Drawer>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}

