"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { StatusRowChip } from "@/components/task/TaskBits";
import { Select } from "@/components/Select";
import { useTaskStatuses, useTaskStatusStore } from "@/lib/useTaskStatuses";
import type { StatusRow } from "@/lib/useTaskStatuses";
import * as tasksApi from "@/lib/tasksApi";
import { useCan } from "@/lib/permissions";
import { TASK_STATUSES } from "@/lib/taskTypes";
import type { TaskStatus } from "@/lib/taskTypes";

type Tab = "statuses" | "quick-replies";

/**
 * Taskopad settings — the company's own task vocabulary.
 *  - Statuses: name + colour, each mapped onto a base state (what approvals and reports read).
 *  - Quick Replies: saved messages that drop into a task's chat in one click.
 */
export default function TaskopadSettingsPage() {
  return (
    <TaskopadShell>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </TaskopadShell>
  );
}

function Settings() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params?.get("tab") === "quick-replies" ? "quick-replies" : "statuses";
  const go = (t: Tab) => router.replace(t === "statuses" ? "/taskopad/settings" : "/taskopad/settings?tab=quick-replies");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            { key: "statuses", label: "Task Statuses" },
            { key: "quick-replies", label: "Quick Replies" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-brand-accent text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "statuses" ? <Statuses /> : <QuickReplies />}
    </div>
  );
}

const SWATCHES = ["#f59e0b", "#8b5cf6", "#3b82f6", "#f97316", "#06b6d4", "#22c55e", "#ef4444", "#ec4899", "#14b8a6", "#64748b"];

function Statuses() {
  const { rows } = useTaskStatuses();
  const save = useTaskStatusStore((s) => s.save);
  const remove = useTaskStatusStore((s) => s.remove);
  const canEdit = useCan()("TASKOPAD_SETTINGS:EDIT");
  const [editing, setEditing] = useState<StatusRow | "new" | null>(null);
  const [error, setError] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Task statuses</h3>
          <p className="mt-0.5 max-w-xl text-xs text-gray-500">
            Name your stages the way your team works. Each status counts as one of the built-in states, so approvals, overdue and
            reports keep working — &ldquo;Site Inspection&rdquo; can count as <em>In Progress</em>.
          </p>
        </div>
        {canEdit ? (
          <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus size={14} /> Add Status
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Lock size={12} /> View only
          </span>
        )}
      </div>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">Preview</th>
              <th className="px-4 py-2 font-medium">Counts as</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="px-4 py-2.5">
                  <StatusRowChip row={r} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r.base}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{r.system ? "Built-in" : "Custom"}</td>
                <td className="px-4 py-2.5 text-xs">{r.active ? <span className="text-emerald-600">Yes</span> : <span className="text-gray-400">Off</span>}</td>
                <td className="px-4 py-2.5 text-right">
                  {canEdit && !r.id.startsWith("base:") && (
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(r)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit">
                        <Pencil size={14} />
                      </button>
                      {!r.system && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove "${r.name}"? Tasks using it go back to the built-in ${r.base}.`)) return;
                            try {
                              setError("");
                              await remove(r.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Could not remove the status.");
                            }
                          }}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <StatusDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await save(editing === "new" ? null : editing.id, input);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function StatusDialog({
  row,
  onClose,
  onSave,
}: {
  row: StatusRow | null;
  onClose: () => void;
  onSave: (input: { name: string; color: string; base: TaskStatus; active?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [color, setColor] = useState(row?.color ?? SWATCHES[0]);
  const [base, setBase] = useState<TaskStatus>(row?.base ?? "In Progress");
  const [active, setActive] = useState(row?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const system = row?.system ?? false;

  return (
    <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">{row ? "Edit status" : "Add status"}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus placeholder="e.g. Site Inspection" />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-500">Colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-gray-400" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-gray-200" />
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Counts as</span>
            <Select
              value={base}
              onChange={(v) => setBase(v as TaskStatus)}
              disabled={system}
              options={TASK_STATUSES.filter((s) => s !== "Awaiting Approval").map((s) => ({ value: s, label: s }))}
            />
            {system && <span className="mt-1 block text-[11px] text-gray-400">Built-in statuses keep their meaning; you can rename and recolour them.</span>}
          </label>
          {!system && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
              Active (offered when setting a status)
            </label>
          )}
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-500">Preview</span>
            <StatusRowChip row={{ id: "p", name: name || "Status", color, base, sortOrder: 0, system, active }} />
          </div>
          {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave({ name: name.trim(), color, base, active });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save.");
                setBusy(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickReplies() {
  const canEdit = useCan()("TASKOPAD_TASKS:EDIT");
  const [items, setItems] = useState<tasksApi.QuickReplyDto[] | null>(null);
  const [editing, setEditing] = useState<tasksApi.QuickReplyDto | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setItems(await tasksApi.getQuickReplies());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quick replies.");
      setItems([]);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  function open(q: tasksApi.QuickReplyDto | "new") {
    setEditing(q);
    setTitle(q === "new" ? "" : q.title);
    setMessage(q === "new" ? "" : q.message);
    setError("");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Quick replies</h3>
          <p className="mt-0.5 text-xs text-gray-500">Saved messages your team can drop into any task&apos;s chat with the ⚡ button.</p>
        </div>
        {canEdit && (
          <button onClick={() => open("new")} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus size={14} /> Add Quick Reply
          </button>
        )}
      </div>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="w-56 px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="w-24 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items == null ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto animate-spin" size={18} />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400">
                  No quick replies yet.
                </td>
              </tr>
            ) : (
              items.map((q) => (
                <tr key={q.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{q.title}</td>
                  <td className="px-4 py-2.5 whitespace-pre-wrap text-gray-600">{q.message}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => open(q)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${q.title}"?`)) return;
                            await tasksApi.deleteQuickReply(q.id);
                            await refresh();
                          }}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-gray-800">{editing === "new" ? "Add quick reply" : "Edit quick reply"}</h3>
            <div className="space-y-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Title, e.g. Work started" autoFocus />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="input resize-none" placeholder="Message" />
              {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={!title.trim() || !message.trim()}
                onClick={async () => {
                  try {
                    await tasksApi.saveQuickReply(editing === "new" ? null : editing.id, { title: title.trim(), message: message.trim() });
                    setEditing(null);
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not save.");
                  }
                }}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
