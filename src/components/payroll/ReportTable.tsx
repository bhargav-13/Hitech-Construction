"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReportData } from "@/lib/payrollReports";

/** Rows shown on screen; the download always carries every row. */
export const PREVIEW_ROW_CAP = 200;

/** A cell as something sortable: "₹1,23,456.00" / "12.5" sort as numbers, everything else as text. */
function sortValue(cell: string | number): string | number {
  if (typeof cell === "number") return cell;
  const t = cell.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  return t !== "" && /^-?\d+(\.\d+)?%?$/.test(t) ? parseFloat(t) : cell;
}

export function ReportTable({ report }: { report: Pick<ReportData, "head" | "rows" | "rightAlignFrom"> }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const right = report.rightAlignFrom ?? report.head.length;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? report.rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(t))) : report.rows;
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const av = sortValue(a[sort.col] ?? ""), bv = sortValue(b[sort.col] ?? "");
      if (av === "" || av === "—") return 1;
      if (bv === "" || bv === "—") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * sort.dir;
    });
  }, [report.rows, q, sort]);
  const shown = rows.slice(0, PREVIEW_ROW_CAP);
  const click = (col: number) => setSort((s) => (s?.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…" className="input w-64" />
        {q && <span className="text-xs text-gray-500">{rows.length} of {report.rows.length} rows</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {report.head.map((h, i) => (
                <th key={`${h}-${i}`} className={`px-3 py-2 ${i >= right ? "text-right" : ""}`}>
                  <button type="button" onClick={() => click(i)} className={`inline-flex items-center gap-1 uppercase hover:text-gray-700 ${sort?.col === i ? "text-brand-accent" : ""}`}>
                    {h}
                    {sort?.col === i ? (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="opacity-30" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                {row.map((cell, j) => <td key={j} className={`whitespace-nowrap px-3 py-2 ${j >= right ? "text-right tabular-nums" : "text-gray-700"}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
