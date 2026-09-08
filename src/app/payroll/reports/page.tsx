"use client";

import { useEffect, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { PAYROLL_REPORT_GROUPS } from "@/lib/payrollConfig";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import {
  loadReportContext,
  buildReport,
  currentReportMonth,
  isReportBuilt,
  type ReportContext,
  type ReportData,
} from "@/lib/payrollReports";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Search,
  Shield,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

const GROUP_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  calendar: CalendarDays, wallet: Wallet, shield: Shield, trophy: Trophy, users: Users,
};

/** Reports — the five report groups, searchable, with a generate/download action per report. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function ReportsPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  /**
   * Which month every report on this page covers. It used to be pinned to today's month with no way
   * to change it, so on the 2nd of a month the reports were nearly empty and last month's — the set
   * payroll actually files — could not be produced at all.
   */
  const [month, setMonth] = useState(currentReportMonth());
  // Keyed by month so switching months replaces the dataset rather than leaving the old one on
  // screen under a new heading.
  const [ctx, setCtx] = useState<{ month: string; data: ReportContext } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  /**
   * The report on screen. Opening one used to drop a PDF straight into Downloads, so the only way
   * to find out whether a report held what you wanted — or anything at all — was to open the file.
   * It is shown first now; the PDF and the CSV are taken from the preview.
   */
  const [preview, setPreview] = useState<{ name: string; report: ReportData } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadReportContext(month)
      .then((data) => { if (!cancelled) { setCtx({ month, data }); setError(""); } })
      .catch(() => { if (!cancelled) setError("Couldn't load report data — check your connection."); });
    return () => { cancelled = true; };
  }, [month]);

  // Only the month currently on screen counts as loaded; a stale one still shows the loader.
  const data = ctx?.month === month ? ctx.data : null;

  /** Step the month by whole months, keeping the `yyyy-MM` shape the loader expects. */
  const stepMonth = (delta: 1 | -1) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  })();
  const isCurrentMonth = month === currentReportMonth();

  const run = async (name: string, mode: "print" | "csv") => {
    if (!data) return;
    setBusy(name + mode);
    try {
      const r = buildReport(name, data);
      if (mode === "csv") exportRowsToCsv(slug(name), r.head, r.rows);
      else await downloadPdf(r.title, r.head, r.rows, { rightAlignFrom: r.rightAlignFrom });
    } finally {
      setBusy("");
    }
  };

  const groups = PAYROLL_REPORT_GROUPS.map((g) => ({
    ...g,
    reports: g.reports.filter((r) => !query || r.name.toLowerCase().includes(query) || r.desc.toLowerCase().includes(query)),
  })).filter((g) => g.reports.length > 0);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Reports</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Payroll, attendance and compliance reports for <strong>{monthLabel}</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button onClick={() => stepMonth(-1)} title="Previous month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50">
                <ChevronLeft size={15} />
              </button>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                aria-label="Report month"
                className="w-[130px] bg-transparent px-1 text-center text-sm font-semibold text-gray-700 outline-none"
              />
              <button onClick={() => stepMonth(1)} title="Next month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50">
                <ChevronRight size={15} />
              </button>
            </div>
            {!isCurrentMonth && (
              <button
                onClick={() => setMonth(currentReportMonth())}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-50/50"
              >
                This month
              </button>
            )}
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
              <Search size={15} className="text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        {!data && !error && (
          <div className="rounded-lg bg-cyan-50/60 px-4 py-2 text-sm text-brand-accent">Loading {monthLabel}…</div>
        )}
        {data && data.payslips.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-2 text-sm text-amber-800">
            No payroll run has been generated for {monthLabel}, so the salary, deduction and statutory reports will come
            back empty. Attendance reports read the muster directly and are unaffected.
          </div>
        )}

        {groups.map((g) => {
          const Icon = GROUP_ICON[g.icon] ?? BarChart3;
          return (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={14} /></div>
                <h3 className="text-sm font-semibold text-gray-800">{g.title}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.reports.map((r) => {
                  const built = isReportBuilt(r.name);
                  return (
                    <div
                      key={r.name}
                      className={`group flex flex-col rounded-xl border bg-white p-4 transition-all ${
                        built
                          ? "border-gray-200 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm"
                          : "border-dashed border-gray-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText
                          size={16}
                          className={`mt-0.5 shrink-0 text-gray-400 ${built ? "group-hover:text-brand-accent" : ""}`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800">{r.name}</div>
                          <p className="mt-0.5 text-xs text-gray-400">{r.desc}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {built ? (
                          <>
                            <button
                              onClick={() => data && setPreview({ name: r.name, report: buildReport(r.name, data) })}
                              disabled={!data || busy !== ""}
                              className="flex items-center gap-1 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-100 disabled:opacity-50"
                            >
                              <Eye size={12} /> Preview
                            </button>
                            <button
                              onClick={() => run(r.name, "print")}
                              disabled={!data || busy !== ""}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
                            >
                              <BarChart3 size={12} /> {busy === r.name + "print" ? "Generating…" : "PDF"}
                            </button>
                            <button
                              onClick={() => run(r.name, "csv")}
                              disabled={!data || busy !== ""}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Download size={12} /> CSV
                            </button>
                          </>
                        ) : (
                          /* No builder yet. Offering a PDF here would hand over the staff directory
                             under this heading — a document that looks filed and is not. */
                          <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">
                            Not built yet
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {groups.length === 0 && <p className="py-12 text-center text-sm text-gray-400">No reports match “{q}”.</p>}
      </div>

      {preview && (
        <ReportPreview
          name={preview.name}
          report={preview.report}
          busy={busy}
          onClose={() => setPreview(null)}
          onPdf={() => run(preview.name, "print")}
          onCsv={() => run(preview.name, "csv")}
        />
      )}
    </PayrollShell>
  );
}

/** Long reports are capped on screen; the PDF and CSV always carry every row. */
const PREVIEW_ROW_CAP = 200;

/**
 * The report on screen before it becomes a file.
 *
 * Pressing Generate used to drop a PDF straight into Downloads, so the only way to find out whether
 * a report held what you wanted — or anything at all — was to open the file. Most months several of
 * these are empty, and that was three clicks and a file manager to discover.
 *
 * Read-only, so the discard guard is off: there is nothing here to lose.
 */
function ReportPreview({
  name,
  report,
  busy,
  onClose,
  onPdf,
  onCsv,
}: {
  name: string;
  report: ReportData;
  busy: string;
  onClose: () => void;
  onPdf: () => void;
  onCsv: () => void;
}) {
  const shown = report.rows.slice(0, PREVIEW_ROW_CAP);
  const right = report.rightAlignFrom ?? report.head.length;

  return (
    <Drawer title={report.title} onClose={onClose} width="max-w-5xl" guardOnClose={false}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            {report.rows.length} {report.rows.length === 1 ? "row" : "rows"}
            {report.rows.length > shown.length && <> · showing the first {shown.length}</>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onPdf}
              disabled={busy !== ""}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === name + "print" ? <Spinner size={13} /> : <BarChart3 size={13} />}
              {busy === name + "print" ? "Generating…" : "Download PDF"}
            </button>
            <button
              onClick={onCsv}
              disabled={busy !== ""}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {report.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-400">
            Nothing to report for this month.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                  {report.head.map((h, i) => (
                    <th key={h} className={`px-3 py-2 ${i >= right ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-3 py-2 whitespace-nowrap ${
                          j >= right ? "text-right tabular-nums" : "text-gray-700"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}
