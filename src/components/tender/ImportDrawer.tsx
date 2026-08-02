"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { useTenderStore } from "@/lib/tenderStore";
import {
  SHEET_KIND_LABEL,
  describeSheet,
  previewLine,
  readWorkbook,
  toTenders,
  type ParsedSheet,
  type SheetKind,
} from "@/lib/tenderExcel";
import type { Tender } from "@/lib/tenderTypes";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

const KIND_OPTIONS = (Object.keys(SHEET_KIND_LABEL) as SheetKind[]).map((k) => ({
  value: k,
  label: SHEET_KIND_LABEL[k],
}));

type Step = "pick" | "map" | "done";

/**
 * Import the client's own workbook.
 *
 * They will not leave Excel unless the app can swallow the file they already maintain, so this
 * accepts their workbook as-is: sheets are auto-detected by name and columns, and every row is put
 * through the same normalisation as the seed generator. Nothing leaves the browser.
 */
export function ImportDrawer({ onClose }: { onClose: () => void }) {
  const importTenders = useTenderStore((s) => s.importTenders);
  const existing = useTenderStore((s) => s.tenders);

  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [kinds, setKinds] = useState<Record<string, SheetKind>>({});
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const parsed = readWorkbook(await file.arrayBuffer());
      if (parsed.length === 0) {
        setError("No readable sheets in that file.");
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      setKinds(Object.fromEntries(parsed.map((s) => [s.name, s.kind])));
      setStep("map");
    } catch {
      setError("Couldn't read that file. Is it a valid .xlsx or .csv?");
    } finally {
      setBusy(false);
    }
  }

  /** Rows the current mapping would produce, recomputed as the user changes a dropdown. */
  const staged = useMemo(() => {
    const out: { sheet: string; rows: Tender[] }[] = [];
    for (const sheet of sheets) {
      const kind = kinds[sheet.name] ?? "SKIP";
      if (kind === "SKIP") continue;
      out.push({ sheet: sheet.name, rows: toTenders(sheet, kind) });
    }
    return out;
  }, [sheets, kinds]);

  const allRows = useMemo(() => staged.flatMap((s) => s.rows), [staged]);

  /** Split the staged rows against what is already in the store, so nothing is a surprise. */
  const diff = useMemo(() => {
    const known = new Set(existing.filter((t) => t.tenderId).map((t) => t.tenderId));
    let update = 0;
    let add = 0;
    for (const r of allRows) {
      if (r.tenderId && known.has(r.tenderId)) update += 1;
      else add += 1;
    }
    return { add, update };
  }, [allRows, existing]);

  function commit() {
    setBusy(true);
    // Deliberately deferred a tick so the button's busy state paints before a large merge blocks.
    setTimeout(() => {
      setResult(importTenders(allRows, mode));
      setStep("done");
      setBusy(false);
    }, 0);
  }

  return (
    <Drawer title="Import from Excel" onClose={onClose} width="max-w-3xl">
      {step === "pick" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center"
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
              <FileSpreadsheet size={24} />
            </div>
            <div className="text-base font-semibold text-gray-700">Drop the tender workbook here</div>
            <p className="mt-1 max-w-sm text-sm text-gray-400">
              The client&apos;s own file works as-is — sheets and columns are detected automatically. Everything
              is parsed in your browser; nothing is uploaded.
            </p>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Upload size={15} /> Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
          {busy && <p className="text-sm text-gray-500">Reading workbook…</p>}
          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertCircle size={15} /> {error}
            </p>
          )}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileSpreadsheet size={15} className="text-gray-400" />
            <span className="truncate font-medium">{fileName}</span>
            <span className="text-gray-400">· {sheets.length} sheets</span>
          </div>

          <div className="space-y-2">
            {sheets.map((sheet) => {
              const kind = kinds[sheet.name] ?? "SKIP";
              const rows = staged.find((s) => s.sheet === sheet.name)?.rows ?? [];
              return (
                <div key={sheet.name} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-700">{sheet.name}</div>
                      <div className="text-[11px] text-gray-400">{describeSheet(sheet)}</div>
                    </div>
                    <div className="w-52">
                      <Select
                        size="sm"
                        value={kind}
                        onChange={(v) => setKinds((k) => ({ ...k, [sheet.name]: v as SheetKind }))}
                        options={KIND_OPTIONS}
                      />
                    </div>
                  </div>
                  {kind !== "SKIP" && rows.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
                      {rows.slice(0, 3).map((r) => (
                        <li key={r.id} className="truncate text-[11px] text-gray-500">
                          {previewLine(r)}
                        </li>
                      ))}
                      {rows.length > 3 && <li className="text-[11px] text-gray-400">…and {rows.length - 3} more</li>}
                    </ul>
                  )}
                  {kind !== "SKIP" && rows.length === 0 && (
                    <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] text-amber-600">
                      No importable rows found with this mapping.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">On import</div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
                <span className="text-gray-700">Merge</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <span className="text-gray-700">Replace everything</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {mode === "merge" ? (
                <>
                  Matching on Tender ID: <strong className="text-gray-700">{diff.add} new</strong> rows added,{" "}
                  <strong className="text-gray-700">{diff.update}</strong> existing rows updated. Stage and any loss
                  reason already recorded are kept.
                </>
              ) : (
                <>
                  All {existing.length} current tenders are discarded and replaced with the {allRows.length} imported
                  rows.
                </>
              )}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStep("pick")}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={commit}
              disabled={allRows.length === 0 || busy}
              className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${allRows.length} tenders`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={26} />
          </div>
          <div className="text-base font-semibold text-gray-700">Import complete</div>
          <p className="mt-1 text-sm text-gray-500">
            {result.added} added · {result.updated} updated · {result.skipped} unchanged
          </p>
          <button
            onClick={onClose}
            className="mt-4 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            Done
          </button>
        </div>
      )}
    </Drawer>
  );
}
