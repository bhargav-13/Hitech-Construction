"use client";

import { useState } from "react";
import { Check, Hourglass, Undo2, X } from "lucide-react";
import { decideApproval, withdrawApproval, type ApprovalState } from "@/lib/api";
import { useApprovalInboxCount } from "@/lib/approvals";
import { ApprovalTrail } from "@/components/approval/ApprovalTrail";
import { useAuthStore } from "@/lib/authStore";

/** Compact ladder status for a list row. Nothing for records that never needed approval. */
export function ApprovalBadge({ state }: { state: ApprovalState | null | undefined }) {
  if (!state || state.status === "CANCELLED") return null;
  const cls =
    state.status === "APPROVED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : state.status === "REJECTED"
        ? "bg-rose-50 text-rose-700 ring-rose-600/20"
        : state.canActNow
          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
          : "bg-amber-50 text-amber-700 ring-amber-600/20";
  const label =
    state.status === "APPROVED"
      ? "Approved"
      : state.status === "REJECTED"
        ? "Rejected"
        : state.canActNow
          ? "Your approval"
          : `Pending L${state.currentLevel}/${state.totalLevels}`;
  return (
    <span
      title={state.awaitingRoleNames ? `Waiting on ${state.awaitingRoleNames}` : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset ${cls}`}
    >
      {state.status === "PENDING" && <Hourglass size={10} />}
      {label}
    </span>
  );
}

/**
 * The approval block for a record's detail view: where the ladder stands, the trail, and — for
 * whoever it is waiting on — Approve / Reject. The requester gets Withdraw while it's pending.
 */
export function ApprovalPanel({
  entityType,
  entityId,
  state,
  onChanged,
  rejectHint,
}: {
  entityType: string;
  entityId: number;
  state: ApprovalState;
  onChanged: () => void;
  /** What a rejection does to this record, said before anyone clicks it. */
  rejectHint?: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refreshCount = useApprovalInboxCount((s) => s.refresh);
  const pending = state.status === "PENDING";
  const myId = useAuthStore((s) => s.user?.id);
  const raisedByMe = state.trail.some((a) => a.action === "SUBMITTED" && a.actorUserId != null && a.actorUserId === myId);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNote("");
      onChanged();
      void refreshCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That couldn't be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const tone = pending
    ? "border-amber-200 bg-amber-50/60"
    : state.status === "APPROVED"
      ? "border-emerald-200 bg-emerald-50/50"
      : "border-rose-200 bg-rose-50/50";

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">Approval</span>
        <ApprovalBadge state={state} />
        {pending && state.awaitingRoleNames && (
          <span className="text-xs text-gray-500">Waiting on {state.awaitingRoleNames}</span>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-white/70 p-2">
        <ApprovalTrail approval={state} />
      </div>

      {pending && state.canActNow && (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note (optional)"
            className="w-full resize-none rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-amber-400"
          />
          {rejectHint && <p className="mt-1 text-[11px] text-gray-500">{rejectHint}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => decideApproval(entityType, entityId, "APPROVE", note.trim() || undefined))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={15} /> Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => decideApproval(entityType, entityId, "REJECT", note.trim() || undefined))}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <X size={15} /> Reject
            </button>
          </div>
        </div>
      )}
      {pending && !state.canActNow && raisedByMe && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => withdrawApproval(entityType, entityId))}
          className="mt-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <Undo2 size={13} /> Withdraw request
        </button>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
