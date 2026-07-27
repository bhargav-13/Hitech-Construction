"use client";

import { useMemo, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { usePayrollStore, daysInMonth, getAttendance } from "@/lib/payrollApi";
import { CheckCircle2, Clock, Fingerprint, Plane, TimerReset, TriangleAlert } from "lucide-react";

type ApprovalType = "PUNCH" | "OVERTIME" | "FINE" | "LEAVE";

interface Item {
  id: string;
  type: ApprovalType;
  employee: string;
  staffId: string;
  detail: string;
  date: string;
}

/** Payroll Approvals — review and approve punch adjustments, overtime, fines and leaves. */
export default function ApprovalsPage() {
  const employees = usePayrollStore((s) => s.employees);
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const now = new Date();
  const dates = useMemo(() => daysInMonth(now.getFullYear(), now.getMonth()).filter((d) => new Date(d) <= now), []);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<ApprovalType>("PUNCH");

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const emp of employees.filter((e) => e.active)) {
      for (const date of dates) {
        const a = getAttendance(overrides, emp, date);
        if (a.overtimeHours > 0) out.push({ id: `ot-${emp.id}-${date}`, type: "OVERTIME", employee: emp.name, staffId: emp.staffId, detail: `${a.overtimeHours} hrs overtime`, date });
        if (a.fineHours > 0) out.push({ id: `fn-${emp.id}-${date}`, type: "FINE", employee: emp.name, staffId: emp.staffId, detail: `${a.fineHours} hr fine (late)`, date });
        if (a.code === "PL") out.push({ id: `lv-${emp.id}-${date}`, type: "LEAVE", employee: emp.name, staffId: emp.staffId, detail: "Paid leave", date });
        if (a.code === "P" && a.inTime === "09:35") out.push({ id: `pn-${emp.id}-${date}`, type: "PUNCH", employee: emp.name, staffId: emp.staffId, detail: `Manual punch ${a.inTime}–${a.outTime}`, date });
      }
    }
    return out;
  }, [employees, overrides, dates]);

  const counts = useMemo(() => {
    const c: Record<ApprovalType, number> = { PUNCH: 0, OVERTIME: 0, FINE: 0, LEAVE: 0 };
    for (const it of items) if (!approved.has(it.id)) c[it.type]++;
    return c;
  }, [items, approved]);

  const tabItems = items.filter((it) => it.type === tab);
  const meta: Record<ApprovalType, { label: string; icon: typeof Clock; className: string }> = {
    PUNCH: { label: "Approve Punch", icon: Fingerprint, className: "text-blue-600" },
    OVERTIME: { label: "Approve Overtime", icon: TimerReset, className: "text-emerald-600" },
    FINE: { label: "Approve Fine", icon: TriangleAlert, className: "text-rose-600" },
    LEAVE: { label: "Approve Leave", icon: Plane, className: "text-amber-600" },
  };

  const approveAll = () => setApproved((prev) => new Set([...prev, ...tabItems.map((i) => i.id)]));

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Payroll Approvals</h2>
          <p className="mt-0.5 text-sm text-gray-500">Verify attendance adjustments before finalizing salaries for {now.toLocaleString("en-IN", { month: "long", year: "numeric" })}.</p>
        </div>

        {/* Approval type cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(meta) as ApprovalType[]).map((t) => {
            const M = meta[t];
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center justify-between rounded-xl border bg-white p-4 text-left transition-all duration-150 ${active ? "border-brand-accent ring-1 ring-cyan-200" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><M.icon size={15} className={M.className} /> {M.label}</div>
                  <div className="mt-1 text-xs text-gray-400">{counts[t] === 0 ? "0 pending to review" : `${counts[t]} pending`}</div>
                </div>
                {counts[t] > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">{counts[t]}</span>
                ) : (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{meta[tab].label}</h3>
          {tabItems.some((i) => !approved.has(i.id)) && (
            <button onClick={approveAll} className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95">Approve all</button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {tabItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <CheckCircle2 size={26} className="text-emerald-400" />
              Nothing to approve here.
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {tabItems.map((it) => {
                  const done = approved.has(it.id);
                  return (
                    <tr key={it.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{it.employee}</div>
                        <div className="text-xs text-gray-400">{it.staffId}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{it.detail}</td>
                      <td className="px-4 py-2.5 text-gray-500">{it.date}</td>
                      <td className="px-4 py-2.5 text-right">
                        {done ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 size={12} /> Approved</span>
                        ) : (
                          <button onClick={() => setApproved((p) => new Set([...p, it.id]))} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-brand-accent ring-1 ring-cyan-200 transition-colors hover:bg-cyan-50">Approve</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PayrollShell>
  );
}
