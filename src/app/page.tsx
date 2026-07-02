"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BubbleCluster } from "@/components/BubbleCluster";
import { ProjectTable } from "@/components/ProjectTable";
import { useAppStore } from "@/lib/store";
import { formatLakh } from "@/lib/format";
import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  Maximize2,
  MoreVertical,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

export default function DashboardPage() {
  const projects = useAppStore((s) => s.projects);
  const attendance = useAppStore((s) => s.attendance);
  const materials = useAppStore((s) => s.materials);
  const financials = useAppStore((s) => s.financials);
  const [tab, setTab] = useState<"Operational" | "Financial">("Operational");

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

  const marginData = financials.map((f) => ({ month: f.month, margin: -f.expense }));
  const totalExpense = financials.reduce((sum, f) => sum + f.expense, 0);

  return (
    <AppShell title="Dashboard">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Company Dashboard</h2>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} />
          </button>
          <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50">
            <Upload size={16} />
          </button>
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
            <div className="grid grid-cols-2 gap-4">
              <FilterSelect label="Project Name" />
              <div>
                <label className="mb-1 block text-xs text-gray-500">Txn Date:</label>
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700">
                  <Calendar size={14} className="text-gray-400" />
                  01 Jan 2026 to 31 Jul 2026
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Sales</h3>
                  <div className="flex items-center gap-2 text-gray-400">
                    <ArrowUpDown size={13} />
                    <BarChart3 size={13} />
                    <Maximize2 size={13} />
                    <MoreVertical size={13} />
                  </div>
                </div>
                <div className="flex h-40 items-center justify-center">
                  <span className="text-sm font-semibold text-red-500">No Data Available</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Expense</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={financials}>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={40} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (v === 0 ? "0" : formatLakh(v))}
                      />
                      <Tooltip formatter={(v) => formatLakh(Number(v))} />
                      <Bar dataKey="expense" fill="#d6478a" radius={[3, 3, 0, 0]}>
                        <Cell />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Margin</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={marginData}>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={40} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (v === 0 ? "0" : formatLakh(v))}
                      />
                      <Tooltip formatter={(v) => formatLakh(Number(v))} />
                      <Bar dataKey="margin" fill="#d6478a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-green-50 p-4 text-center">
                <div className="text-sm font-medium text-green-600">Total Sales</div>
                <div className="mt-1 text-xl font-semibold text-gray-800">-</div>
              </div>
              <div className="rounded-xl bg-pink-50 p-4 text-center">
                <div className="text-sm font-medium text-pink-600">Total Expense</div>
                <div className="mt-1 text-xl font-semibold text-pink-600">
                  {formatLakh(totalExpense)}
                </div>
              </div>
              <div className="rounded-xl bg-gray-100 p-4 text-center">
                <div className="text-sm font-medium text-gray-500">Total Margin</div>
                <div className="mt-1 text-xl font-semibold text-gray-800">
                  {formatLakh(-totalExpense)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Payments</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" className="accent-gray-400" />
                      Payment Type
                    </label>
                    <label className="flex items-center gap-1 text-green-600">
                      <input type="checkbox" defaultChecked className="accent-green-600" />
                      Payment In
                    </label>
                    <label className="flex items-center gap-1 text-pink-600">
                      <input type="checkbox" defaultChecked className="accent-pink-600" />
                      Payment Out
                    </label>
                  </div>
                </div>
                <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                  No payment data for the selected period.
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Expense Type</h3>
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-300">
                  <BarChart3 size={28} />
                  <span className="text-xs text-gray-400">No data available</span>
                </div>
              </div>
            </div>
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
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  Last 7 Days Attendance
                </h3>
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
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  Last 7 Days Material Received
                </h3>
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
      <select
        className={`w-full rounded-md border border-gray-300 bg-white text-gray-700 ${
          compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        <option>All</option>
      </select>
    </div>
  );
}
