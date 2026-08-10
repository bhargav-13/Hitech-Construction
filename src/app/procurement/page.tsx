"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FileText,
  IndianRupee,
  PackageCheck,
  Receipt,
  Scale,
  Send,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { ProcurementShell } from "@/components/procurement/ProcurementShell";
import { useProcurementStore } from "@/lib/procurementStore";
import { PO_STATUS_CLS } from "@/lib/procurementConfig";
import { formatRupee } from "@/lib/projectHelpers";

export default function ProcurementDashboard() {
  const indents = useProcurementStore((s) => s.indents);
  const rfqs = useProcurementStore((s) => s.rfqs);
  const pos = useProcurementStore((s) => s.pos);
  const grns = useProcurementStore((s) => s.grns);

  const m = useMemo(() => {
    const openIndents = indents.filter((i) => i.status === "Open").length;
    const activeRfqs = rfqs.filter((r) => r.status === "Sent" || r.status === "Responses In").length;
    const pendingPos = pos.filter((p) => p.approval === "Pending");
    const committed = pos.filter((p) => p.approval === "Approved").reduce((s, p) => s + p.amount, 0);
    const pendingValue = pendingPos.reduce((s, p) => s + p.amount, 0);
    // Value received = Σ (received qty × rate) across all PO lines.
    const receivedValue = pos.reduce(
      (s, p) => s + p.lines.reduce((ls, l) => ls + l.received * l.rate, 0),
      0,
    );
    const toBill = grns.filter((g) => g.status !== "Billed").length;
    return { openIndents, activeRfqs, pendingPos, committed, pendingValue, receivedValue, toBill };
  }, [indents, rfqs, pos, grns]);

  // The buying chain as a funnel — how many items sit at each stage.
  const funnel = useMemo(
    () => [
      { label: "Indents", count: indents.length, href: "/procurement/indents", tint: "bg-amber-400" },
      { label: "RFQs", count: rfqs.length, href: "/procurement/rfq", tint: "bg-blue-400" },
      { label: "Purchase Orders", count: pos.length, href: "/procurement/orders", tint: "bg-cyan-400" },
      { label: "Goods Received", count: grns.length, href: "/procurement/receipts", tint: "bg-violet-400" },
      { label: "Billed", count: grns.filter((g) => g.status === "Billed").length, href: "/procurement/receipts", tint: "bg-emerald-400" },
    ],
    [indents, rfqs, pos, grns],
  );

  const partial = pos.filter((p) => p.status === "Partially Received");

  return (
    <ProcurementShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">Procurement Dashboard</h1>
          <p className="text-sm text-gray-500">
            The buying chain across every site — from a request at the site to a bill in Vyapar.
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Open indents" value={m.openIndents} hint="Requests awaiting sourcing" accent="amber" icon={ClipboardList} href="/procurement/indents" />
          <StatCard label="Active RFQs" value={m.activeRfqs} hint="Out with vendors" accent="cyan" icon={Send} href="/procurement/rfq" />
          <StatCard
            label="Pending approval"
            value={m.pendingPos.length}
            hint={m.pendingValue ? `${formatRupee(m.pendingValue)} to commit` : "Nothing waiting"}
            accent={m.pendingPos.length ? "rose" : "gray"}
            icon={ShieldAlert}
            href="/procurement/orders"
          />
          <StatCard label="Committed (approved POs)" value={formatRupee(m.committed)} hint="Ordered, not yet billed" accent="green" icon={IndianRupee} href="/procurement/orders" />
        </div>

        {/* Funnel + pending approvals */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="The chain" subtitle="Where everything sits, stage by stage.">
            <div className="space-y-1.5">
              {funnel.map((f) => {
                const max = Math.max(1, ...funnel.map((x) => x.count));
                const pct = Math.round((f.count / max) * 100);
                return (
                  <Link key={f.label} href={f.href} className="flex items-center gap-3 rounded-md py-0.5 hover:bg-gray-50">
                    <div className="w-32 shrink-0 truncate text-[13px] text-gray-600">{f.label}</div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                      <div className={`h-full ${f.tint} opacity-80 transition-all duration-300`} style={{ width: `${Math.max(pct, f.count ? 4 : 0)}%` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-gray-700">{f.count}</span>
                    </div>
                    <ArrowRight size={13} className="shrink-0 text-gray-300" />
                  </Link>
                );
              })}
            </div>
          </Panel>

          <Panel title="Awaiting your approval" subtitle="Purchase orders holding up delivery until signed off." icon={ShieldAlert} accent={m.pendingPos.length ? "rose" : undefined}>
            {m.pendingPos.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing pending — every order is approved.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {m.pendingPos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href="/procurement/orders" className="min-w-0 flex-1 hover:text-brand-accent">
                      <div className="truncate text-sm text-gray-700">
                        <span className="font-medium text-cyan-600">{p.number}</span> · {p.vendor}
                      </div>
                      <div className="truncate text-[11px] text-gray-400">{p.project}</div>
                    </Link>
                    <span className="shrink-0 text-sm font-semibold text-gray-800">{formatRupee(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Received value + to-bill + partial deliveries */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Goods received" subtitle="Value physically received against orders, and what's ready to bill.">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Received value" value={formatRupee(m.receivedValue)} icon={PackageCheck} tint="bg-emerald-50 text-emerald-600" />
              <MiniStat label="Ready to bill" value={String(m.toBill)} icon={Receipt} tint="bg-cyan-50 text-brand-accent" />
            </div>
            <Link href="/procurement/receipts" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              Open goods receipts <ArrowRight size={12} />
            </Link>
          </Panel>

          <Panel title="Part-delivered orders" subtitle="Received some, still waiting on the rest." icon={Truck}>
            {partial.length === 0 ? (
              <p className="text-sm text-gray-400">No open partial deliveries.</p>
            ) : (
              <ul className="space-y-2.5">
                {partial.map((p) => {
                  const ordered = p.lines.reduce((s, l) => s + l.qty, 0);
                  const received = p.lines.reduce((s, l) => s + l.received, 0);
                  const pct = ordered ? Math.round((received / ordered) * 100) : 0;
                  return (
                    <li key={p.id}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-gray-700">
                          <span className="font-medium text-cyan-600">{p.number}</span> · {p.vendor}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-500">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-violet-400" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Recent POs */}
        <Panel title="Recent purchase orders" subtitle="Latest orders across all sites." icon={FileText}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="py-2 pr-2 font-medium">PO #</th>
                  <th className="py-2 px-2 font-medium">Vendor</th>
                  <th className="py-2 px-2 font-medium">Project</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 pl-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-cyan-600">{p.number}</div>
                      <div className="text-[11px] text-gray-400">{p.date}</div>
                    </td>
                    <td className="py-2 px-2 text-gray-700">{p.vendor}</td>
                    <td className="max-w-[200px] truncate py-2 px-2 text-gray-600">{p.project}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PO_STATUS_CLS[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums text-gray-800">{formatRupee(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/procurement/orders" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
            All purchase orders <ArrowRight size={12} />
          </Link>
        </Panel>

        <p className="flex items-center gap-1.5 pt-1 text-xs text-gray-400">
          <Scale size={13} />
          Demo module — data is seeded. Vendors map to Vyapar parties, items to the shared catalogue, and an approved
          receipt becomes a Vyapar Purchase Bill.
        </p>
      </div>
    </ProcurementShell>
  );
}

/* ---------- presentational pieces ---------- */

function Panel({
  title,
  subtitle,
  children,
  icon: Icon,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: "rose";
}) {
  return (
    <section className={`rounded-xl border bg-white p-4 ${accent === "rose" ? "border-rose-200" : "border-gray-200"}`}>
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          {Icon && <Icon size={14} className="text-gray-400" />}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  accent: "gray" | "green" | "amber" | "cyan" | "rose";
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
  href: string;
}) {
  const tone: Record<string, string> = {
    gray: "text-gray-800",
    green: "text-emerald-600",
    amber: "text-amber-600",
    cyan: "text-brand-accent",
    rose: "text-rose-600",
  };
  const bg: Record<string, string> = {
    gray: "bg-gray-100 text-gray-500",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    cyan: "bg-cyan-50 text-brand-accent",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-brand-accent/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">{label}</div>
          <div className={`mt-1 text-2xl font-semibold ${tone[accent]}`}>{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg[accent]}`}>
          <Icon size={17} />
        </div>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, icon: Icon, tint }: { label: string; value: string; icon: React.ComponentType<{ size?: number }>; tint: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-500">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-gray-800">{value}</div>
        </div>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tint}`}>
          <Icon size={14} />
        </div>
      </div>
    </div>
  );
}
