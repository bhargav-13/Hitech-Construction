"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Search, Unlink } from "lucide-react";
import { TenderShell, TenderEmpty } from "@/components/tender/TenderShell";
import { TenderHealthChip } from "@/components/tender/TenderHealthChip";
import { Modal } from "@/components/Modal";
import { inr } from "@/lib/format";
import { analysisTotals } from "@/lib/tenderAnalysisCalc";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { useTenderStore } from "@/lib/tenderStore";
import { tdate } from "@/lib/tenderHelpers";
import { TENDER_SEED } from "@/lib/tenderSeed";
import type { TenderAnalysis } from "@/lib/tenderAnalysisTypes";
import type { Tender } from "@/lib/tenderTypes";

/**
 * The tender an analysis was costed against, as it appears in the client's own workbook.
 *
 * <p>Analyses and tenders were generated from the same source, so a lost link can be repaired with
 * the real record instead of an approximation. Decided tenders win the match — 287517 appears
 * twice, once mid-pipeline and once as the awarded row, and the awarded one is the useful end.
 */
function findWorkbookTender(tenderId: string): Tender | undefined {
  const matches = TENDER_SEED.filter((t) => t.tenderId === tenderId);
  return matches.find((t) => t.stage === "WON") ?? matches[0];
}

/**
 * Every tender that has been costed, with its verdict.
 *
 * <p>The workbook's own "Dashboard" sheet is a list of fifty tab names with no numbers on it. This
 * is that index with the answer beside each entry, which is the whole reason to leave the sheet.
 */
export default function TenderAnalysisListPage() {
  const analyses = useAnalysisStore((s) => s.analyses);
  const tenders = useTenderStore((s) => s.tenders);
  const addTender = useTenderStore((s) => s.addTender);
  const rebind = useAnalysisStore((s) => s.rebind);
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [attaching, setAttaching] = useState<TenderAnalysis | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analyses
      .map((a) => ({
        a,
        totals: analysisTotals(a),
        // Match the tender back by number too — backend ids are reassigned on hydration. The
        // number has to be non-empty to match on: several analyses carry no tender number, and
        // `"" === ""` bound every one of them to whichever tender also had a blank number. Two
        // unrelated costings then shared a tender, and the health chip — which looks the analysis
        // back up from that tender — showed the same figures on both rows.
        tender:
          tenders.find((t) => t.id === a.tenderRef) ??
          (a.tenderId.trim() ? tenders.find((t) => (t.tenderId ?? "").trim() === a.tenderId.trim()) : undefined) ??
          null,
      }))
      .filter(
        ({ a, tender }) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.tenderId.toLowerCase().includes(q) ||
          (tender?.department ?? "").toLowerCase().includes(q),
      )
      .sort((x, y) => (y.a.updatedAt > x.a.updatedAt ? 1 : -1));
  }, [analyses, tenders, search]);

  const orphans = rows.filter((r) => !r.tender).length;

  /**
   * Put the analysis's own tender back in the pipeline.
   *
   * <p>Both records come from the same workbook, so an analysis that has lost its tender can
   * always be reunited with the real one rather than being attached to an approximation. Used when
   * the pipeline was reloaded from a server that doesn't carry this tender.
   */
  function restoreWorkbookTender(a: TenderAnalysis) {
    const source = findWorkbookTender(a.tenderId);
    if (!source) return;
    // Never collide with a tender already in the list — reuse it and just re-point the analysis.
    const existing = tenders.find((t) => t.id === source.id || t.tenderId === source.tenderId);
    const target = existing ?? source;
    if (!existing) addTender(source);
    rebind(a.id, target.id);
  }

  return (
    <TenderShell>
      <div className="animate-fade-in space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Health analysis</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              What each tender costs us, and how deep a discount it can carry.
            </p>
          </div>

          <div className="relative ml-auto">
            <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search analyses"
              className="w-56 rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={14} /> New analysis
          </button>
        </header>

        {orphans > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <Unlink size={16} className="mt-0.5 shrink-0" />
              <p>
                {orphans === 1 ? "One analysis is" : `${orphans} analyses are`} not linked to any tender in your
                pipeline — the tender list is replaced when it loads from the server, which assigns its own ids.
              </p>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
              {rows
                .filter((r) => !r.tender && findWorkbookTender(r.a.tenderId))
                .map(({ a }) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => restoreWorkbookTender(a)}
                    className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity duration-150 hover:opacity-90"
                  >
                    Add tender {a.tenderId} to the pipeline
                  </button>
                ))}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <TenderEmpty
            icon={ClipboardList}
            title={analyses.length === 0 ? "Nothing analysed yet" : "No analyses match that search"}
            hint={
              analyses.length === 0
                ? "Pick a tender, add its items from the Library, and put your rates against them."
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Tender</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tender value</th>
                  <th className="px-4 py-2.5 text-right font-medium">Our cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Bid</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                  <th className="px-4 py-2.5 text-left font-medium">Health</th>
                  <th className="px-4 py-2.5 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, totals, tender }) => (
                  <tr key={a.id} className="border-b border-gray-50 transition-colors duration-150 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/tender/analysis/${tender?.id ?? a.tenderRef}`} className="group block max-w-[340px]">
                        <span
                          className="block truncate font-medium text-gray-700 group-hover:text-brand-accent"
                          title={a.title}
                        >
                          {a.title}
                        </span>
                        {tender ? (
                          <span className="block truncate text-[11px] text-gray-400">
                            {tender.department ?? "—"} · {a.tenderId}
                          </span>
                        ) : (
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-amber-700">
                            <Unlink size={11} />
                            Tender {a.tenderId} is not in your pipeline
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{inr(totals.tenderValue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{inr(totals.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">−{totals.bidPct.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-700">
                      {inr(totals.profitAtBid)}
                    </td>
                    <td className="px-4 py-2.5">
                      {tender ? (
                        // This row's own analysis, not one resolved from the tender: two costings
                        // can point at the same tender, and the lookup would return the first.
                        <TenderHealthChip tender={tender} analysis={a} showBid={false} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAttaching(a)}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 transition-colors duration-150 hover:bg-amber-100"
                        >
                          Attach to a tender
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{tdate(a.updatedAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picking && <TenderPicker onClose={() => setPicking(false)} />}
      {attaching && <AttachDialog analysis={attaching} onClose={() => setAttaching(null)} />}
    </TenderShell>
  );
}

/** Pick which tender to cost. Only live ones — analysing a lost tender helps nobody. */
function TenderPicker({ onClose }: { onClose: () => void }) {
  const tenders = useTenderStore((s) => s.tenders);
  const analyses = useAnalysisStore((s) => s.analyses);
  const createAnalysis = useAnalysisStore((s) => s.createAnalysis);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const done = new Set(analyses.map((a) => a.tenderRef));
    const q = search.trim().toLowerCase();
    return tenders
      .filter((t) => !done.has(t.id) && t.stage !== "LOST")
      .filter(
        (t) =>
          !q ||
          (t.nameOfWork ?? "").toLowerCase().includes(q) ||
          t.tenderId.toLowerCase().includes(q) ||
          (t.department ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [tenders, analyses, search]);

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="flex max-h-[80vh] flex-col">
        <header className="border-b border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-800">Which tender?</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Lost tenders are hidden — there is nothing left to decide on those.
          </p>
          <div className="relative mt-3">
            <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenders"
              className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {options.map((t) => (
            <Link
              key={t.id}
              href={`/tender/analysis/${t.id}`}
              onClick={() => createAnalysis(t.id, t.tenderId, t.nameOfWork ?? `Tender ${t.tenderId}`)}
              className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5 transition-colors duration-150 hover:bg-cyan-50/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-700">{t.nameOfWork ?? t.tenderId}</span>
                <span className="text-[11px] text-gray-400">
                  {t.department ?? "—"} · {t.tenderId} · {t.stage.toLowerCase()}
                </span>
              </span>
              {t.estimatedCost != null && (
                <span className="shrink-0 text-sm tabular-nums text-gray-500">{inr(t.estimatedCost)}</span>
              )}
            </Link>
          ))}
          {options.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">Every live tender already has an analysis.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Re-point an analysis at a tender.
 *
 * <p>Needed because the tender list is replaced wholesale when it loads from the backend, and the
 * server assigns its own ids — an analysis written before that happened ends up describing a
 * tender number the pipeline no longer has under that key.
 */
function AttachDialog({ analysis, onClose }: { analysis: TenderAnalysis; onClose: () => void }) {
  const tenders = useTenderStore((s) => s.tenders);
  const rebind = useAnalysisStore((s) => s.rebind);
  const removeAnalysis = useAnalysisStore((s) => s.removeAnalysis);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders
      .filter(
        (t) =>
          !q ||
          (t.nameOfWork ?? "").toLowerCase().includes(q) ||
          t.tenderId.toLowerCase().includes(q) ||
          (t.department ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [tenders, search]);

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="flex max-h-[80vh] flex-col">
        <header className="border-b border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-800">Attach &ldquo;{analysis.title}&rdquo;</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            It was costed against tender {analysis.tenderId}, which is not in the pipeline under that id. Pick the
            tender it belongs to.
          </p>
          <div className="relative mt-3">
            <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenders"
              className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                rebind(analysis.id, t.id);
                onClose();
              }}
              className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-cyan-50/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-700">{t.nameOfWork ?? t.tenderId}</span>
                <span className="text-[11px] text-gray-400">
                  {t.department ?? "—"} · {t.tenderId} · {t.stage.toLowerCase()}
                </span>
              </span>
              {t.estimatedCost != null && (
                <span className="shrink-0 text-sm tabular-nums text-gray-500">{inr(t.estimatedCost)}</span>
              )}
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">No tenders match that search.</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete the analysis "${analysis.title}"? This cannot be undone.`)) {
                removeAnalysis(analysis.id);
                onClose();
              }
            }}
            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition-colors duration-150 hover:bg-rose-50"
          >
            Delete this analysis
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Cancel
          </button>
        </footer>
      </div>
    </Modal>
  );
}
