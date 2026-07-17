"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useAppStore } from "@/lib/store";
import { formatLakh } from "@/lib/format";
import {
  Area,
  AreaChart,
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
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  Download,
  IndianRupee,
  Landmark,
  PackageCheck,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

/* ---------- palette ---------- */
const BRAND = "#0891b2";
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#94a3b8",
  Ongoing: "#0891b2",
  Onhold: "#f59e0b",
  Completed: "#059669",
};
const HEALTH_COLORS: Record<string, string> = {
  Healthy: "#0891b2",
  "At Risk": "#f43f5e",
};

export default function DashboardV2Page() {
  const projects = useAppStore((s) => s.projects);
  const attendance = useAppStore((s) => s.attendance);
  const financials = useAppStore((s) => s.financials);
  const parties = useAppStore((s) => s.parties);
  const accounts = useAppStore((s) => s.accounts);
  const todos = useAppStore((s) => s.todos);
  const materialRequests = useAppStore((s) => s.materialRequests);
  const warehouseItems = useAppStore((s) => s.warehouseItems);
  const stockMovements = useAppStore((s) => s.stockMovements);
  const warehouses = useAppStore((s) => s.warehouses);

  /* ---------- derived metrics ---------- */
  const statusCounts = useMemo(() => {
    const base = { "Not Started": 0, Ongoing: 0, Onhold: 0, Completed: 0 };
    for (const p of projects) base[p.status] += 1;
    return base;
  }, [projects]);

  const healthCounts = useMemo(() => {
    const base = { Healthy: 0, "At Risk": 0 };
    for (const p of projects) base[p.health] += 1;
    return base;
  }, [projects]);

  const totalProjects = projects.length;
  const atRiskPct = totalProjects
    ? Math.round((healthCounts["At Risk"] / totalProjects) * 100)
    : 0;

  const cashPosition = accounts.reduce((s, a) => s + a.balance, 0);
  const receivables = parties.reduce((s, p) => s + p.toReceive, 0);
  const payables = parties.reduce((s, p) => s + p.toPay, 0);

  const openTodos = todos.filter((t) => t.status !== "Done");
  const pendingRequests = materialRequests.filter((r) => r.status === "Pending");

  // current stock per warehouse item from opening + movements → reorder alerts
  const lowStock = useMemo(() => {
    return warehouseItems
      .map((it) => {
        const moved = stockMovements
          .filter((m) => m.itemId === it.id)
          .reduce((sum, m) => {
            if (m.type === "Received" || m.type === "Returned") return sum + m.quantity;
            if (m.type === "Issued") return sum - m.quantity;
            return sum;
          }, 0);
        return { ...it, current: it.openingStock + moved };
      })
      .filter((it) => it.current <= it.reorderLevel)
      .sort((a, b) => a.current - a.reorderLevel - (b.current - b.reorderLevel));
  }, [warehouseItems, stockMovements]);

  const expenseTrend = financials.map((f) => ({ month: f.month.replace(" 2026", ""), expense: f.expense }));
  const healthData = [
    { name: "Healthy", value: healthCounts.Healthy },
    { name: "At Risk", value: healthCounts["At Risk"] },
  ];

  const topReceivables = [...parties].filter((p) => p.toReceive > 0).sort((a, b) => b.toReceive - a.toReceive).slice(0, 4);
  const topPayables = [...parties].filter((p) => p.toPay > 0).sort((a, b) => b.toPay - a.toPay).slice(0, 4);

  const recentProjects = projects.filter((p) => p.status === "Ongoing").slice(0, 6);
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";

  return (
    <AppShell title="Dashboard">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-800">Company Overview</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Live snapshot across projects, cash flow, workforce and stores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <CalendarDays size={14} className="text-slate-400" />
            01 Jan – 31 Jul 2026
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-medium text-white shadow-sm hover:opacity-90">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Building2 size={18} />}
          tint="bg-cyan-50 text-cyan-600"
          label="Active Projects"
          value={String(statusCounts.Ongoing)}
          sub={`${totalProjects} total · ${statusCounts.Completed} completed`}
        />
        <StatCard
          icon={<Wallet size={18} />}
          tint="bg-indigo-50 text-indigo-600"
          label="Cash & Bank"
          value={`₹${formatLakh(cashPosition)}`}
          sub={`${accounts.length} accounts`}
        />
        <StatCard
          icon={<ArrowDownRight size={18} />}
          tint="bg-emerald-50 text-emerald-600"
          label="Receivables"
          value={`₹${formatLakh(receivables)}`}
          sub="Money to collect"
          trend="in"
        />
        <StatCard
          icon={<ArrowUpRight size={18} />}
          tint="bg-rose-50 text-rose-600"
          label="Payables"
          value={`₹${formatLakh(payables)}`}
          sub="Money to pay"
          trend="out"
        />
      </div>

      {/* alert strip */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat icon={<AlertTriangle size={15} />} tint="text-rose-600" label="At-Risk Projects" value={`${healthCounts["At Risk"]} (${atRiskPct}%)`} />
        <MiniStat icon={<ClipboardList size={15} />} tint="text-amber-600" label="Open Tasks" value={String(openTodos.length)} />
        <MiniStat icon={<PackageCheck size={15} />} tint="text-indigo-600" label="Pending Requests" value={String(pendingRequests.length)} />
        <MiniStat icon={<Boxes size={15} />} tint="text-rose-600" label="Reorder Alerts" value={String(lowStock.length)} />
      </div>

      {/* charts row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* expense trend */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Monthly Expenditure"
            right={<span className="flex items-center gap-1 text-xs font-medium text-slate-500"><TrendingUp size={13} /> Last 5 months</span>}
          />
          <div className="h-64 px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseTrend} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f1" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v === 0 ? "0" : formatLakh(v))} width={48} />
                <Tooltip
                  formatter={(v) => [`₹${formatLakh(Number(v))}`, "Expense"]}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="expense" stroke={BRAND} strokeWidth={2.5} fill="url(#exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* health donut */}
        <Card>
          <CardHeader title="Project Health" />
          <div className="flex flex-col items-center px-4 pb-5">
            <div className="relative h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
                    {healthData.map((d) => (
                      <Cell key={d.name} fill={HEALTH_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} projects`, n as string]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-slate-800">{totalProjects}</span>
                <span className="text-xs text-slate-400">Projects</span>
              </div>
            </div>
            <div className="mt-2 flex w-full justify-center gap-6">
              {healthData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLORS[d.name] }} />
                  <span className="text-sm text-slate-600">{d.name}</span>
                  <span className="text-sm font-semibold text-slate-800">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* attendance + status split */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Workforce — Last 7 Days"
            right={<span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Users size={13} /> Daily headcount</span>}
          />
          <div className="h-56 px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendance} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f1" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(d) => String(d).slice(0, 6)} />
                <YAxis domain={[0, 25]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [`${v} workers`, "Present"]} />
                <Bar dataKey="workers" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Project Status" />
          <div className="space-y-3 px-4 pb-5 pt-1">
            {(Object.keys(statusCounts) as (keyof typeof statusCounts)[]).map((k) => {
              const pct = totalProjects ? (statusCounts[k] / totalProjects) * 100 : 0;
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-semibold text-slate-800">{statusCounts[k]}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_COLORS[k] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* receivables / payables / requests */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Top Receivables" right={<IndianRupee size={14} className="text-emerald-500" />} />
          <LedgerList rows={topReceivables.map((p) => ({ name: p.name, amount: p.toReceive }))} tone="in" empty="No pending receivables" />
        </Card>
        <Card>
          <CardHeader title="Top Payables" right={<IndianRupee size={14} className="text-rose-500" />} />
          <LedgerList rows={topPayables.map((p) => ({ name: p.name, amount: p.toPay }))} tone="out" empty="No pending payables" />
        </Card>
        <Card>
          <CardHeader
            title="Reorder Alerts"
            right={<Link href="/warehouse" className="text-xs font-medium text-brand-accent hover:underline">View store</Link>}
          />
          <div className="divide-y divide-slate-100 px-4 pb-2">
            {lowStock.length === 0 && <div className="py-6 text-center text-sm text-slate-400">All stock above reorder level</div>}
            {lowStock.slice(0, 4).map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700">{it.name}</div>
                  <div className="text-xs text-slate-400">{whName(it.warehouseId)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-rose-600">{it.current} {it.unit}</div>
                  <div className="text-xs text-slate-400">min {it.reorderLevel}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* bank accounts + pending requests */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Ongoing Projects" right={<Link href="/project" className="text-xs font-medium text-brand-accent hover:underline">All projects</Link>} />
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/project/${p.id}`} className="font-medium text-slate-700 hover:text-brand-accent">{p.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{p.stage || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: `${HEALTH_COLORS[p.health]}18`, color: HEALTH_COLORS[p.health] }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH_COLORS[p.health] }} />
                        {p.health}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bank & Cash" right={<Landmark size={14} className="text-indigo-500" />} />
          <div className="space-y-2 px-4 pb-4 pt-1">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.type === "Cash" ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"}`}>
                    {a.type === "Cash" ? <Wallet size={15} /> : <Landmark size={15} />}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{a.name}</div>
                    {a.isPrimary && <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-accent">Primary</div>}
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-800">₹{formatLakh(a.balance)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

/* ---------- building blocks ---------- */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {right}
    </div>
  );
}

function StatCard({
  icon,
  tint,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  sub: string;
  trend?: "in" | "out";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend === "in" ? "text-emerald-600" : "text-rose-500"}`}>
            {trend === "in" ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-800">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function MiniStat({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className={tint}>{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-none text-slate-800">{value}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function LedgerList({ rows, tone, empty }: { rows: { name: string; amount: number }[]; tone: "in" | "out"; empty: string }) {
  return (
    <div className="divide-y divide-slate-100 px-4 pb-2">
      {rows.length === 0 && <div className="py-6 text-center text-sm text-slate-400">{empty}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between py-2.5">
          <span className="min-w-0 truncate pr-3 text-sm text-slate-600">{r.name}</span>
          <span className={`text-sm font-semibold ${tone === "in" ? "text-emerald-600" : "text-rose-600"}`}>₹{formatLakh(r.amount)}</span>
        </div>
      ))}
    </div>
  );
}
