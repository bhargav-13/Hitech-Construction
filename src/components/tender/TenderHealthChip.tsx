"use client";

import Link from "next/link";
import { findAnalysis, useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { analysisTotals } from "@/lib/tenderAnalysisCalc";
import type { HealthBand } from "@/lib/tenderAnalysisTypes";

/**
 * A tender's bid verdict, small enough to sit in a table row.
 *
 * <p>This is the whole point of the analysis module showing up outside its own screen: the number
 * that decides whether to bid should be visible wherever a tender is, not one click away. An
 * un-analysed tender says so plainly rather than rendering nothing — "we haven't looked at this"
 * is itself worth seeing in a list of 120.
 */

const BAND_CLASS: Record<HealthBand, string> = {
  strong: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  thin: "bg-amber-50 text-amber-700 ring-amber-600/20",
  risk: "bg-rose-50 text-rose-700 ring-rose-600/20",
  none: "bg-gray-50 text-gray-400 ring-gray-400/20",
};

const DOT_CLASS: Record<HealthBand, string> = {
  strong: "bg-emerald-500",
  thin: "bg-amber-500",
  risk: "bg-rose-500",
  none: "bg-gray-300",
};

export function TenderHealthChip({
  tender,
  size = "sm",
  showBid = true,
}: {
  /** The tender itself — its number is the fallback key when ids have been reassigned. */
  tender: { id: string; tenderId?: string | null };
  size?: "sm" | "md";
  showBid?: boolean;
}) {
  const analyses = useAnalysisStore((s) => s.analyses);
  const analysis = findAnalysis(analyses, tender);

  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";

  if (!analysis || analysis.boqLines.length === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset ${BAND_CLASS.none} ${pad}`}
        title="No health analysis yet"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS.none}`} />
        Not analysed
      </span>
    );
  }

  const t = analysisTotals(analysis);
  const pct = t.profitPctAtBid;
  // A negative percentage already carries its own sign; a positive one needs no "+".
  const label = `${pct.toFixed(1)}%`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset tabular-nums ${BAND_CLASS[t.band]} ${pad}`}
      title={`Profit ${label} at a ${t.bidPct.toFixed(2)}% bid · break-even at ${t.breakEvenPct.toFixed(2)}%`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[t.band]}`} />
      {label}
      {showBid && t.bidPct !== 0 && (
        <span className="font-normal opacity-70">@ −{t.bidPct.toFixed(2)}%</span>
      )}
    </span>
  );
}

/**
 * The chip plus a way in — used in the tender drawer, where there is room to act rather than only
 * to look. Falls back to an "Analyse" call to action when nothing has been worked out yet.
 */
export function TenderHealthLink({ tender }: { tender: { id: string; tenderId?: string | null } }) {
  const analyses = useAnalysisStore((s) => s.analyses);
  const analysis = findAnalysis(analyses, tender);

  if (!analysis) {
    return (
      <Link
        href={`/tender/analysis/${tender.id}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent ring-1 ring-cyan-600/20 ring-inset transition-opacity duration-150 hover:opacity-80"
      >
        Run health analysis
      </Link>
    );
  }

  return (
    <Link
      href={`/tender/analysis/${tender.id}`}
      className="inline-flex transition-opacity duration-150 hover:opacity-80"
      title={`Open the health analysis for ${tender.tenderId ?? tender.id}`}
    >
      <TenderHealthChip tender={tender} size="md" />
    </Link>
  );
}
