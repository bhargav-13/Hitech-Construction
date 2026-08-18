"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, CalendarClock, ExternalLink, FileText, Landmark, ShieldCheck } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { listTendersForProject } from "@/lib/tenderApi";
import type { Tender } from "@/lib/tenderTypes";
import { inr } from "@/lib/format";

/**
 * Project → Tender tab. The bid this project came from.
 *
 * <p>The pipeline already implied this handoff — winning a tender produces a project, and
 * `tenders.project_id` has recorded the link all along — but the finished project had no way back
 * to the bid. Once site work begins, the numbers that matter are on that bid: contract value to
 * measure billing against, EMD still tied up, and the submission dates a dispute would turn on.
 */
export function ProjectTender({ projectId }: { projectId: number }) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listTendersForProject(projectId)
      .then((rows) => {
        if (!cancelled) setTenders(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load linked tenders.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (tenders.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center">
        <Award size={24} className="mb-3 text-slate-300" />
        <div className="text-base font-medium text-slate-600">No tender linked to this project</div>
        <p className="mt-1 max-w-md px-6 text-sm text-slate-400">
          Projects won through a bid show it here. Link one by setting this project on the tender in
          the{" "}
          <Link href="/tender" className="text-brand-accent hover:underline">
            Tender module
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tenders.map((t) => (
        <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">{t.nameOfWork || "Untitled tender"}</h3>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                  {t.tenderId}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <Landmark size={14} className="text-slate-400" />
                {t.department || "No department recorded"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
                {t.stage}
              </span>
              <Link
                href={`/tender?tender=${t.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                Open <ExternalLink size={12} />
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-4">
            <Field icon={<Award size={13} />} label="Contract value" value={t.contractValue != null ? inr(t.contractValue) : "—"} strong />
            <Field icon={<FileText size={13} />} label="Estimated cost" value={t.estimatedCost != null ? inr(t.estimatedCost) : "—"} />
            <Field
              icon={<ShieldCheck size={13} />}
              label="EMD"
              value={t.emd != null ? `${inr(t.emd)}${t.emdState ? ` · ${t.emdState}` : ""}` : "—"}
            />
            <Field icon={<CalendarClock size={13} />} label="Submitted" value={t.submissionDate || "—"} />
            <Field icon={<CalendarClock size={13} />} label="Due date" value={t.dueDate || "—"} />
            <Field icon={<CalendarClock size={13} />} label="Price opening" value={t.priceOpen || "—"} />
            <Field icon={<FileText size={13} />} label="Duration" value={t.duration || "—"} />
            <Field icon={<FileText size={13} />} label="DLP" value={t.dlp || "—"} />
          </div>

          {t.location && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
              <span className="text-slate-400">Location: </span>
              {t.location}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  strong,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-0.5 ${strong ? "text-base font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
        {value}
      </div>
    </div>
  );
}
