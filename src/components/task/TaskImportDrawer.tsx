"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { TASK_PRIORITIES, TASK_STATUSES, toIso } from "@/lib/taskTypes";
import type { TaskPriority, TaskStatus } from "@/lib/taskTypes";

/** One row the sheet can carry. Only the title is required; the rest fall back to sane defaults. */
export interface ParsedTaskRow {
  title: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  description: string;
}

const SAMPLE_HEAD = ["Title", "Due Date", "Priority", "Status", "Description"];
const SAMPLE_ROWS: string[][] = [
  ["Shutter fixing — Tower B, 3rd slab", toIso(new Date()), "High", "Pending", "Coordinate with the carpentry gang"],
  ["Submit GST return", toIso(new Date(Date.now() + 7 * 86_400_000)), "Medium", "In Progress", ""],
  ["Site safety audit", "", "Low", "Pending", "Monthly walkaround"],
];

/** Split one CSV line, honouring quoted cells so a description with a comma survives. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function matchOption<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const hit = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  return hit ?? fallback;
}

function parseCsv(text: string): ParsedTaskRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  // Drop the header when the first line looks like one rather than a real task.
  const body = /title/i.test(lines[0]) ? lines.slice(1) : lines;
  return body
    .map(splitCsvLine)
    .filter((cols) => cols[0])
    .map((cols) => ({
      title: cols[0],
      dueDate: cols[1] || toIso(new Date()),
      priority: matchOption(cols[2] ?? "", TASK_PRIORITIES, "Medium"),
      status: matchOption(cols[3] ?? "", TASK_STATUSES, "Pending"),
      description: cols[4] ?? "",
    }));
}

/**
 * Import tasks from a sheet.
 *
 * <p>This used to be a bare file input on the toolbar: pick a file and hope. There was no way to
 * find out what shape the file had to be in short of reading the tooltip, and nothing showed what
 * was about to be created — which is exactly what the Vyapar importer solved with a downloadable
 * template and a preview, so this follows the same two steps.
 */
export function TaskImportDrawer({
  onClose,
  onImport,
}: {
  onClose: () => void;
  /** Creates the tasks; resolves to how many landed. */
  onImport: (rows: ParsedTaskRow[]) => Promise<number>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedTaskRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      const parsed = parseCsv(await file.text());
      setRows(parsed);
      if (parsed.length === 0) setError("No rows with a title were found in that file.");
    } catch {
      setRows([]);
      setError("That file could not be read. Save it as CSV and try again.");
    }
  }

  async function run() {
    if (rows.length === 0) return;
    setBusy(true);
    setError("");
    try {
      setDone(await onImport(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed part way through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Import Tasks"
      onClose={onClose}
      onSave={done == null ? run : onClose}
      saveLabel={done != null ? "Done" : busy ? "Importing…" : `Import ${rows.length || ""}`.trim()}
      width="max-w-3xl"
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
            <div className="text-base font-semibold text-gray-800">{done} task{done === 1 ? "" : "s"} imported</div>
          </div>
        ) : (
          <>
            <section>
              <Step n={1} title="Choose your sheet" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-brand-accent transition-all duration-150 hover:border-brand-accent hover:bg-cyan-50/40 active:scale-95"
                >
                  <Upload size={15} /> {fileName || "Select a CSV file"}
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pick} />
                <button
                  onClick={() => exportRowsToCsv("tasks-sample", SAMPLE_HEAD, SAMPLE_ROWS)}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-150 hover:text-brand-accent"
                >
                  <Download size={14} /> Download sample CSV
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Columns, in order: <strong>Title</strong> (required), Due Date (YYYY-MM-DD), Priority
                ({TASK_PRIORITIES.join(" / ")}), Status ({TASK_STATUSES.join(" / ")}), Description. A header row is
                detected and skipped. Anything missing falls back to a sensible default.
              </p>
            </section>

            {rows.length > 0 && (
              <section className="animate-fade-in">
                <Step n={2} title={`Check what will be created (${rows.length})`} />
                <div className="max-h-72 overflow-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Title</th>
                        <th className="px-3 py-2 font-medium">Due</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                          <td className="px-3 py-2 text-gray-800">{r.title}</td>
                          <td className="px-3 py-2 text-gray-600">{r.dueDate}</td>
                          <td className="px-3 py-2 text-gray-600">{r.priority}</td>
                          <td className="px-3 py-2 text-gray-600">{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Every task is created against the project currently in scope, assigned to you.
                </p>
              </section>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Spinner size={14} className="text-brand-accent" /> Creating tasks…
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
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-white">
        {n}
      </span>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
    </div>
  );
}
