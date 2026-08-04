"use client";

import { useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { parseCsv, exportRowsToCsv } from "@/lib/vyaparExport";
import { useVyaparProjectId } from "@/lib/projectScope";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";

/** A field an imported sheet column can map onto. */
export interface ImportField {
  key: string;
  label: string;
  /** Parse the cell as a number (strips ₹, commas, etc.) instead of keeping it as text. */
  numeric?: boolean;
}

/** One column shown in the pre-import preview table. */
export interface ImportPreviewCol {
  key: string;
  label: string;
  align?: "right";
  render?: (value: string | undefined) => string;
}

/**
 * Turns a flat sheet into grouped documents: rows sharing the same {@link byKey} value (e.g. the
 * invoice number) become one record, with {@link lineFields} collected into a `lines[]` array and
 * the remaining mapped columns taken from the group's first row as the document header.
 */
export interface ImportGroup {
  byKey: string;
  lineFields: string[];
}

/**
 * Everything the generic {@link ImportDialog} needs to import one kind of record. Each Vyapar
 * list page supplies its own config; the dialog itself (file pick, column mapping, preview,
 * commit) is identical everywhere.
 */
export interface ImportConfig {
  /** Drawer title, e.g. "Import Parties from Excel". */
  title: string;
  /** Plural noun for messages, e.g. "parties", "bank accounts". */
  entityNoun: string;
  /** The one column that must be mapped, e.g. "name". */
  requiredKey: string;
  /** Human label for the required field, e.g. "Party Name". */
  requiredLabel: string;
  /** Merge the current Vyapar header scope (bank account / project) into every record. */
  scoped?: boolean;
  /** Static defaults stamped onto every record before mapped columns are applied. */
  base?: Record<string, unknown>;
  /** All mappable fields (the "— Don't import —" option is added automatically). */
  fields: ImportField[];
  /** Best-guess mapping from a spreadsheet header to a field key (or "skip"). */
  guess: (header: string) => string;
  /** Optional per-field value override; return undefined to fall back to the default parse. */
  coerce?: (key: string, value: string) => unknown;
  /** Downloadable starter sheet. */
  template: { name: string; head: string[]; row: string[] };
  /** Columns shown in the preview table. */
  preview: ImportPreviewCol[];
  /** When set, rows are grouped into multi-line documents before commit (see {@link ImportGroup}). */
  group?: ImportGroup;
  /** Persist the built records; returns how many were created. */
  commit: (records: Record<string, unknown>[]) => Promise<number>;
}

const num = (v: string) => Number(v.replace(/[^\d.-]/g, "")) || 0;

/**
 * Config-driven CSV importer used across every flat Vyapar list: choose a file, confirm how its
 * columns map onto our fields, preview what will be created, then import. Replaces the old one-off
 * Item/Party import dialogs so every page's import UX is identical.
 */
export function ImportDialog({
  config,
  onClose,
  onImported,
}: {
  config: ImportConfig;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);
  const projectId = useVyaparProjectId();

  const fieldByKey = useMemo(
    () => Object.fromEntries(config.fields.map((f) => [f.key, f])),
    [config.fields]
  );
  const targets = useMemo(
    () => [{ key: "skip", label: "— Don't import —" }, ...config.fields],
    [config.fields]
  );

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    // .xlsx is a zip archive — ask for CSV, which every spreadsheet app exports.
    if (/\.xlsx?$/i.test(file.name)) {
      setError("Save the sheet as CSV first (File → Save As → CSV), then upload it here.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length === 0) {
      setError("That file looks empty.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed[0]);
    setRows(parsed.slice(1));
    setMapping(parsed[0].map(config.guess));
  }

  const dataRows = hasHeader ? rows : [headers, ...rows];
  const reqIdx = mapping.indexOf(config.requiredKey);
  const validCount = useMemo(() => {
    if (reqIdx === -1) return 0;
    const present = dataRows.filter((r) => (r[reqIdx] ?? "").trim());
    // Grouped imports count distinct documents, not line rows.
    return config.group ? new Set(present.map((r) => (r[reqIdx] ?? "").trim())).size : present.length;
  }, [dataRows, reqIdx, config.group]);

  const preview = useMemo(() => {
    if (reqIdx === -1) return [];
    return dataRows.slice(0, 8).map((r) => {
      const o: Record<string, string> = {};
      mapping.forEach((t, i) => {
        if (t !== "skip" && r[i]) o[t] = r[i].trim();
      });
      return o;
    });
  }, [dataRows, mapping, reqIdx]);

  async function runImport() {
    if (reqIdx === -1) {
      setError(`Map one column to ${config.requiredLabel} before importing.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // One typed record per data row (mapped fields only — base/scope are merged in below).
      const rowRecs = dataRows
        .filter((r) => (r[reqIdx] ?? "").trim())
        .map((r) => {
          const rec: Record<string, unknown> = {};
          mapping.forEach((key, i) => {
            const v = (r[i] ?? "").trim();
            if (!v || key === "skip") return;
            const custom = config.coerce?.(key, v);
            rec[key] = custom !== undefined ? custom : fieldByKey[key]?.numeric ? num(v) : v;
          });
          return rec;
        });

      const scopeBase = {
        ...(config.base ?? {}),
        ...(config.scoped ? { projectId: projectId ?? null } : {}),
      };

      let records: Record<string, unknown>[];
      if (config.group) {
        // Fold rows that share the group key into one document with a lines[] array.
        const { byKey, lineFields } = config.group;
        const lineSet = new Set(lineFields);
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const rec of rowRecs) {
          const key = String(rec[byKey] ?? "").trim();
          if (!key) continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(rec);
        }
        records = [...groups.values()].map((rowsInGroup) => {
          const header: Record<string, unknown> = { ...scopeBase };
          // Header fields come from the first row; line fields become the lines array.
          for (const [k, v] of Object.entries(rowsInGroup[0])) if (!lineSet.has(k)) header[k] = v;
          header.lines = rowsInGroup.map((r) => {
            const line: Record<string, unknown> = {};
            for (const k of lineFields) if (r[k] !== undefined) line[k] = r[k];
            return line;
          });
          return header;
        });
      } else {
        records = rowRecs.map((r) => ({ ...scopeBase, ...r }));
      }
      setDone(await config.commit(records));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={config.title}
      onClose={onClose}
      onSave={done == null ? runImport : onImported}
      saveLabel={done != null ? "Done" : busy ? "Importing…" : `Import ${validCount || ""}`.trim()}
      width="max-w-4xl"
    >
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {done != null ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={26} />
            </div>
            <div className="text-base font-semibold text-gray-800">
              {done} {config.entityNoun} imported
            </div>
          </div>
        ) : (
          <>
            {/* Step 1 — file */}
            <section>
              <Step n={1} title="Choose your sheet" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-brand-accent transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50/40 active:scale-95"
                >
                  <Upload size={15} /> {fileName || "Select CSV file"}
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pick} />
                <button
                  onClick={() => exportRowsToCsv(config.template.name, config.template.head, [config.template.row])}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-brand-accent"
                >
                  <Download size={14} /> Download template
                </button>
              </div>
              {headers.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="h-4 w-4 accent-cyan-600"
                  />
                  First row is a header
                </label>
              )}
            </section>

            {/* Step 2 — mapping */}
            {headers.length > 0 && (
              <section className="animate-fade-in">
                <Step n={2} title="Match the columns" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-700">{h || `Column ${i + 1}`}</div>
                        <div className="truncate text-[11px] text-gray-400">e.g. {dataRows[0]?.[i] || "—"}</div>
                      </div>
                      <Select
                        value={mapping[i] ?? "skip"}
                        onChange={(v) => setMapping((m) => m.map((x, j) => (j === i ? v : x)))}
                        size="sm"
                        className="w-44"
                        options={targets.map((t) => ({ value: t.key, label: t.label }))}
                      />
                    </div>
                  ))}
                </div>
                {reqIdx === -1 && (
                  <p className="mt-2 text-xs text-rose-600">
                    Map one column to <strong>{config.requiredLabel}</strong> to continue.
                  </p>
                )}
              </section>
            )}

            {/* Step 3 — preview */}
            {preview.length > 0 && (
              <section className="animate-fade-in">
                <Step n={3} title={`Preview — ${validCount} ${config.entityNoun} will be imported`} />
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                        {config.preview.map((c) => (
                          <th key={c.key} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                          {config.preview.map((c) => (
                            <td key={c.key} className={`px-3 py-2 text-gray-700 ${c.align === "right" ? "text-right" : ""}`}>
                              {c.render ? c.render(p[c.key]) : p[c.key] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validCount > preview.length && (
                  <p className="mt-2 text-xs text-gray-400">…and {validCount - preview.length} more.</p>
                )}
              </section>
            )}

            {headers.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-12 text-center">
                <FileSpreadsheet size={26} className="mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">Pick a CSV to get started.</p>
                <p className="mt-1 text-xs text-gray-400">We&apos;ll detect the columns for you.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-white">
        {n}
      </span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
    </div>
  );
}
