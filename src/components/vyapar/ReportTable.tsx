"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Search, Settings2, X } from "lucide-react";
import { VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Modal } from "@/components/Modal";
import { FilterTh, useColumnFilters, type FilterType } from "@/components/vyapar/ColumnFilter";
import { useTableSort } from "@/lib/useTableSort";
import { exportRowsToCsv, downloadPdf, printRows } from "@/lib/vyaparExport";

/**
 * The table every Vyapar report renders through.
 *
 * Reports used to be a bare `<table>` with a single Download button: no sorting, no filtering, and
 * no way to see what a PDF would contain before it landed in Downloads. The transaction lists next
 * door had all three, and the client kept asking why a report — the thing you actually hand to an
 * accountant — had less than the screen you built it from.
 *
 * So: per-column funnels and sorting (the same components the lists use), a column picker for the
 * print-out, and a preview of exactly that print-out with Print / PDF / CSV from inside it.
 */

export interface ReportColumn<T> {
  key: string;
  label: string;
  /** The cell as rendered on screen and in the PDF. */
  value: (row: T) => string | number;
  /** What sorting and filtering compare — the raw number behind a formatted amount. */
  sortValue?: (row: T) => string | number | null | undefined;
  type?: FilterType;
  align?: "left" | "right";
  /** Off by default in the print picker. Everything is shown on screen regardless. */
  printOptional?: boolean;
}

export function ReportTable<T>({
  title,
  subtitle,
  columns,
  rows,
  filename,
  /** A block printed under each row in the PDF — the item lines on a sale report. */
  detail,
  minWidth = 720,
}: {
  title: string;
  subtitle?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  filename: string;
  detail?: ReportDetail<T>;
  minWidth?: number;
}) {
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Which columns the print-out carries. Everything except the explicitly optional ones.
  const [printKeys, setPrintKeys] = useState<string[]>(() =>
    columns.filter((c) => !c.printOptional).map((c) => c.key),
  );
  const [withDetail, setWithDetail] = useState(!!detail?.defaultOn);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(needle)));
  }, [rows, q, columns]);

  const filterColumns = useMemo(() => {
    const out: Record<string, { get: (row: T) => string | number | null | undefined; type?: FilterType }> = {};
    for (const c of columns) out[c.key] = { get: c.sortValue ?? c.value, type: c.type ?? "text" };
    return out;
  }, [columns]);
  const { filtered, filters, setFilter, options, activeCount, clearAll } = useColumnFilters(
    searched,
    filterColumns,
  );

  const sortAccessors = useMemo(() => {
    const out: Record<string, (row: T) => string | number | null | undefined> = {};
    for (const c of columns) out[c.key] = c.sortValue ?? c.value;
    return out;
  }, [columns]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, sortAccessors);

  const printCols = columns.filter((c) => printKeys.includes(c.key));
  const head = printCols.map((c) => c.label);
  const body = sorted.map((r) => printCols.map((c) => c.value(r)));
  const rightFrom = printCols.findIndex((c) => c.align === "right");

  const asPdf = () =>
    downloadPdf(title, head, body, {
      subtitle,
      // Wide reports go landscape rather than squeezing eleven columns onto a portrait page.
      landscape: printCols.length > 7,
      rightAlignFrom: rightFrom >= 0 ? rightFrom : undefined,
    });
  const asPrint = () => printRows(title, head, body, subtitle);
  const asCsv = () => exportRowsToCsv(filename, head, body);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 focus-within:border-cyan-500">
          <Search size={14} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this report…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
            >
              <X size={12} /> Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
            </button>
          )}
          <span className="px-1 text-xs text-gray-400">
            {sorted.length} of {rows.length}
          </span>
          <ToolButton icon={Settings2} label="Print options" onClick={() => setPicking(true)} />
          <ToolButton icon={FileText} label="Preview" onClick={() => setPreviewing(true)} primary />
          <ToolButton icon={FileSpreadsheet} label="Export CSV" onClick={asCsv} />
          <ToolButton icon={Printer} label="Print" onClick={asPrint} />
          <ToolButton icon={Download} label="Download PDF" onClick={asPdf} />
        </div>
      </div>

      {sorted.length === 0 ? (
        <VyaparEmpty
          icon={FileText}
          title={rows.length === 0 ? "Nothing in this range" : "Nothing matches these filters"}
          hint={rows.length === 0 ? "Adjust the date filter to see more." : "Clear a filter to widen the report."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm" style={{ minWidth }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                {columns.map((c) => (
                  <FilterTh
                    key={c.key}
                    label={c.label}
                    align={c.align}
                    sortKey={c.key}
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggle}
                    filterKey={c.key}
                    type={c.type ?? "text"}
                    options={options[c.key]}
                    filter={filters[c.key]}
                    onApply={setFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 ${
                        c.align === "right" ? "text-right font-medium text-gray-800 tabular-nums" : "text-gray-600"
                      }`}
                    >
                      {c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <PrintOptions
          columns={columns}
          selected={printKeys}
          onChange={setPrintKeys}
          detail={detail ? { label: detail.label, on: withDetail, onChange: setWithDetail } : undefined}
          onClose={() => setPicking(false)}
        />
      )}

      {previewing && (
        <ReportPreview
          title={title}
          subtitle={subtitle}
          columns={printCols}
          rows={sorted}
          detail={withDetail ? detail : undefined}
          onPrint={asPrint}
          onPdf={asPdf}
          onCsv={asCsv}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

/** Sub-rows printed under each row — the item lines of a sale, with their own header. */
export interface ReportDetail<T> {
  label: string;
  defaultOn?: boolean;
  head: string[];
  rows: (row: T) => (string | number)[][];
  /** Trailing summary lines under a row's detail block ("Sub Total", "Round off"). */
  footer?: (row: T) => [string, string][];
  alignRightFrom?: number;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
        primary
          ? "bg-brand-accent text-white hover:opacity-90"
          : "border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
      }`}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Which columns the print-out carries — Vyapar's "Select Print Options".
 *
 * The screen always shows everything; this is only about the paper, where eleven columns is the
 * difference between a readable statement and an unreadable one.
 */
function PrintOptions<T>({
  columns,
  selected,
  onChange,
  detail,
  onClose,
}: {
  columns: ReportColumn<T>[];
  selected: string[];
  onChange: (keys: string[]) => void;
  detail?: { label: string; on: boolean; onChange: (on: boolean) => void };
  onClose: () => void;
}) {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="p-6">
        <h2 className="text-base font-semibold text-gray-800">Select Print Options</h2>
        <p className="mt-1 text-sm text-gray-500">Which columns the printed report and the PDF carry.</p>

        <div className="mt-4 grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-8">
          {columns.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="h-4 w-4 accent-cyan-600"
              />
              {c.label}
            </label>
          ))}
          {detail && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={detail.on}
                onChange={(e) => detail.onChange(e.target.checked)}
                className="h-4 w-4 accent-cyan-600"
              />
              {detail.label}
            </label>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => onChange(columns.map((c) => c.key))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
          <button
            onClick={onClose}
            disabled={selected.length === 0}
            className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** How the report will look on paper, before it becomes a file. */
function ReportPreview<T>({
  title,
  subtitle,
  columns,
  rows,
  detail,
  onPrint,
  onPdf,
  onCsv,
  onClose,
}: {
  title: string;
  subtitle?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  detail?: ReportDetail<T>;
  onPrint: () => void;
  onPdf: () => void;
  onCsv: () => void;
  onClose: () => void;
}) {
  // A statement can run to thousands of rows; the paper carries them all, the preview shows enough
  // to answer "is this the right report?".
  const CAP = 100;
  const shown = rows.slice(0, CAP);

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">Preview</h2>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          <h3 className="text-center text-lg font-bold text-gray-900 underline">{title}</h3>
          {subtitle && <p className="mt-1 text-center text-sm text-gray-500">{subtitle}</p>}

          <table className="mt-5 w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-gray-300 bg-gray-100 text-left">
                {columns.map((c) => (
                  <th key={c.key} className={`px-2 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <ReportPreviewRow key={ri} row={r} columns={columns} detail={detail} />
              ))}
            </tbody>
          </table>

          {rows.length > shown.length && (
            <p className="mt-3 text-center text-xs text-gray-400">
              Showing the first {shown.length} of {rows.length} rows — the PDF and CSV carry every one.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-3">
          <button
            onClick={onPdf}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Save PDF
          </button>
          <button
            onClick={onPrint}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Print
          </button>
          <button
            onClick={onCsv}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Export CSV
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReportPreviewRow<T>({
  row,
  columns,
  detail,
}: {
  row: T;
  columns: ReportColumn<T>[];
  detail?: ReportDetail<T>;
}) {
  const lines = detail?.rows(row) ?? [];
  const footer = detail?.footer?.(row) ?? [];
  const right = detail?.alignRightFrom ?? detail?.head.length ?? 0;

  return (
    <>
      <tr className="border-b border-gray-200">
        {columns.map((c) => (
          <td key={c.key} className={`px-2 py-1.5 align-top ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
            {c.value(row)}
          </td>
        ))}
      </tr>
      {lines.length > 0 && (
        <tr className="border-b border-gray-200">
          <td colSpan={columns.length} className="px-2 pb-2">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  {detail!.head.map((h, i) => (
                    <th key={h} className={`px-2 py-1 font-medium ${i >= right ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, li) => (
                  <tr key={li}>
                    {l.map((cell, ci) => (
                      <td key={ci} className={`px-2 py-1 ${ci >= right ? "text-right tabular-nums" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {footer.length > 0 && (
              <div className="mt-1 flex flex-col items-end gap-0.5 text-[11px] text-gray-600">
                {footer.map(([label, value]) => (
                  <div key={label} className="flex w-56 justify-between">
                    <span>{label}</span>
                    <span className="tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
