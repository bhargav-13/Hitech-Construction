"use client";

import { Check, CircleDashed, Clock, FileText, Undo2, X } from "lucide-react";
import type { ApprovalAction, ApprovalState } from "@/lib/api";

/**
 * The approval ladder and its audit trail, for the detail sidebar of anything approvable.
 *
 * <p>Two views of the same thing, deliberately both shown: the <em>ladder</em> answers "who still
 * has to sign this and whose turn is it", the <em>trail</em> answers "who actually did what, when,
 * and what did they say". Approvers kept asking the second question of the first UI, which only
 * ever showed a single status pill.
 */

const LEVEL_META: Record<string, { dot: string; ring: string; label: string }> = {
  APPROVED: { dot: "bg-emerald-500", ring: "ring-emerald-500/30", label: "Approved" },
  REJECTED: { dot: "bg-rose-500", ring: "ring-rose-500/30", label: "Rejected" },
  PENDING: { dot: "bg-amber-500", ring: "ring-amber-500/30", label: "Awaiting decision" },
  WAITING: { dot: "bg-slate-300", ring: "ring-slate-300/40", label: "Not started" },
  CANCELLED: { dot: "bg-slate-400", ring: "ring-slate-400/30", label: "Withdrawn" },
};

const ACTION_META: Record<ApprovalAction["action"], { icon: typeof Check; tint: string; verb: string }> = {
  SUBMITTED: { icon: FileText, tint: "bg-slate-100 text-slate-500", verb: "submitted the request" },
  APPROVED: { icon: Check, tint: "bg-emerald-50 text-emerald-600", verb: "approved" },
  REJECTED: { icon: X, tint: "bg-rose-50 text-rose-600", verb: "rejected" },
  CANCELLED: { icon: Undo2, tint: "bg-slate-100 text-slate-500", verb: "withdrew the request" },
};

export function ApprovalTrail({ approval }: { approval: ApprovalState | null }) {
  if (!approval) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">
        This request isn&apos;t on an approval chain. A single decision closes it.
        <div className="mt-1 text-slate-400">
          Turn on multi-level approval in Settings → Multi Level Approval.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Approval ladder
        </h4>
        <ol className="space-y-0">
          {approval.levels.map((lvl, i) => {
            const meta = LEVEL_META[lvl.state] ?? LEVEL_META.WAITING;
            const last = i === approval.levels.length - 1;
            return (
              <li key={lvl.levelOrder} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Connector between rungs — drawn behind the dot so it reads as one line. */}
                {!last && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />}
                <span className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ${meta.dot} ${meta.ring}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-slate-800">Level {lvl.levelOrder}</span>
                    <span className="text-xs text-slate-500">{lvl.roleNames.join(" or ")}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {lvl.state === "APPROVED" || lvl.state === "REJECTED" ? (
                      <>
                        {meta.label}
                        {lvl.decidedBy ? ` by ${lvl.decidedBy}` : ""}
                        {lvl.decidedAt ? ` · ${formatWhen(lvl.decidedAt)}` : ""}
                      </>
                    ) : (
                      meta.label
                    )}
                  </div>
                  {lvl.note && (
                    <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      &ldquo;{lvl.note}&rdquo;
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Activity</h4>
        <ul className="space-y-2.5">
          {approval.trail.map((a) => {
            const meta = ACTION_META[a.action] ?? ACTION_META.SUBMITTED;
            const Icon = meta.icon;
            return (
              <li key={a.id} className="flex gap-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.tint}`}>
                  <Icon size={12} />
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="text-slate-700">
                    <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
                    {meta.verb}
                    {a.levelOrder ? ` at level ${a.levelOrder}` : ""}
                  </div>
                  <div className="text-slate-400">
                    {a.actorRole ? `${a.actorRole} · ` : ""}
                    {a.at ? formatWhen(a.at) : ""}
                  </div>
                  {a.note && (
                    <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-slate-600">&ldquo;{a.note}&rdquo;</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Compact "waiting on X" pill for list rows. */
export function ApprovalProgressPill({ approval }: { approval: ApprovalState | null }) {
  if (!approval) return null;
  if (approval.status !== "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
        <CircleDashed size={11} />
        {approval.totalLevels} level{approval.totalLevels === 1 ? "" : "s"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
      <Clock size={11} />
      L{approval.currentLevel}/{approval.totalLevels}
      {approval.awaitingRoleNames ? ` · ${approval.awaitingRoleNames}` : ""}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
