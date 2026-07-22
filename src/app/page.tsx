"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BubbleCluster } from "@/components/BubbleCluster";
import { ProjectTable } from "@/components/ProjectTable";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useAppStore } from "@/lib/store";
import { useProjectScope } from "@/lib/projectScope";
import * as api from "@/lib/api";
import * as vyapar from "@/lib/vyaparApi";
import type { Invoice as VyaparInvoice, Payment as VyaparPayment } from "@/lib/vyaparApi";
import { formatLakh, inrAxis } from "@/lib/format";
import type { Project, ProjectHealth, ProjectStatus } from "@/lib/types";

/** Short month names for bucketing financials by month. */
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
import { BarChart3, FlaskConical, RefreshCw, Upload } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const HEALTH_COLORS: Record<string, string> = {
  Healthy: "#6b7fe8",
  "At Risk": "#f08a8a",
};

const STATUS_LABEL: Record<api.ProjectStatus, ProjectStatus> = {
  NOT_STARTED: "Not Started",
  ONGOING: "Ongoing",
  ONHOLD: "Onhold",
  COMPLETED: "Completed",
};
const HEALTH_LABEL: Record<api.ProjectHealth, ProjectHealth> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
};

function toProject(p: api.ProjectResponse): Project {
  return {
    id: String(p.id),
    name: p.name,
    category: p.category ?? "",
    keyPersonnel: p.keyPersonnel ?? "",
    status: STATUS_LABEL[p.status] ?? "Not Started",
    health: HEALTH_LABEL[p.health] ?? "Healthy",
    startDate: p.startDate ?? "",
    endDate: p.endDate ?? "",
    progress: p.progress,
    customerName: p.customerName ?? "",
    stage: p.stage ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    inAmount: p.inAmount,
    outAmount: p.outAmount,
    todoCount: p.todoCount,
    projectCode: p.projectCode ?? "",
    companyBranch: p.companyBranch ?? "",
    attendanceRadius: p.attendanceRadius,
    projectValue: p.projectValue,
    orientation: p.orientation ?? "",
    dimension: p.dimension ?? "",
    scopeOfWork: p.scopeOfWork ?? "",
  };
}

export default function DashboardPage() {
  // Sample/mock data — no backend yet for attendance or materials.
  const attendance = useAppStore((s) => s.attendance);
  const materials = useAppStore((s) => s.materials);
  const [tab, setTab] = useState<"Operational" | "Financial">("Operational");

  // Financials are real: they come from the Vyapar books (sales, expenses, payments).
  const [finInvoices, setFinInvoices] = useState<VyaparInvoice[]>([]);
  const [finPayments, setFinPayments] = useState<VyaparPayment[]>([]);
  const [finLoading, setFinLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inv, pay] = await Promise.all([vyapar.getInvoices(), vyapar.getPayments()]);
        if (!cancelled) {
          setFinInvoices(inv);
          setFinPayments(pay);
        }
      } catch {
        if (!cancelled) {
          setFinInvoices([]);
          setFinPayments([]);
        }
      } finally {
        if (!cancelled) setFinLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Projects ARE real (project-service) and honour the global project scope.
  const scopeId = useProjectScope((s) => s.projectId);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await api.getProjects({ size: 500 });
      setAllProjects(res.content.map(toProject));
    } catch {
      setAllProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const projects = useMemo(
    () => (scopeId === "all" ? allProjects : allProjects.filter((p) => p.id === scopeId)),
    [allProjects, scopeId]
  );

  const counts = useMemo(() => {
    const base = { "Not Started": 0, Ongoing: 0, Onhold: 0, Completed: 0 };
    for (const p of projects) base[p.status] += 1;
    return base;
  }, [projects]);

  const healthData = useMemo(() => {
    const base = { Healthy: 0, "At Risk": 0 };
    for (const p of projects) base[p.health] += 1;
    return [
      { name: "Healthy", value: base.Healthy },
      { name: "At Risk", value: base["At Risk"] },
    ];
  }, [projects]);

  const totalHealth = healthData.reduce((sum, d) => sum + d.value, 0);

  /**
   * Sales, expense and margin bucketed by month, straight from the Vyapar books.
   * Expense = purchase bills + recorded expenses; margin = sales - expense. All figures exclude
   * GST, which is collected on the government's behalf rather than earned or spent.
   */
  const financials = useMemo(() => {
    const byMonth = new Map<string, { sale: number; expense: number }>();
    const bump = (date: string | null, key: "sale" | "expense", amount: number) => {
      if (!date || date.length < 7) return;
      const m = date.slice(0, 7);
      const cur = byMonth.get(m) ?? { sale: 0, expense: 0 };
      cur[key] += amount;
      byMonth.set(m, cur);
    };
    for (const i of finInvoices) {
      const net = i.total - i.taxAmount;
      if (i.docType === "SALE") bump(i.invoiceDate, "sale", net);
      else if (i.docType === "SALE_RETURN") bump(i.invoiceDate, "sale", -net);
      else if (i.docType === "PURCHASE" || i.docType === "EXPENSE") bump(i.invoiceDate, "expense", net);
      else if (i.docType === "PURCHASE_RETURN") bump(i.invoiceDate, "expense", -net);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, v]) => ({
        month: `${MONTH_LABELS[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(2, 4)}`,
        sale: Math.round(v.sale),
        expense: Math.round(v.expense),
        margin: Math.round(v.sale - v.expense),
      }));
  }, [finInvoices]);

  const totalSales = financials.reduce((sum, f) => sum + f.sale, 0);
  const totalExpense = financials.reduce((sum, f) => sum + f.expense, 0);
  const totalMargin = totalSales - totalExpense;

  /** Payment in/out by month, for the Payments card. */
  const paymentSeries = useMemo(() => {
    const byMonth = new Map<string, { in: number; out: number }>();
    for (const p of finPayments) {
      if (!p.paymentDate || p.paymentDate.length < 7) continue;
      const m = p.paymentDate.slice(0, 7);
      const cur = byMonth.get(m) ?? { in: 0, out: 0 };
      cur[p.direction === "IN" ? "in" : "out"] += p.amount;
      byMonth.set(m, cur);
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, v]) => ({
        month: `${MONTH_LABELS[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(2, 4)}`,
        In: Math.round(v.in),
        Out: Math.round(v.out),
      }));
  }, [finPayments]);

  /** Expense split by document type, for the Expense Type card. */
  const expenseTypes = useMemo(() => {
    let purchase = 0;
    let expense = 0;
    for (const i of finInvoices) {
      const net = i.total - i.taxAmount;
      if (i.docType === "PURCHASE") purchase += net;
      else if (i.docType === "EXPENSE") expense += net;
    }
    return [
      { name: "Purchases", value: Math.round(purchase) },
      { name: "Expenses", value: Math.round(expense) },
    ].filter((d) => d.value > 0);
  }, [finInvoices]);

  return (
    <AppShell title="Dashboard">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-800">Company Dashboard</h2>
          {projectsLoading && <Spinner size={15} className="text-brand-accent" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadProjects()}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
            title="Reload projects"
          >
            <RefreshCw size={16} />
          </button>
          <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
            <Upload size={16} />
          </button>
        </div>
      </div>

      {/* Honesty banner: which parts are live vs. placeholder. */}
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        <FlaskConical size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <div>
          <span className="font-medium">Projects and financials are live</span> — financials come straight from the
          Vyapar books. Attendance and materials below are still{" "}
          <span className="font-medium">sample data</span>; those modules aren&apos;t connected yet.
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex gap-6 border-b border-gray-200 px-4">
          {(["Operational", "Financial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                tab === t
                  ? "border-brand-accent text-brand-accent"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Financial" ? (
          <div className="space-y-4 bg-gray-50 p-4">
            {finLoading ? (
              <div className="flex h-48 items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
                <Spinner size={16} className="text-brand-accent" /> Loading financials…
              </div>
            ) : financials.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white">
                <BarChart3 size={28} className="text-gray-300" />
                <span className="text-sm text-gray-500">No financial activity yet</span>
                <Link href="/vyapar/sale?new=1" className="text-xs font-medium text-brand-accent hover:underline">
                  Record your first sale in Vyapar
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Sales</h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financials}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={40} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v === 0 ? "0" : inrAxis(v))} />
                          <Tooltip formatter={(v) => formatLakh(Number(v))} />
                          <Bar dataKey="sale" fill="#0ca30c" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Expense</h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financials}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={40} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v === 0 ? "0" : inrAxis(v))} />
                          <Tooltip formatter={(v) => formatLakh(Number(v))} />
                          <Bar dataKey="expense" fill="#d6478a" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Margin</h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financials}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={40} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v === 0 ? "0" : inrAxis(v))} />
                          <Tooltip formatter={(v) => formatLakh(Number(v))} />
                          <Bar dataKey="margin" radius={[3, 3, 0, 0]}>
                            {financials.map((f) => (
                              <Cell key={f.month} fill={f.margin >= 0 ? "#0ca30c" : "#d6478a"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-green-50 p-4 text-center">
                    <div className="text-sm font-medium text-green-600">Total Sales</div>
                    <div className="mt-1 text-xl font-semibold text-gray-800">{formatLakh(totalSales)}</div>
                  </div>
                  <div className="rounded-xl bg-pink-50 p-4 text-center">
                    <div className="text-sm font-medium text-pink-600">Total Expense</div>
                    <div className="mt-1 text-xl font-semibold text-pink-600">{formatLakh(totalExpense)}</div>
                  </div>
                  <div className="rounded-xl bg-gray-100 p-4 text-center">
                    <div className="text-sm font-medium text-gray-500">Total Margin</div>
                    <div className={`mt-1 text-xl font-semibold ${totalMargin < 0 ? "text-pink-600" : "text-green-600"}`}>
                      {formatLakh(totalMargin)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Payments</h3>
                    {paymentSeries.length === 0 ? (
                      <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={paymentSeries}>
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v === 0 ? "0" : inrAxis(v))} />
                            <Tooltip formatter={(v) => formatLakh(Number(v))} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="In" fill="#0ca30c" radius={[3, 3, 0, 0]} maxBarSize={24} />
                            <Bar dataKey="Out" fill="#d6478a" radius={[3, 3, 0, 0]} maxBarSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Expense Type</h3>
                    {expenseTypes.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-300">
                        <BarChart3 size={28} />
                        <span className="text-xs text-gray-400">No expenses recorded yet</span>
                      </div>
                    ) : (
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={expenseTypes} dataKey="value" nameKey="name" innerRadius={28} outerRadius={52} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                              {expenseTypes.map((d, i) => (
                                <Cell key={d.name} fill={i === 0 ? "#6366f1" : "#d6478a"} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => formatLakh(Number(v))} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 bg-gray-50 p-4">
            <div className="grid grid-cols-3 gap-4">
              <FilterSelect label="Project Name" />
              <FilterSelect label="Project Status" />
              <FilterSelect label="Project Health" />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <KpiCard label="Not Started Projects" value={counts["Not Started"]} color="text-red-500" />
              <KpiCard label="Ongoing Projects" value={counts.Ongoing} color="text-green-600" />
              <KpiCard label="Onhold Projects" value={counts.Onhold} color="text-amber-500" />
              <KpiCard label="Completed Projects" value={counts.Completed} color="text-gray-600" />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Project Health</h3>
              <div className="flex items-center">
                <div className="h-64 w-full max-w-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="90%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={0}
                        outerRadius={140}
                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
                      >
                        {healthData.map((d) => (
                          <Cell key={d.name} fill={HEALTH_COLORS[d.name]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="ml-auto space-y-2 text-sm">
                  {healthData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ background: HEALTH_COLORS[d.name] }}
                      />
                      <span className="text-gray-600">{d.name === "Healthy" ? "-" : d.name}</span>
                      <span className="font-medium text-gray-800">{d.value}</span>
                    </div>
                  ))}
                  <div className="pt-1 text-xs text-gray-400">Total: {totalHealth}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Last 7 Days Attendance</h3>
                  <SampleBadge />
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <FilterSelect label="Payroll Type" compact />
                  <FilterSelect label="Workforce Name" compact />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendance} margin={{ bottom: 24 }}>
                      <CartesianGrid vertical={false} stroke="#eee" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        angle={-35}
                        textAnchor="end"
                        label={{ value: "Attendance date", position: "insideBottom", dy: 30, fontSize: 12 }}
                      />
                      <YAxis
                        domain={[0, 25]}
                        ticks={[0, 5, 10, 15, 20, 25]}
                        tick={{ fontSize: 12 }}
                        label={{ value: "No of Workers", angle: -90, position: "insideLeft", fontSize: 12 }}
                      />
                      <Tooltip />
                      <Bar dataKey="workers" fill="#22c55e" radius={[3, 3, 0, 0]} label={{ position: "top", fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Last 7 Days Material Received</h3>
                  <SampleBadge />
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <FilterSelect label="Material name" compact />
                  <FilterSelect label="Material Category" compact />
                </div>
                <BubbleCluster items={materials} />
              </div>
            </div>

            <ProjectTable projects={projects} />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <FlaskConical size={10} /> Sample data
    </span>
  );
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
      <div className={`text-sm font-medium ${color}`}>{label}</div>
      <div className="mt-1 text-3xl font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function FilterSelect({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}:</label>
      <Select
        value="all"
        onChange={() => {}}
        size={compact ? "sm" : "md"}
        options={[{ value: "all", label: "All" }]}
      />
    </div>
  );
}
