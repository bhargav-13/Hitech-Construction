"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, CirclePause, CirclePlay, Download, Repeat, Search } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { TaskDrawer } from "@/components/task/TaskDrawer";
import { TaskStatusChip, UserAvatar } from "@/components/task/TaskBits";
import { RECURRENCE_OPTIONS, daysLabel, recurrenceLabel } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { CheckList } from "@/components/task/workspace/Toolbar";
import { useTaskStore } from "@/lib/taskStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { useTaskRights } from "@/lib/taskPermissions";
import { formatTaskDate } from "@/lib/taskTypes";
import type { Task } from "@/lib/taskTypes";

/**
 * Primary Recurring Tasks — one line per repeating series (Taskopad's "primary" task), showing its
 * rule, the occurrence that is open now, how many have been done, and whether the series is still
 * running. Stopping a series keeps its history and simply creates no further occurrences.
 */
export default function PrimaryRecurringTasksPage() {
  return (
    <TaskopadShell>
      <RecurringList />
    </TaskopadShell>
  );
}

interface Series {
  key: string;
  /** The occurrence to show: the open one if any, else the latest. */
  current: Task;
  occurrences: Task[];
  done: number;
  stopped: boolean;
}

function RecurringList() {
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const setRecurrenceStopped = useTaskStore((s) => s.setRecurrenceStopped);
  const { users } = useUsers();
  const { projects } = useProjects();
  const { rightsFor } = useTaskRights();
  const [q, setQ] = useState("");
  const [state, setState] = useState<string[]>([]);
  const [freq, setFreq] = useState<string[]>([]);
  const [open, setOpen] = useState<Task | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const series = useMemo<Series[]>(() => {
    const groups = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.isDraft || !t.recurrenceRule || t.recurrenceRule === "NONE") continue;
      const key = t.seriesId ?? t.id;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const today = new Date().toISOString().slice(0, 10);
    return [...groups.entries()].map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
      const openOne = sorted.find((t) => t.status !== "Completed");
      const current = openOne ?? sorted[0];
      const ended = !!current.recurrenceUntil && current.recurrenceUntil < today && !openOne;
      return {
        key,
        current,
        occurrences: sorted,
        done: sorted.filter((t) => t.status === "Completed").length,
        stopped: current.recurrenceStopped || ended,
      };
    });
  }, [tasks]);

  const shown = series.filter((s) => {
    if (q && !s.current.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (state.length && !state.includes(s.stopped ? "stopped" : "ongoing")) return false;
    if (freq.length && !freq.includes(s.current.recurrenceRule)) return false;
    return true;
  });

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  function exportCsv() {
    const head = ["Task", "Repeats", "Days", "Until", "Assignee", "Project", "Current due", "Done", "State"];
    const rows = shown.map((s) => [
      s.current.title,
      recurrenceLabel(s.current.recurrenceRule as RecurrenceRule, s.current.recurrenceInterval),
      daysLabel(s.current.recurrenceDays),
      s.current.recurrenceUntil ?? "",
      userName(s.current.assigneeId),
      projectName(s.current.projectId),
      s.current.dueDate,
      String(s.done),
      s.stopped ? "Stopped" : "Ongoing",
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `recurring-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggle(s: Series) {
    setBusy(s.key);
    try {
      await setRecurrenceStopped(s.current.id, !s.current.recurrenceStopped);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change the series.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/taskopad/tasks" className="mr-1 flex items-center gap-1 text-lg font-semibold text-gray-800 hover:text-brand-accent">
          <ChevronLeft size={18} /> Primary Recurring Tasks
        </Link>
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <Dropdown label="Recurring Status" count={state.length}>
          <CheckList
            searchable={false}
            options={[
              { value: "ongoing", label: "Ongoing", text: "Ongoing" },
              { value: "stopped", label: "Stopped", text: "Stopped" },
            ]}
            values={state}
            onChange={setState}
          />
        </Dropdown>
        <Dropdown label="Frequency" count={freq.length}>
          <CheckList
            searchable={false}
            options={RECURRENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label, text: o.label }))}
            values={freq}
            onChange={setFreq}
          />
        </Dropdown>
        <button onClick={exportCsv} disabled={shown.length === 0} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <Download size={14} /> Bulk Export
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">Task Name</th>
              <th className="px-4 py-2 font-medium">Repeats</th>
              <th className="px-4 py-2 font-medium">Current Due</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Done</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Series</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="bg-white px-4 py-2 text-sm font-semibold text-gray-800">
                Total <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">{shown.length}</span>
              </td>
            </tr>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  <Repeat className="mx-auto mb-2 text-gray-300" size={24} />
                  No recurring tasks{series.length ? " match these filters" : " yet — turn on Recurring Tasks in a task's due date"}.
                </td>
              </tr>
            ) : (
              shown.map((s) => {
                const t = s.current;
                const canEdit = rightsFor(t).canEditAll;
                return (
                  <tr key={s.key} onClick={() => setOpen(t)} className="cursor-pointer border-t border-gray-50 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{t.title}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-accent">
                        <Repeat size={10} /> {recurrenceLabel(t.recurrenceRule as RecurrenceRule, t.recurrenceInterval)}
                      </span>
                      {t.recurrenceDays && <span className="ml-1.5 text-xs text-gray-400">{daysLabel(t.recurrenceDays)}</span>}
                      {t.recurrenceUntil && <div className="text-[11px] text-gray-400">until {formatTaskDate(t.recurrenceUntil)}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatTaskDate(t.dueDate)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={22} />
                        <span className="text-gray-600">{userName(t.assigneeId)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{projectName(t.projectId)}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.done} / {s.occurrences.length}
                    </td>
                    <td className="px-4 py-2.5">
                      <TaskStatusChip task={t} />
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={!canEdit || busy === s.key}
                        onClick={() => void toggle(s)}
                        title={canEdit ? undefined : "Only the task's creator can stop or resume the series"}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          s.stopped ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {s.stopped ? <CirclePlay size={13} /> : <CirclePause size={13} />}
                        {s.stopped ? "Stopped · Resume" : "Ongoing · Stop"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {open && <TaskDrawer existing={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Dropdown({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-3 py-2 text-sm ${count || open ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
      >
        {label}
        {count > 0 && ` · ${count}`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-menu-pop absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">{children}</div>
        </>
      )}
    </div>
  );
}
