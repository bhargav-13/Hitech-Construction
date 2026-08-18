"use client";

import { useEffect, useState } from "react";
import { FilePlus2, FileX2, History, Info, PencilLine, UserRound } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { getAuditLogs } from "@/lib/auditApi";
import type { AuditActionApi, AuditLog } from "@/lib/auditApi";

/**
 * Project → Activity tab. Who changed what on this project, newest first.
 *
 * <p>The audit trail records every state-changing call, but until V43 it had no project column, so
 * a project's history could only be found by trawling the global log. Rows written before that
 * migration have no project and simply don't appear here — inventing one retrospectively would be
 * worse than an honest gap, so the empty state says as much.
 */

const ACTION_META: Record<AuditActionApi, { label: string; chip: string; icon: typeof FilePlus2 }> = {
  CREATE: { label: "Created", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: FilePlus2 },
  UPDATE: { label: "Updated", chip: "bg-cyan-50 text-cyan-700 ring-cyan-600/20", icon: PencilLine },
  DELETE: { label: "Deleted", chip: "bg-rose-50 text-rose-700 ring-rose-600/20", icon: FileX2 },
  LOGIN: { label: "Signed in", chip: "bg-slate-100 text-slate-600 ring-slate-500/20", icon: UserRound },
  LOGOUT: { label: "Signed out", chip: "bg-slate-100 text-slate-600 ring-slate-500/20", icon: UserRound },
};

const PAGE_SIZE = 40;

export function ProjectActivity({ projectId }: { projectId: number }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getAuditLogs({ projectId, page, size: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setLogs(res.content);
        setTotalPages(Math.max(1, res.totalPages));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this project's activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, page]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center">
        <History size={24} className="mb-3 text-slate-300" />
        <div className="text-base font-medium text-slate-600">No activity recorded yet</div>
        <p className="mt-1 flex max-w-md items-start gap-1.5 px-6 text-sm text-slate-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Changes made from now on appear here. Actions logged before this project timeline existed
          weren&apos;t tagged with a project and can only be found in the global Audit module.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {logs.map((log) => {
          const meta = ACTION_META[log.action] ?? ACTION_META.UPDATE;
          const Icon = meta.icon;
          const failed = log.statusCode !== null && log.statusCode >= 400;
          return (
            <div key={log.id} className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${meta.chip}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-sm font-medium ${failed ? "text-rose-600" : "text-slate-800"}`}>
                    {log.summary ?? meta.label}
                  </span>
                  {log.entityType && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                      {log.entityType}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {log.actorName ?? log.actorEmail ?? "Unknown user"}
                  {log.actorRole ? ` · ${log.actorRole}` : ""}
                  {" · "}
                  {formatWhen(log.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-50"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 enabled:hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
