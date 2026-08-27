"use client";

import { useCallback, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { exportRowsToCsv, exportRowsToXlsx, type CellMerge } from "@/lib/vyaparExport";
import { Check, Download, FileSpreadsheet } from "lucide-react";

/**
 * One exportable column: what to call it in the header row, and how to read it off a record.
 *
 * `value` returns a raw cell rather than a formatted string wherever the underlying value is a
 * number — a CSV that Excel is going to sum should carry `1180.5`, not `₹ 1,180.50`.
 */
export interface ExportColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * A per-list "which columns?" picker, shown when Export is clicked.
 *
 * Every export in the module used to be a hand-written subset — the sales list, for instance, wrote
 * eight columns and dropped the line items entirely, so an exported invoice didn't say what had
 * been sold. This dialog takes the full column set instead, ticks all of it by default (so the
 * no-thought path exports everything), and lets the columns be narrowed when someone wants a
 * shorter sheet. The tick state is remembered per list, because exports get repeated.
 *
 * @param detail an optional child collection — invoice lines, ledger rows — that can be flattened
 *   into the sheet, one output row per child with the parent's columns repeated alongside.
 */
export function ExportDialog<T, L>({
  title,
  filename,
  rows,
  columns,
  detail,
  onClose,
}: {
  title: string;
  /** Also the localStorage key for the remembered tick state, so keep it stable per list. */
  filename: string;
  rows: T[];
  columns: ExportColumn<T>[];
  detail?: {
    /** Checkbox label, e.g. "Include item details". */
    label: string;
    hint?: string;
    lines: (row: T) => L[];
    columns: ExportColumn<L>[];
  };
  onClose: () => void;
}) {
  const prefKey = `vyapar.export.${filename}.v1`;
  const allKeys = useMemo(
    () => [...columns.map((c) => `p:${c.key}`), ...(detail?.columns ?? []).map((c) => `l:${c.key}`)],
    [columns, detail]
  );

  /**
   * Last time's choice, read once as this dialog opens. It's read in the initialiser rather than an
   * effect so the first paint already shows the remembered ticks — and the dialog only ever mounts
   * from a click, so there is no server render to trip over `localStorage`.
   *
   * Only the *unticked* keys are stored. Keys added to the list since then are therefore on by
   * default, so a newly added column never goes silently missing from someone's export.
   */
  const [saved] = useState<{
    off: Set<string>;
    detail: boolean;
    grouping?: "merge" | "repeat";
    format?: "xlsx" | "csv";
  }>(() => {
    try {
      const raw = typeof window === "undefined" ? null : localStorage.getItem(prefKey);
      if (!raw) return { off: new Set<string>(), detail: true };
      const parsed = JSON.parse(raw) as {
        off?: string[];
        detail?: boolean;
        grouping?: "merge" | "repeat";
        format?: "xlsx" | "csv";
      };
      return {
        off: new Set(parsed.off ?? []),
        detail: parsed.detail ?? true,
        grouping: parsed.grouping,
        format: parsed.format,
      };
    } catch {
      /* a malformed preference blob just means "everything", which is the right default */
      return { off: new Set<string>(), detail: true, grouping: undefined, format: undefined };
    }
  });

  const [picked, setPicked] = useState<Set<string>>(() => new Set(allKeys.filter((k) => !saved.off.has(k))));
  const [withDetail, setWithDetail] = useState(saved.detail);
  /**
   * How the parent's own columns behave once one row has become many.
   *
   * "repeat" writes the invoice's date, number and party against every item — fine for a pivot
   * table, unreadable as a register. "merge" is what a person actually wants: the invoice's cells
   * span its item rows and read as one. Merging is a real spreadsheet feature, so it forces .xlsx;
   * CSV can only approximate it by leaving the repeats blank.
   */
  const [grouping, setGrouping] = useState<"merge" | "repeat">(saved.grouping ?? "merge");
  const [format, setFormat] = useState<"xlsx" | "csv">(saved.format ?? "xlsx");

  const toggle = useCallback((key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const parentCols = columns.filter((c) => picked.has(`p:${c.key}`));
  const lineCols = detail && withDetail ? detail.columns.filter((c) => picked.has(`l:${c.key}`)) : [];
  const canExport = parentCols.length + lineCols.length > 0 && rows.length > 0;

  function run() {
    const head = [...parentCols.map((c) => c.label), ...lineCols.map((c) => c.label)];
    const out: (string | number | null | undefined)[][] = [];
    const merges: CellMerge[] = [];

    for (const row of rows) {
      const parent = parentCols.map((c) => c.value(row));
      if (!lineCols.length) {
        out.push(parent);
        continue;
      }
      const lines = detail!.lines(row);
      // A parent with no children still belongs in the sheet — otherwise an invoice whose lines
      // failed to load would vanish from an export that was meant to be the complete list.
      const span = Math.max(1, lines.length);
      const firstRow = out.length;
      for (let i = 0; i < span; i++) {
        const line = lines[i];
        const lineCells = line ? lineCols.map((c) => c.value(line)) : lineCols.map(() => "");
        // Only the first row of a group carries the parent's values when they're being grouped:
        // a merged cell takes its value from its top-left corner, and for CSV the blanks are the
        // closest thing to a merge the format allows.
        const parentCells = i === 0 || grouping === "repeat" ? parent : parent.map(() => "");
        out.push([...parentCells, ...lineCells]);
      }
      if (grouping === "merge" && span > 1) {
        for (let c = 0; c < parentCols.length; c++) {
          merges.push({ startRow: firstRow, endRow: firstRow + span - 1, startCol: c, endCol: c });
        }
      }
    }

    // Merges only exist in a real spreadsheet; asking for them in CSV silently gets the blanks.
    if (format === "xlsx") exportRowsToXlsx(filename, head, out, grouping === "merge" ? merges : []);
    else exportRowsToCsv(filename, head, out);

    try {
      localStorage.setItem(
        prefKey,
        JSON.stringify({
          off: allKeys.filter((k) => !picked.has(k)),
          detail: withDetail,
          grouping,
          format,
        })
      );
    } catch {
      /* storage unavailable — the export still happened, which is what was asked for */
    }
    onClose();
  }

  const rowCount = lineCols.length
    ? rows.reduce((t, r) => t + Math.max(1, detail!.lines(r).length), 0)
    : rows.length;

  return (
    <Modal onClose={onClose} guardOnClose={false} wide>
      <div className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-brand-accent" />
          <h2 className="text-base font-semibold text-gray-800">Export {title}</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Every column is included by default. Untick anything you don&apos;t want in the sheet.
        </p>

        <Group
          heading="Columns"
          count={`${parentCols.length}/${columns.length}`}
          onAll={() => setPicked((p) => new Set([...p, ...columns.map((c) => `p:${c.key}`)]))}
          onNone={() =>
            setPicked((p) => new Set([...p].filter((k) => !k.startsWith("p:"))))
          }
        >
          {columns.map((c) => (
            <Tick key={c.key} label={c.label} checked={picked.has(`p:${c.key}`)} onChange={() => toggle(`p:${c.key}`)} />
          ))}
        </Group>

        {detail && (
          <div className="mt-4">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
              <input
                type="checkbox"
                checked={withDetail}
                onChange={(e) => setWithDetail(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-cyan-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-700">{detail.label}</span>
                <span className="block text-xs text-gray-500">
                  {detail.hint ?? "One row per line, with the columns above repeated against each."}
                </span>
              </span>
            </label>

            {withDetail && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Choice
                  label="Merge each document's cells"
                  hint="One invoice reads as one cell, spanning its items. Needs Excel."
                  checked={grouping === "merge"}
                  onChange={() => { setGrouping("merge"); setFormat("xlsx"); }}
                />
                <Choice
                  label="Repeat on every row"
                  hint="Every item row carries the document's details. Best for pivot tables."
                  checked={grouping === "repeat"}
                  onChange={() => setGrouping("repeat")}
                />
              </div>
            )}

            {withDetail && (
              <div className="mt-3">
                <Group
                  heading={detail.label}
                  count={`${lineCols.length}/${detail.columns.length}`}
                  onAll={() => setPicked((p) => new Set([...p, ...detail.columns.map((c) => `l:${c.key}`)]))}
                  onNone={() => setPicked((p) => new Set([...p].filter((k) => !k.startsWith("l:"))))}
                >
                  {detail.columns.map((c) => (
                    <Tick key={c.key} label={c.label} checked={picked.has(`l:${c.key}`)} onChange={() => toggle(`l:${c.key}`)} />
                  ))}
                </Group>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <span className="text-xs text-gray-500">
            {rowCount.toLocaleString("en-IN")} row{rowCount === 1 ? "" : "s"} ·{" "}
            {(parentCols.length + lineCols.length).toLocaleString("en-IN")} column
            {parentCols.length + lineCols.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              Cancel
            </button>
            <div className="flex overflow-hidden rounded-lg border border-gray-200">
              {(["xlsx", "csv"] as const).map((f) => {
                const blocked = f === "csv" && withDetail && !!detail && grouping === "merge";
                return (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    disabled={blocked}
                    title={blocked ? "CSV can't merge cells — switch to “Repeat on every row” first." : undefined}
                    className={`px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                      format === f ? "bg-brand-accent text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                    } ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    {f === "xlsx" ? "Excel" : "CSV"}
                  </button>
                );
              })}
            </div>
            <button
              onClick={run}
              disabled={!canExport}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Group({
  heading,
  count,
  onAll,
  onNone,
  children,
}: {
  heading: string;
  count: string;
  onAll: () => void;
  onNone: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">
          {heading} <span className="text-gray-300">· {count}</span>
        </span>
        <span className="flex gap-1 text-xs">
          <button onClick={onAll} className="rounded px-2 py-0.5 text-cyan-700 transition-colors hover:bg-cyan-50">
            All
          </button>
          <button onClick={onNone} className="rounded px-2 py-0.5 text-gray-500 transition-colors hover:bg-gray-50">
            None
          </button>
        </span>
      </div>
      <div className="grid max-h-56 grid-cols-2 gap-x-3 overflow-y-auto p-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-gray-50">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
          checked ? "border-cyan-600 bg-cyan-600 text-white" : "border-gray-300 bg-white"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="truncate text-sm text-gray-700" title={label}>
        {label}
      </span>
    </label>
  );
}

/** A radio-style card for a mutually exclusive export shape. */
function Choice({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors duration-150 ${
        checked ? "border-brand-accent bg-cyan-50/60" : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-cyan-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}
