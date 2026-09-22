"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { formatBytes } from "@/lib/filesApi";

/**
 * What is uploading, pinned to the corner — the same shape Drive uses, for the same reason: a site
 * engineer pushing a 400 MB drawing over a phone connection needs to keep working, and needs to be
 * able to see that it is still going.
 *
 * <p>Each job holds its own {@link AbortController}, so cancelling really stops the transfer rather
 * than just hiding the row.
 */

export interface UploadJob {
  id: number;
  name: string;
  size: number;
  percent: number;
  status: "running" | "done" | "failed" | "cancelled";
  error?: string;
  controller: AbortController;
}

export function UploadTray({
  jobs,
  onDismiss,
  onClearFinished,
}: {
  jobs: UploadJob[];
  onDismiss: (id: number) => void;
  onClearFinished: () => void;
}) {
  const running = jobs.filter((j) => j.status === "running").length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <p className="text-sm font-medium text-slate-700">
          {running > 0 ? `Uploading ${running} file${running === 1 ? "" : "s"}` : "Uploads"}
        </p>
        <button
          type="button"
          onClick={onClearFinished}
          className="text-xs text-slate-500 hover:underline"
        >
          Clear
        </button>
      </header>

      <ul className="max-h-64 overflow-auto">
        {jobs.map((job) => (
          <li key={job.id} className="border-b border-slate-50 px-3 py-2 last:border-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={job.name}>
                {job.name}
              </span>

              {job.status === "done" && <CheckCircle2 size={14} className="text-emerald-500" />}
              {job.status === "failed" && <AlertCircle size={14} className="text-rose-500" />}

              <button
                type="button"
                onClick={() => {
                  if (job.status === "running") job.controller.abort();
                  else onDismiss(job.id);
                }}
                aria-label={job.status === "running" ? "Cancel upload" : "Dismiss"}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={13} />
              </button>
            </div>

            {job.status === "running" && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-accent transition-[width] duration-150"
                    style={{ width: `${job.percent}%` }}
                  />
                </div>
                <span className="w-16 text-right text-[10px] tabular-nums text-slate-400">
                  {job.percent}% · {formatBytes(job.size)}
                </span>
              </div>
            )}

            {job.status === "failed" && (
              <p className="mt-1 text-[11px] text-rose-600">{job.error}</p>
            )}
            {job.status === "cancelled" && (
              <p className="mt-1 text-[11px] text-slate-400">Cancelled.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
