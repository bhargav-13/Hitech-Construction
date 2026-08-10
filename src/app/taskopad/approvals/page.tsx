"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, Lock, X } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { TaskDrawer } from "@/components/task/TaskDrawer";
import { useTaskStore } from "@/lib/taskStore";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { UserAvatar, StatusChip, PriorityChip } from "@/components/task/TaskBits";
import { formatTaskDate } from "@/lib/taskTypes";
import type { Task } from "@/lib/taskTypes";
import { useTaskRights } from "@/lib/taskPermissions";

/**
 * Completion approvals — tasks a manager must sign off before they're marked Completed. A person who
 * reports to someone can't complete their own task instantly; it lands here for their manager (per
 * the role ladder; project-scoped for Team Member → Project Manager). Approve → Completed, Reject →
 * back to its previous status with a reason.
 */
export default function TaskopadApprovalsPage() {
  return (
    <TaskopadShell>
      <ApprovalsList />
    </TaskopadShell>
  );
}

function ApprovalsList() {
  const approvals = useTaskStore((s) => s.approvals);
  const approvalsLoaded = useTaskStore((s) => s.approvalsLoaded);
  const loadApprovals = useTaskStore((s) => s.loadApprovals);
  const approve = useTaskStore((s) => s.approve);
  const reject = useTaskStore((s) => s.reject);

  const { users } = useUsers();
  const { projects } = useProjects();
  const { rightsFor } = useTaskRights();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // Click a row to open the full task details (read the description, subtasks, comments, etc.).
  const [viewing, setViewing] = useState<Task | null>(null);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const userName = useMemo(
    () => (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? "Someone" : "Someone"),
    [users]
  );
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  async function doApprove(id: string) {
    const task = approvals.find((t) => t.id === id);
    if (task && !rightsFor(task).canApprove) return;
    setBusyId(id);
    setError("");
    try {
      await approve(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  }

  async function doReject(id: string) {
    const task = approvals.find((t) => t.id === id);
    if (task && !rightsFor(task).canApprove) return;
    setBusyId(id);
    setError("");
    try {
      await reject(id, note.trim() || undefined);
      setRejectingId(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reject.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Completion Approvals</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Tasks your team marked complete — approve to finish them, or send them back with a reason.
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {!approvalsLoaded ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
          <Loader2 className="mr-2 animate-spin" size={18} /> Loading…
        </div>
      ) : approvals.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <ClipboardCheck size={26} className="text-gray-300" />
          <div className="text-sm font-medium text-gray-600">Nothing awaiting your approval</div>
          <p className="max-w-xs text-xs text-gray-400">When someone who reports to you marks a task complete, it shows up here for sign-off.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((t) => {
            const rejecting = rejectingId === t.id;
            const busy = busyId === t.id;
            // Completing a task is a change to its record, so sign-off stays with the creator
            // (and Super Admin) even though the queue itself follows the reporting line.
            const canApprove = rightsFor(t).canApprove;
            return (
              <div
                key={t.id}
                onClick={() => setViewing(t)}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-150 hover:border-brand-accent hover:shadow-md"
                title="View task details"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{t.title}</span>
                      <span className="text-xs text-gray-400">{t.code}</span>
                      <StatusChip status={t.status} />
                      <PriorityChip priority={t.priority} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={18} />
                        {userName(t.assigneeId)}
                      </span>
                      <span>Requested by <span className="font-medium text-gray-700">{userName(t.completionRequestedBy ?? null)}</span></span>
                      <span>Project · {projectName(t.projectId)}</span>
                      {t.dueDate && <span>Due {formatTaskDate(t.dueDate)}</span>}
                    </div>
                  </div>

                  {!rejecting &&
                    (canApprove ? (
                      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => doApprove(t.id)}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                        </button>
                        <button
                          onClick={() => { setRejectingId(t.id); setNote(""); }}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 transition-all duration-150 hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500"
                        title={`Only ${userName(t.createdBy)} (who raised this task) can sign it off.`}
                      >
                        <Lock size={12} /> {userName(t.createdBy)} signs off
                      </span>
                    ))}
                </div>

                {rejecting && (
                  <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50/40 p-3" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Reason for sending it back (optional)…"
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setRejectingId(null); setNote(""); }}
                        disabled={busy}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => doReject(t.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-medium text-white transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Send back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewing && <TaskDrawer existing={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
