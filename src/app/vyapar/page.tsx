"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { inr, inrAxis } from "@/lib/format";
import { useAuthStore } from "@/lib/authStore";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { DashboardSummary } from "@/lib/vyaparApi";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Wallet,
} from "lucide-react";

/** Quick links mirroring Vyapar's "Most Used Reports" strip. */
const QUICK_REPORTS = [
  { label: "Sale Report", href: "/vyapar/reports?r=sale" },
  { label: "All Transactions", href: "/vyapar/reports?r=transactions" },
  { label: "Daybook Report", href: "/vyapar/reports?r=daybook" },
  { label: "Party Statement", href: "/vyapar/reports?r=party" },
];

export default function VyaparHomePage() {
  const perms = useAuthStore((s) => s.user?.permissions) ?? [];
  const canView = perms.includes("VYAPAR:VIEW");

  const [data, setData] = useState<DashboardSummary | null>(null);
  // Cash in hand comes from the cash ledger itself, so this card always agrees with the
  // Cash In Hand screen. (The dashboard summary's own figure nets every payment regardless of
  // whether it was cash or bank, which is a different number entirely.)
  const [cashInHand, setCashInHand] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, cashTxns] = await Promise.all([
        vyapar.getDashboard(bankAccountId),
        vyapar.getCashTxns().catch(() => []),
      ]);
      setData(summary);
      setCashInHand(cashTxns.reduce((s, t) => s + (t.direction === "in" ? t.amount : -t.amount), 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the Vyapar dashboard.");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  if (!canView) {
    return (
      <VyaparShell>
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <ShieldAlert size={26} />
          </div>
          <div className="text-base font-semibold text-gray-700">No access to Vyapar</div>
          <p className="mt-1 max-w-xs text-sm text-gray-400">
            You need the <span className="font-medium">Vyapar</span> permission. Ask an administrator to grant it.
          </p>
        </div>
      </VyaparShell>
    );
  }

  const trend = (data?.salesTrend ?? []).map((p) => ({
    day: Number(p.label.slice(8, 10)),
    label: `${p.label.slice(8, 10)} ${monthShort(p.label)}`,
    value: p.value,
  }));
  // The trend is this month only, so the headline above it must be this month's total — not the
  // all-time figure, which is shown separately in the Total Sale KPI.
  const saleThisMonth = trend.reduce((s, p) => s + p.value, 0);

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Business Overview</h2>
            <p className="mt-0.5 text-sm text-gray-500">Receivables, payables and this month&apos;s sales.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <Link
              href="/vyapar/sale?new=1"
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
            >
              <Plus size={15} /> Add Sale
            </Link>
            <Link
              href="/vyapar/purchase?new=1"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Plus size={15} /> Add Purchase
            </Link>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading && !data ? (
          <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <>
            {/* Receivable / Payable — the two headline cards from Vyapar's home */}
            <div className="grid gap-4 md:grid-cols-2">
              <BalanceCard
                label="Total Receivable"
                value={data?.totalReceivable ?? 0}
                sub={`From ${data?.receivableParties ?? 0} Parties`}
                tone="in"
                href="/vyapar/parties?filter=receivable"
              />
              <BalanceCard
                label="Total Payable"
                value={data?.totalPayable ?? 0}
                sub={`From ${data?.payableParties ?? 0} Parties`}
                tone="out"
                href="/vyapar/parties?filter=payable"
              />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MiniKpi label="Total Sale" value={inr(data?.totalSale ?? 0)} sub="All time" icon={FileText} tint="bg-cyan-50 text-brand-accent" href="/vyapar/sale" />
              <MiniKpi label="Total Purchase" value={inr(data?.totalPurchase ?? 0)} sub="All time" icon={Boxes} tint="bg-indigo-50 text-indigo-600" href="/vyapar/purchase" />
              <MiniKpi label="Cash in Hand" value={inr(cashInHand)} icon={Wallet} tint="bg-emerald-50 text-emerald-600" href="/vyapar/cash" />
              <MiniKpi
                label="Stock Value"
                value={inr(data?.stockValue ?? 0)}
                icon={data?.lowStockCount ? TriangleAlert : Boxes}
                tint={data?.lowStockCount ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}
                sub={data?.lowStockCount ? `${data.lowStockCount} low on stock` : `${data?.stockItems ?? 0} items`}
                href="/vyapar/items"
              />
            </div>

            {/* Sales trend */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Sales This Month</h3>
                  <div className="mt-0.5 text-2xl font-semibold text-gray-800">{inr(saleThisMonth)}</div>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                  This Month
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vyaparSale" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0891b2" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#f1f1ef" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(v) => (v === 0 ? "0" : inrAxis(Number(v)))}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #eee", fontSize: 12 }}
                      formatter={(v) => [inr(Number(v)), "Sale"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} fill="url(#vyaparSale)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Most used reports */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Most Used Reports</h3>
                <Link href="/vyapar/reports" className="text-xs font-medium text-brand-accent hover:underline">
                  View All
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {QUICK_REPORTS.map((r) => (
                  <Link
                    key={r.label}
                    href={r.href}
                    className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:text-brand-accent hover:shadow-sm"
                  >
                    {r.label}
                    <ChevronRight size={15} />
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </VyaparShell>
  );
}

function BalanceCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "in" | "out";
  href: string;
}) {
  const Icon = tone === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <Link
      href={href}
      className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md"
    >
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1.5 text-2xl font-semibold text-gray-800">{inr(value)}</div>
        <div className="mt-2 text-xs text-gray-400">{sub}</div>
      </div>
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${
          tone === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        }`}
      >
        <Icon size={20} />
      </span>
    </Link>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
  tint,
  sub,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number }>;
  tint: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md"
    >
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="mt-1 truncate text-lg font-semibold text-gray-800">{value}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-gray-400">{sub}</div>}
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tint}`}>
        <Icon size={18} />
      </span>
    </Link>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthShort(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return MONTHS[Math.max(0, Math.min(11, m - 1))];
}
