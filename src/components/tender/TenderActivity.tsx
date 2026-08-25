"use client";

import { useEffect, useState } from "react";
import { ActivityTimeline, type ActivityItem } from "@/components/ActivityTimeline";
import { Spinner } from "@/components/Spinner";
import { getAuditLogs } from "@/lib/auditApi";
import type { ApprovalState } from "@/lib/api";

/**
 * A tender's own history, in the same feed Taskopad uses for a task.
 *
 * <p>Two sources, merged and sorted newest-first:
 *
 * <ul>
 *   <li>the <b>audit trail</b> — every state-changing call already writes a row keyed by
 *       {@code TENDER #id}, so edits and stage moves are recorded whoever made them and from
 *       wherever. Reading it needs AUDIT:VIEW; without it the panel just shows the approval side
 *       rather than an error, since the history is a nice-to-have on this screen.
 *   <li>the <b>approval trail</b> of a stage move in flight, which is the part people actually
 *       chase ("who is it sitting with?").
 * </ul>
 */
export function TenderActivity({ tenderId, approval }: { tenderId: string; approval?: ApprovalState | null }) {
  // A local (unsaved) tender has no numeric backend id and therefore no server-side trail yet.
  const numeric = tenderId.replace(/\D/g, "");
  const [rows, setRows] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(!!numeric);

  useEffect(() => {
    if (!numeric) return;
    let cancelled = false;
    getAuditLogs({ entityType: "TENDER", entityId: numeric, size: 30 })
      .then((page) => {
        if (cancelled) return;
        setRows(
          page.content.map((l) => ({
            id: `audit-${l.id}`,
            text: l.summary ?? `${l.action.toLowerCase()} tender`,
            at: l.createdAt,
            actorName: l.actorName ?? l.actorEmail ?? undefined,
          })),
        );
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [numeric]);

  const approvalRows: ActivityItem[] = (approval?.trail ?? []).map((a, i) => ({
    id: `approval-${a.id ?? i}`,
    text: `${a.action.charAt(0) + a.action.slice(1).toLowerCase()} stage change${a.note ? ` — ${a.note}` : ""}`,
    at: a.at ?? "",
    actorName: a.actorName ?? undefined,
  }));

  const items = [...approvalRows, ...rows].sort((a, b) => b.at.localeCompare(a.at));

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
        <Spinner size={14} className="text-brand-accent" /> Loading activity…
      </div>
    );
  }

  return <ActivityTimeline items={items} empty="No activity recorded for this tender yet." />;
}
