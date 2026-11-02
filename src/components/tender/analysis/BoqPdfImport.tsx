"use client";

import { useEffect, useMemo, useState } from "react";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { readBoq, type BoqReadResult } from "@/lib/boqPdf";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import { inr } from "@/lib/format";
import type { TenderAnalysis } from "@/lib/tenderAnalysisTypes";

/**
 * Import a tender's BOQ from the department's PDF — whatever its layout. Every row comes in; titles
 * are optional. Rows with no quantity of their own (parent descriptions) can open titles, or come
 * in as plain lines that "Use as title" turns into one later.
 */
export function BoqPdfImport({ analysis, file, onClose, onDone }: { analysis: TenderAnalysis; file: File; onClose: () => void; onDone: (added: number) => void }) {
  const appendBoqRows = useAnalysisStore((s) => s.appendBoqRows);
  const [progress, setProgress] = useState("Opening PDF…");
  const [result, setResult] = useState<BoqReadResult | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("__new");
  const [newTitle, setNewTitle] = useState(file.name.replace(/\.[^.]+$/, ""));
  const [headingsAsTitles, setHeadingsAsTitles] = useState(false);
  const [skipHeadings, setSkipHeadings] = useState(false);

  useEffect(() => {
    let live = true;
    readBoq(file, (m) => live && setProgress(m))
      .then((r) => live && setResult(r))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read that file."));
    return () => {
      live = false;
    };
  }, [file]);

  const items = useMemo(() => result?.rows.filter((r) => !r.heading) ?? [], [result]);
  const headings = useMemo(() => result?.rows.filter((r) => r.heading) ?? [], [result]);
  const total = useMemo(() => items.reduce((s, r) => s + (r.amount ?? r.qty * r.rate), 0), [items]);
  const noQty = items.filter((r) => !r.qty).length;

  function add() {
    if (!result) return;
    const rows = skipHeadings && !headingsAsTitles ? items : result.rows;
    const n = appendBoqRows(analysis.id, rows, {
      groupKey: target === "__new" ? undefined : target,
      newTitle: newTitle.trim() || "Imported BOQ",
      headingsAsTitles,
    });
    onDone(n);
  }

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="w-[860px] max-w-full space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <FileUp size={16} className="text-brand-accent" /> Import BOQ from PDF
          </h2>
          <p className="mt-1 truncate text-xs text-gray-400">{file.name}</p>
        </div>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        ) : !result ? (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin text-brand-accent" /> {progress}
          </div>
        ) : result.rows.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No BOQ rows found in this file. If it is a scan, make sure AI scanning is set up; otherwise add the items by hand.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Stat label="Items" value={String(items.length)} />
              <Stat label="Rows without quantity" value={String(headings.length)} />
              <Stat label="Amount" value={inr(total)} />
              <Stat label="Read" value={`${result.pages} page${result.pages === 1 ? "" : "s"} · ${result.method === "text" ? "from PDF text" : "with AI"}`} />
            </div>
            {(noQty > 0 || result.method !== "text") && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                <span>
                  {noQty > 0 && `${noQty} item${noQty === 1 ? " has" : "s have"} no quantity in the PDF — fill them in after importing. `}
                  {result.method !== "text" && "Read by AI from a scan — check the rows against the PDF."}
                </span>
              </p>
            )}

            <div className="max-h-[42vh] overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[10px] tracking-wide text-gray-500 uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Sr</th>
                    <th className="px-2 py-1.5 text-left font-medium">Item</th>
                    <th className="px-2 py-1.5 text-left font-medium">Unit</th>
                    <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                    <th className="px-2 py-1.5 text-right font-medium">Rate</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) =>
                    r.heading ? (
                      <tr key={i} className="border-t border-gray-100 bg-gray-50/70">
                        <td className="px-2 py-1.5 text-gray-400">{r.srNo}</td>
                        <td colSpan={5} className="px-2 py-1.5 font-medium text-gray-700">
                          <span className="mr-1.5 rounded bg-gray-200 px-1 py-px text-[9px] font-semibold text-gray-600 uppercase">No qty</span>
                          <span className="line-clamp-2">{r.description}</span>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 align-top text-gray-500">{r.srNo}</td>
                        <td className="px-2 py-1.5 text-gray-700"><span className="line-clamp-2" title={r.description}>{r.description}</span></td>
                        <td className="px-2 py-1.5 align-top text-gray-500">{r.unit}</td>
                        <td className={`px-2 py-1.5 text-right align-top tabular-nums ${r.qty ? "text-gray-700" : "text-amber-600"}`}>{r.qty || "—"}</td>
                        <td className="px-2 py-1.5 text-right align-top tabular-nums text-gray-700">{r.rate ? inr(r.rate) : "—"}</td>
                        <td className="px-2 py-1.5 text-right align-top tabular-nums text-gray-700">{r.amount != null ? inr(r.amount) : "—"}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Put the items under</span>
                <Select
                  value={target}
                  onChange={setTarget}
                  options={[{ value: "__new", label: "A new title" }, ...analysis.groups.map((g) => ({ value: g.key, label: g.label }))]}
                />
              </label>
              {target === "__new" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">New title</span>
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none" />
                </label>
              )}
            </div>
            {headings.length > 0 && (
              <div className="space-y-1.5 text-sm text-gray-600">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={headingsAsTitles} onChange={(e) => setHeadingsAsTitles(e.target.checked)} className="mt-0.5 accent-cyan-600" />
                  <span>
                    Make the {headings.length} rows without quantity into titles
                    <span className="block text-xs text-gray-400">Off: they come in as lines — &ldquo;Use as title&rdquo; on any line turns it into one later.</span>
                  </span>
                </label>
                {!headingsAsTitles && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={skipHeadings} onChange={(e) => setSkipHeadings(e.target.checked)} className="accent-cyan-600" />
                    Leave rows without quantity out
                  </label>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            disabled={!result || result.rows.length === 0}
            onClick={add}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            Add {items.length} item{items.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-gray-800 tabular-nums">{value}</div>
    </div>
  );
}
