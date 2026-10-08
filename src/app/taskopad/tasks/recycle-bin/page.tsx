"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Recycle, RotateCcw, Search, Trash2 } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { useTaskStore } from "@/lib/taskStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import * as tasksApi from "@/lib/tasksApi";
import { formatTaskDate, statusFromApi } from "@/lib/taskTypes";
import { formatDateTimeIST } from "@/lib/datetime";
import { useCan } from "@/lib/permissions";

/**
 * Recycle Bin — tasks moved out of the list. Restore puts a task back exactly as it was (comments,
 * files and history included); Delete forever removes it for good. You see the tasks you created or
 * deleted; Super Admin sees all of them.
 */
export default function TaskRecycleBinPage() {
  return (
    <TaskopadShell>
      <Bin />
    </TaskopadShell>
  );
}

function Bin() {
  const reload = useTaskStore((s) => s.reload);
  const { users } = useUsers();
  const { projects } = useProjects();
  const canDelete = useCan()("TASKOPAD_TASKS:DELETE");
  const [items, setItems] = useState<tasksApi.DeletedTaskDto[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setItems(await tasksApi.getRecycleBin());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the recycle bin.");
      setItems([]);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const userName = (id: number | null) => (id == null ? "—" : users.find((u) => u.id === String(id))?.name ?? "Unknown");
  const projectName = (id: number | null) => (id == null ? "—" : projects.find((p) => p.id === String(id))?.name ?? "—");
  const shown = (items ?? []).filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()) || i.code.toLowerCase().includes(q.toLowerCase()));
  const all = shown.length > 0 && shown.every((i) => selected.has(i.id));

  async function act(kind: "restore" | "purge", ids: number[]) {
    if (ids.length === 0) return;
    if (kind === "purge" && !confirm(`Delete ${ids.length} task(s) forever? Their comments, sub-tasks and history go too. This can't be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "restore") await tasksApi.restoreTasks(ids);
      else await tasksApi.purgeTasks(ids);
      setSelected(new Set());
      await refresh();
      if (kind === "restore") await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/taskopad/tasks" className="mr-1 flex items-center gap-1 text-lg font-semibold text-gray-800 hover:text-brand-accent">
          <ChevronLeft size={18} /> Recycle Bin
        </Link>
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deleted tasks…" className="w-full bg-transparent text-sm outline-none" />
        </div>
        {canDelete && (
          <>
            <button
              disabled={busy || selected.size === 0}
              onClick={() => void act("restore", [...selected])}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            >
              <RotateCcw size={14} /> Restore {selected.size || ""}
            </button>
            <button
              disabled={busy || selected.size === 0}
              onClick={() => void act("purge", [...selected])}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 size={14} /> Delete forever
            </button>
          </>
        )}
        {busy && <Loader2 size={16} className="animate-spin text-brand-accent" />}
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(shown.map((i) => i.id)))}
                  className="h-4 w-4 accent-cyan-600"
                />
              </th>
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Was</th>
              <th className="px-4 py-2 font-medium">Deleted</th>
              <th className="px-4 py-2 font-medium">By</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items == null ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="mx-auto animate-spin" size={18} />
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  <Recycle className="mx-auto mb-2 text-gray-300" size={26} />
                  The recycle bin is empty.
                </td>
              </tr>
            ) : (
              shown.map((i) => (
                <tr key={i.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(i.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(i.id)) n.delete(i.id);
                          else n.add(i.id);
                          return n;
                        })
                      }
                      className="h-4 w-4 accent-cyan-600"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-700">{i.title}</div>
                    <div className="text-xs text-gray-400">
                      {i.code}
                      {i.dueDate ? ` · due ${formatTaskDate(i.dueDate)}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{projectName(i.projectId)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{userName(i.assigneeId)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{statusFromApi(i.status)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{i.deletedAt ? formatDateTimeIST(i.deletedAt) : "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{userName(i.deletedBy)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canDelete && (
                      <button
                        disabled={busy}
                        onClick={() => void act("restore", [i.id])}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
