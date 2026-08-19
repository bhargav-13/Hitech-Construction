"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Hammer, Plus, Search } from "lucide-react";
import { ProcurementShell, ProcurementEmpty, ProcurementHeader } from "@/components/procurement/ProcurementShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { useWorkOrders } from "@/lib/useWorkOrders";
import { useProjects } from "@/lib/useProjects";
import { WORK_ORDER_STATUS_CLS } from "@/lib/procurementConfig";
import { WORK_ORDER_STATUSES } from "@/lib/workOrderApi";
import { inr } from "@/lib/format";

/**
 * Work orders — subcontracts out to labour contractors.
 *
 * The columns are the ones the client already reads on the tool they pay for: contractor, project,
 * title, progress, order value, billed value. Two are ours and earn their place:
 *
 *  - **Billed against order, drawn.** The question on a subcontract is never "what is it worth", it
 *    is "how much of it have we already paid out" — so the bar is the answer and the rupees are the
 *    detail. A contractor billed past his order turns rose, which is the one case worth a colour.
 *  - **Physical progress is weighted by value**, computed server-side. A line 90% done worth ₹4.4L
 *    counts for more than one 100% done worth ₹3,600; averaging the percentages would report an
 *    order as half finished with nearly all the money still in the ground.
 */
export default function WorkOrderListPage() {
  const { workOrders, loading, error } = useWorkOrders();
  const { projects } = useProjects();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [vendor, setVendor] = useState("all");

  const vendors = useMemo(
    () => [...new Set(workOrders.map((w) => w.vendorName))].sort((a, b) => a.localeCompare(b)),
    [workOrders],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (vendor !== "all" && w.vendorName !== vendor) return false;
      if (!q) return true;
      return [w.woNo, w.title, w.vendorName].some((f) => f?.toLowerCase().includes(q));
    });
  }, [workOrders, search, status, vendor]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, w) => ({
          value: t.value + w.orderValue,
          billed: t.billed + w.billedValue,
          retention: t.retention + w.retentionHeld,
        }),
        { value: 0, billed: 0, retention: 0 },
      ),
    [rows],
  );

  const projectName = (id: number | null) => projects.find((p) => p.id === String(id))?.name ?? "—";

  return (
    <ProcurementShell>
      <ProcurementHeader
        title="Work Orders"
        subtitle="Work given out to subcontractors — what it is worth, and how much of it has been billed."
        right={
          <Link
            href="/procurement/work-order/build"
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            <Plus size={15} /> New Work Order
          </Link>
        }
      />

      {error && <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading work orders…
        </div>
      ) : workOrders.length === 0 ? (
        <ProcurementEmpty
          icon={Hammer}
          title="No work orders yet"
          hint="Raise one when work is given to a subcontractor — plastering, fabrication, pipe laying."
          action={
            <Link
              href="/procurement/work-order/build"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
            >
              <Plus size={15} /> New Work Order
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Money across everything on screen, so the filters answer a question rather than just narrowing a list. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Order value" value={inr(totals.value)} tone="brand" />
            <Stat
              label="Billed so far"
              value={inr(totals.billed)}
              hint={totals.value > 0 ? `${Math.round((totals.billed / totals.value) * 100)}% of order value` : undefined}
              tone="emerald"
            />
            <Stat label="Retention held" value={inr(totals.retention)} hint="Money kept back on bills" tone="amber" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-400 sm:max-w-xs">
              <Search size={14} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, title or contractor"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <Select
              value={status}
              onChange={setStatus}
              size="sm"
              className="w-40"
              options={[{ value: "all", label: "All statuses" }, ...WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))]}
            />
            <Select
              value={vendor}
              onChange={setVendor}
              size="sm"
              className="w-48"
              options={[{ value: "all", label: "All contractors" }, ...vendors.map((v) => ({ value: v, label: v }))]}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Work order</th>
                  <th className="px-4 py-3">Sub contractor</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Physical progress</th>
                  <th className="px-4 py-3 text-right">Order value</th>
                  <th className="px-4 py-3">Billed</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      Nothing matches those filters.
                    </td>
                  </tr>
                )}
                {rows.map((w) => {
                  const billedPct = w.orderValue > 0 ? (w.billedValue / w.orderValue) * 100 : 0;
                  const overBilled = w.billedValue > w.orderValue && w.orderValue > 0;
                  return (
                    <tr key={w.id} className="align-top transition-colors duration-150 hover:bg-cyan-50/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/procurement/work-order/${w.id}`}
                          className="font-medium text-brand-accent transition-opacity duration-150 hover:opacity-75"
                        >
                          {w.woNo}
                        </Link>
                        <div className="text-xs text-gray-500">{w.title}</div>
                        <div className="text-[11px] text-gray-400">{w.woDate}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-800">{w.vendorName}</div>
                        {w.vendorPhone && <div className="text-[11px] text-gray-400">{w.vendorPhone}</div>}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-xs text-gray-600">{projectName(w.projectId)}</td>
                      <td className="px-4 py-3">
                        <Bar percent={w.physicalProgress} tone="sky" />
                        <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                          {w.physicalProgress.toFixed(0)}% · {inr(w.workDoneValue)} done
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-gray-800 tabular-nums">
                        {inr(w.orderValue)}
                      </td>
                      <td className="px-4 py-3">
                        <Bar percent={billedPct} tone={overBilled ? "rose" : "emerald"} />
                        <div className="mt-1 text-[11px] tabular-nums">
                          <span className={overBilled ? "font-medium text-rose-700" : "text-gray-600"}>
                            {inr(w.billedValue)}
                          </span>
                          <span className="text-gray-400">
                            {" "}
                            · {overBilled ? `${inr(-w.outstanding)} over` : `${inr(w.outstanding)} left`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            WORK_ORDER_STATUS_CLS[w.status] ?? WORK_ORDER_STATUS_CLS.Draft
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ProcurementShell>
  );
}

function Bar({ percent, tone }: { percent: number; tone: "sky" | "emerald" | "rose" }) {
  const width = Math.max(0, Math.min(100, percent));
  const fill = tone === "sky" ? "bg-sky-500" : tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "brand" | "emerald" | "amber";
}) {
  const ring =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/50" : tone === "amber" ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}
