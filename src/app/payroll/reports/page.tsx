"use client";

import { useEffect, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { PAYROLL_REPORT_GROUPS } from "@/lib/payrollConfig";
import { loadReportContext, buildReport, type ReportContext } from "@/lib/payrollReports";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import {
  BarChart3,
  CalendarDays,
  Download,
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

  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadReportContext()
      .then(setCtx)
      .catch(() => setError("Couldn't load report data — check your connection."))
      .finally(() => setLoading(false));
  }, []);

  const run = async (name: string, mode: "print" | "csv") => {
    if (!ctx) return;
    setBusy(name + mode);
    try {
      const r = buildReport(name, ctx);
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
            <p className="mt-0.5 text-sm text-gray-500">Generate, view and download payroll, attendance and compliance reports.</p>
          </div>
          <div className="flex min-w-[240px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        {loading && <div className="rounded-lg bg-cyan-50/60 px-4 py-2 text-sm text-brand-accent">Loading live data…</div>}

        {groups.map((g) => {
          const Icon = GROUP_ICON[g.icon] ?? BarChart3;
          return (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={14} /></div>
                <h3 className="text-sm font-semibold text-gray-800">{g.title}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.reports.map((r) => (
                  <div key={r.name} className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm">
                    <div className="flex items-start gap-2">
                      <FileText size={16} className="mt-0.5 shrink-0 text-gray-400 group-hover:text-brand-accent" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">{r.name}</div>
                        <p className="mt-0.5 text-xs text-gray-400">{r.desc}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => run(r.name, "print")}
                        disabled={!ctx || busy !== ""}
                        className="flex items-center gap-1 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-100 disabled:opacity-50"
                      >
                        <BarChart3 size={12} /> {busy === r.name + "print" ? "Generating…" : "Generate PDF"}
                      </button>
                      <button
                        onClick={() => run(r.name, "csv")}
                        disabled={!ctx || busy !== ""}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Download size={12} /> Export CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {groups.length === 0 && <p className="py-12 text-center text-sm text-gray-400">No reports match “{q}”.</p>}
      </div>
    </PayrollShell>
  );
}
