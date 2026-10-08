"use client";

import { useEffect, useMemo, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import {
  loadReportContext, buildReport, buildCustomReport, currentReportMonth, REPORT_CATALOGUE, REPORT_COUNT,
  CUSTOM_DIMENSIONS, CUSTOM_METRICS,
  type CustomDimension, type CustomMetric, type ReportContext, type ReportData,
} from "@/lib/payrollReports";
import { exportRowsToCsv, exportRowsToXlsx, downloadPdf } from "@/lib/vyaparExport";
import {
  BarChart3, Bookmark, BookmarkCheck, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Download, Eye, FileSpreadsheet,
  FileText, Grid3x3, Home, Landmark, MinusCircle, Plane, Receipt, Search, Shield, Users, Wallet,
} from "lucide-react";
import { ReportTable, PREVIEW_ROW_CAP } from "@/components/payroll/ReportTable";

const CAT_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  calendar: CalendarDays, leave: Plane, wallet: Wallet, shield: Shield, bank: Landmark, users: Users,
  minus: MinusCircle, landmark: Landmark, receipt: Receipt, grid: Grid3x3, audit: ClipboardList,
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const BOOKMARK_KEY = "payroll.reportBookmarks.v1";

function readBookmarks(): string[] {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) ?? "[]"); } catch { return []; }
}

type View = "home" | "bookmarked" | string;

/**
 * Reports — PagarBook's report centre: a category rail (Home, Bookmarked, Attendance, Leave,
 * Payroll, Statutory, Payment Logs, Employees, Deductions, Loans, Reimbursements, Miscellaneous,
 * Audit), every report previewable and downloadable as PDF / Excel / CSV for the chosen month, and
 * a Custom Reports tab that groups staff by a dimension and totals the chosen metrics.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState<"reports" | "custom">("reports");
  const [view, setView] = useState<View>("home");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(currentReportMonth());
  const [ctx, setCtx] = useState<{ month: string; data: ReportContext } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ name: string; report: ReportData } | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useEffect(() => { setBookmarks(readBookmarks()); }, []);
  useEffect(() => {
    let cancelled = false;
    loadReportContext(month)
      .then((data) => { if (!cancelled) { setCtx({ month, data }); setError(""); } })
      .catch(() => { if (!cancelled) setError("Couldn't load report data — check your connection."); });
    return () => { cancelled = true; };
  }, [month]);
  const data = ctx?.month === month ? ctx.data : null;

  const toggleBookmark = (name: string) => {
    const next = bookmarks.includes(name) ? bookmarks.filter((b) => b !== name) : [...bookmarks, name];
    setBookmarks(next);
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next)); } catch { /* private window */ }
  };

  const stepMonth = (delta: 1 | -1) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const monthLabel = (() => { const [y, m] = month.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); })();

  async function download(r: ReportData, mode: "pdf" | "xlsx" | "csv", name: string) {
    setBusy(name + mode);
    try {
      if (mode === "csv") exportRowsToCsv(slug(name), r.head, r.rows);
      else if (mode === "xlsx") await exportRowsToXlsx(slug(name), r.head, r.rows, [], { title: r.title });
      else await downloadPdf(r.title, r.head, r.rows, { rightAlignFrom: r.rightAlignFrom, landscape: r.head.length > 8 });
    } finally { setBusy(""); }
  }

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = REPORT_CATALOGUE.flatMap((c) => c.reports.map((r) => ({ ...r, cat: c })));
    return list.filter((r) => {
      if (query && !r.name.toLowerCase().includes(query) && !r.desc.toLowerCase().includes(query)) return false;
      if (view === "bookmarked") return bookmarks.includes(r.name);
      if (view !== "home" && !query) return r.cat.key === view;
      return true;
    });
  }, [query, view, bookmarks]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Reports</h2>
            <p className="mt-0.5 text-sm text-gray-500">{REPORT_COUNT} reports for <strong>{monthLabel}</strong> — preview, PDF, Excel or CSV.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button onClick={() => stepMonth(-1)} title="Previous month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Report month" className="w-[130px] bg-transparent px-1 text-center text-sm font-semibold text-gray-700 outline-none" />
              <button onClick={() => stepMonth(1)} title="Next month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>

        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
          {([["reports", "Reports"], ["custom", "Custom Reports"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 text-sm font-medium ${tab === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        {!data && !error && <div className="rounded-lg bg-cyan-50/60 px-4 py-2 text-sm text-brand-accent">Loading {monthLabel}…</div>}
        {data && data.payslips.length === 0 && tab === "reports" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2 text-sm text-amber-800">
            No payroll has been generated for {monthLabel}, so salary, deduction and statutory reports will be empty. Attendance reports read the muster directly.
          </div>
        )}

        {tab === "custom" ? (
          <CustomReport data={data} onPreview={(r) => setPreview({ name: "Custom report", report: r })} onDownload={(r, mode) => download(r, mode, "custom-report")} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <nav className="space-y-0.5 rounded-xl border border-gray-200 bg-white p-2">
              <RailItem active={view === "home"} onClick={() => setView("home")} icon={Home} label="Home" count={REPORT_COUNT} />
              <RailItem active={view === "bookmarked"} onClick={() => setView("bookmarked")} icon={Bookmark} label="Bookmarked" count={bookmarks.length} />
              <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Categories</div>
              {REPORT_CATALOGUE.map((c) => (
                <RailItem key={c.key} active={view === c.key} onClick={() => setView(c.key)} icon={CAT_ICON[c.icon] ?? FileText} label={c.title} count={c.reports.length} />
              ))}
            </nav>
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
                <Search size={15} className="text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" className="w-full bg-transparent text-sm outline-none" />
              </div>
              {visible.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">{view === "bookmarked" ? "No bookmarked reports yet — click the bookmark on any report." : `No reports match “${q}”.`}</p>
              ) : (
                <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {visible.map((r) => {
                    const marked = bookmarks.includes(r.name);
                    return (
                      <div key={r.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <button onClick={() => toggleBookmark(r.name)} title={marked ? "Remove bookmark" : "Bookmark"} className={`rounded p-1 ${marked ? "text-brand-accent" : "text-gray-300 hover:text-gray-500"}`}>
                          {marked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800">{r.name}</div>
                          <p className="text-xs text-gray-400">{r.desc}{view === "home" || query ? ` · ${r.cat.title}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => data && setPreview({ name: r.name, report: buildReport(r.name, data) })} disabled={!data} className="flex items-center gap-1 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent hover:bg-cyan-100 disabled:opacity-50">
                            <Eye size={12} /> Generate
                          </button>
                          <button onClick={() => data && download(buildReport(r.name, data), "xlsx", r.name)} disabled={!data || busy !== ""} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            <FileSpreadsheet size={12} /> Excel
                          </button>
                          <button onClick={() => data && download(buildReport(r.name, data), "pdf", r.name)} disabled={!data || busy !== ""} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            <BarChart3 size={12} /> {busy === r.name + "pdf" ? "…" : "PDF"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <ReportPreview
          name={preview.name}
          report={preview.report}
          busy={busy}
          onClose={() => setPreview(null)}
          onDownload={(mode) => download(preview.report, mode, preview.name)}
        />
      )}
    </PayrollShell>
  );
}

function RailItem({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; count: number;
}) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${active ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"}`}>
      <Icon size={14} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] text-gray-400">{count}</span>
    </button>
  );
}

function CustomReport({ data, onPreview, onDownload }: {
  data: ReportContext | null; onPreview: (r: ReportData) => void; onDownload: (r: ReportData, mode: "pdf" | "xlsx" | "csv") => void;
}) {
  const [by, setBy] = useState<CustomDimension>("Department");
  const [metrics, setMetrics] = useState<CustomMetric[]>(["Headcount", "Present Days", "Overtime ₹", "Gross Salary", "Net Salary"]);
  const toggle = (m: CustomMetric) => setMetrics((ms) => ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]);
  const report = data && metrics.length ? buildCustomReport(data, by, metrics) : null;
  const system: { label: string; by: CustomDimension; metrics: CustomMetric[]; desc: string }[] = [
    { label: "Department Payroll Cost", by: "Department", metrics: ["Headcount", "Gross Salary", "PF", "Net Salary"], desc: "Total payroll cost by department — gross pay, PF and net pay." },
    { label: "Overtime & Fine Spend", by: "Department", metrics: ["Overtime Hours", "Overtime ₹", "Fine ₹"], desc: "Overtime payout and fine deductions by department." },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {system.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div><div className="text-sm font-medium text-gray-800">{s.label}</div><p className="text-xs text-gray-400">{s.desc}</p></div>
            <button onClick={() => data && onPreview(buildCustomReport(data, s.by, s.metrics))} disabled={!data} className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent hover:bg-cyan-100 disabled:opacity-50">Generate</button>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-gray-800">Build your report</div>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-3">
            <label className="block text-xs text-gray-500">Rows — group by<Select value={by} onChange={(v) => setBy(v as CustomDimension)} options={CUSTOM_DIMENSIONS.map((d) => ({ value: d, label: d }))} /></label>
            <div>
              <span className="mb-1 block text-xs text-gray-500">Values — totals to show</span>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_METRICS.map((m) => (
                  <button key={m} onClick={() => toggle(m)} className={`rounded-full px-2.5 py-1 text-xs transition-colors ${metrics.includes(m) ? "bg-brand-accent text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => report && onDownload(report, "xlsx")} disabled={!report} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><FileSpreadsheet size={12} /> Excel</button>
              <button onClick={() => report && onDownload(report, "pdf")} disabled={!report} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><BarChart3 size={12} /> PDF</button>
              <button onClick={() => report && onDownload(report, "csv")} disabled={!report} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><Download size={12} /> CSV</button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Live preview</div>
            {!data ? <div className="flex items-center gap-2 py-8 text-sm text-gray-400"><Spinner size={14} /> Loading…</div> : !report || report.rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400">Pick at least one value.</div>
            ) : <ReportTable report={report} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The report on screen before it becomes a file. Read-only, so the discard guard is off. */
function ReportPreview({ name, report, busy, onClose, onDownload }: {
  name: string; report: ReportData; busy: string; onClose: () => void; onDownload: (mode: "pdf" | "xlsx" | "csv") => void;
}) {
  return (
    <Drawer title={report.title} onClose={onClose} width="max-w-5xl" guardOnClose={false}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            {report.rows.length} {report.rows.length === 1 ? "row" : "rows"}
            {report.rows.length > PREVIEW_ROW_CAP && <> · showing the first {PREVIEW_ROW_CAP}</>}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => onDownload("pdf")} disabled={busy !== ""} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy === name + "pdf" ? <Spinner size={13} /> : <BarChart3 size={13} />} PDF
            </button>
            <button onClick={() => onDownload("xlsx")} disabled={busy !== ""} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"><FileSpreadsheet size={13} /> Excel</button>
            <button onClick={() => onDownload("csv")} disabled={busy !== ""} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"><Download size={13} /> CSV</button>
          </div>
        </div>
        {report.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-400">Nothing to report for this month.</div>
        ) : <ReportTable report={report} />}
      </div>
    </Drawer>
  );
}
