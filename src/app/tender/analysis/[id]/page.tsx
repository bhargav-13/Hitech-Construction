"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, FolderPlus } from "lucide-react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { AnalysisVerdictBar } from "@/components/tender/analysis/AnalysisVerdictBar";
import { AnalysisItemsTab } from "@/components/tender/analysis/AnalysisItemsTab";
import { AnalysisScenariosTab } from "@/components/tender/analysis/AnalysisScenariosTab";
import { AnalysisLibraryTab } from "@/components/tender/analysis/AnalysisLibraryTab";
import { analysisTotals } from "@/lib/tenderAnalysisCalc";
import { findAnalysis, useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { useTenderStore } from "@/lib/tenderStore";
import { tmoney } from "@/lib/tenderHelpers";
import { ClipboardList } from "lucide-react";

/**
 * The analysis workspace for one tender.
 *
 * <p>Routed by **tender** id rather than analysis id, so every link into it — from a pipeline row,
 * from the drawer, from a project — is the same URL whether or not an analysis exists yet. Opening
 * a tender that has never been analysed offers to start one instead of 404ing.
 */

const TABS = ["Items", "Scenarios", "Rate library"] as const;
type Tab = (typeof TABS)[number];

export default function TenderAnalysisPage() {
  const params = useParams<{ id: string }>();
  const tenderRef = params.id;

  const [tab, setTab] = useState<Tab>("Items");

  const tender = useTenderStore((s) => s.tenders.find((t) => t.id === tenderRef));
  const analyses = useAnalysisStore((s) => s.analyses);
  const createAnalysis = useAnalysisStore((s) => s.createAnalysis);
  const setBidPct = useAnalysisStore((s) => s.setBidPct);
  const rebind = useAnalysisStore((s) => s.rebind);

  // Resolve by tender number as well as id: backend hydration reassigns tender ids, which would
  // otherwise orphan an analysis written before the backend came up.
  const analysis = findAnalysis(analyses, tender ?? tenderRef);

  // Repair the link once rather than resolving through the fallback on every render.
  useEffect(() => {
    if (analysis && tender && analysis.tenderRef !== tender.id) rebind(analysis.id, tender.id);
  }, [analysis, tender, rebind]);

  const totals = useMemo(() => (analysis ? analysisTotals(analysis) : null), [analysis]);

  if (!analysis) {
    return (
      <TenderShell>
        <BackLink />
        <TenderEmpty
          icon={ClipboardList}
          title={tender ? "No health analysis yet" : "Tender not found"}
          hint={
            tender
              ? "Start one to price this tender's BOQ against what the job actually costs, and see how deep a discount it can carry."
              : "This tender is not in the pipeline — it may have been removed."
          }
        />
        {tender && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() =>
                createAnalysis(tender.id, tender.tenderId, tender.nameOfWork ?? `Tender ${tender.tenderId}`)
              }
              className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              Start health analysis
            </button>
          </div>
        )}
      </TenderShell>
    );
  }

  return (
    <TenderShell>
      <div className="animate-fade-in space-y-4">
        <BackLink />

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-gray-800" title={analysis.title}>
              {analysis.title}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {tender?.department ?? "—"} · Tender {analysis.tenderId}
              {tender?.estimatedCost != null && <> · estimate {tmoney(tender.estimatedCost)}</>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tender && (
              <Link
                href={`/tender/${tender.stage === "SORTING" ? "sorting" : tender.stage === "RESEARCH" ? "research" : "applied"}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
              >
                Open in pipeline <ArrowUpRight size={12} />
              </Link>
            )}
            {tender?.projectId != null && tender.projectId > 0 && (
              <Link
                href={`/project/${tender.projectId}`}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-medium text-brand-accent ring-1 ring-cyan-600/20 ring-inset transition-colors duration-150 hover:bg-cyan-100"
              >
                <FolderPlus size={12} /> Project #{tender.projectId}
              </Link>
            )}
          </div>
        </header>

        <AnalysisVerdictBar
          totals={totals!}
          bidPct={analysis.bidPct}
          onBidChange={(v) => setBidPct(analysis.id, v)}
        />

        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-150 ${
                tab === t
                  ? "border-brand-accent font-medium text-brand-accent"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "Items" && <AnalysisItemsTab analysis={analysis} totals={totals!} />}
        {tab === "Scenarios" && <AnalysisScenariosTab analysis={analysis} />}
        {tab === "Rate library" && <AnalysisLibraryTab analysis={analysis} />}
      </div>
    </TenderShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/tender/analysis"
      className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors duration-150 hover:text-brand-accent"
    >
      <ChevronLeft size={13} /> All analyses
    </Link>
  );
}
