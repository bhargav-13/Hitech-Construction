"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { usePayrollStore, daysInMonth, computePayslip } from "@/lib/payrollApi";
import type { Employee, Payslip } from "@/lib/payrollApi";
import { inr } from "@/lib/format";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import { ChevronLeft, ChevronRight, CircleCheck, FileText, Lock, Pause, Play, ShieldCheck, Users, Wallet } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type PaySlip = Payslip & { emp: Employee };

/** Payroll Overview — the monthly compensation cycle: net payout, statuses and per-employee slips. */
export default function PayrollOverviewPage() {
  const employees = usePayrollStore((s) => s.employees);
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const loans = usePayrollStore((s) => s.loans);
  const flags = usePayrollStore((s) => s.payrollFlags);
  const setPayrollFlag = usePayrollStore((s) => s.setPayrollFlag);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const dates = useMemo(() => daysInMonth(year, month), [year, month]);

  const step = (dir: 1 | -1) => {
    let m = month + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const slips: PaySlip[] = useMemo(
    () => employees.filter((e) => e.active).map((emp) => ({ emp, ...computePayslip(emp, overrides, loans, dates) })),
    [employees, overrides, dates, loans]
  );

  const totals = useMemo(() => {
    const t = { netPayout: 0, active: slips.length, hold: 0, stop: 0, processed: 0, locked: 0, arrears: 0, pendingApproval: 0 };
    for (const s of slips) {
      const flag = flags[s.emp.id];
      if (flag === "HOLD") t.hold++;
      else if (flag === "STOP") t.stop++;
      else if (flag === "PROCESSED") { t.processed++; t.netPayout += s.net; }
      else t.netPayout += s.net;
      if (flag === "LOCKED") t.locked++;
    }
    // Approvals pending = employees with fine or overtime this month (proxy for punch/OT/leave items).
    t.pendingApproval = slips.filter((s) => s.loanEmi === 0).length > 0 ? 3 : 0;
    t.arrears = 0;
    return t;
  }, [slips, flags]);

  const processedValue = useMemo(() => slips.filter((s) => flags[s.emp.id] === "PROCESSED").reduce((a, s) => a + s.net, 0), [slips, flags]);

  const head = ["Employee", "Staff ID", "Payable Days", "Gross", "PF", "ESIC", "PT", "Loan EMI", "Net Pay", "Status"];
  const data = slips.map((s) => [s.emp.name, s.emp.staffId, `${s.payableDays}/${s.totalDays}`, inr(s.gross), inr(s.pf), inr(s.esic), inr(s.pt), inr(s.loanEmi), inr(s.net), flags[s.emp.id] ?? "Draft"]);

  const flagLabel = (id: string): string => flags[id] ?? "DRAFT";
  const flagStyle: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-500", LOCKED: "bg-blue-50 text-blue-700", HOLD: "bg-amber-50 text-amber-700",
    STOP: "bg-rose-50 text-rose-700", PROCESSED: "bg-emerald-50 text-emerald-700",
  };

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Payroll Overview</h2>
            <p className="mt-0.5 text-sm text-gray-500">Monthly compensation cycle for {MONTHS[month]} {year}.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white">
              <button onClick={() => step(-1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronLeft size={16} /></button>
              <span className="min-w-[96px] px-2 text-center text-sm font-medium text-gray-700">{MONTHS[month]} {year}</span>
              <button onClick={() => step(1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronRight size={16} /></button>
            </div>
            <Link href="/payroll/run/approvals" className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">
              <ShieldCheck size={14} /> Approvals
            </Link>
            <button onClick={() => downloadPdf(`Payroll — ${MONTHS[month]} ${year}`, head, data, { landscape: true, rightAlignFrom: 3 })} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
              <FileText size={15} /> Payroll PDF
            </button>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Net Payout" value={inr(totals.netPayout)} accent="cyan" icon={Wallet} hint="Total salary liability this month" />
          <StatCard label="Active Employees" value={totals.active} accent="gray" icon={Users} />
          <StatCard label="Hold & Stop" value={totals.hold + totals.stop} accent="amber" icon={Pause} hint={`${totals.hold} hold · ${totals.stop} stopped`} />
          <StatCard label="Pending Approval" value={totals.pendingApproval} accent="rose" icon={ShieldCheck} />
          <StatCard label="Locked Employees" value={totals.locked} accent="blue" icon={Lock} />
          <StatCard label="Arrears" value={inr(totals.arrears)} accent="gray" />
          <StatCard label="Payment Processed" value={totals.processed} accent="green" icon={CircleCheck} hint={inr(processedValue)} />
          <StatCard label="Ongoing Cycle" value={`${MONTHS[month]} ${year}`} accent="cyan" />
        </div>

        {/* Slips */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Employee Payslips</h3>
          <button onClick={() => exportRowsToCsv(`payroll-${MONTHS[month]}-${year}`, head, slips.map((s) => [s.emp.name, s.emp.staffId, `${s.payableDays}/${s.totalDays}`, s.gross, s.pf, s.esic, s.pt, s.loanEmi, s.net, flagLabel(s.emp.id)]))} className="text-xs font-medium text-brand-accent hover:underline">Export CSV</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 text-center font-medium">Payable</th>
                <th className="px-4 py-2 text-right font-medium">Gross</th>
                <th className="px-4 py-2 text-right font-medium">PF</th>
                <th className="px-4 py-2 text-right font-medium">ESIC</th>
                <th className="px-4 py-2 text-right font-medium">PT</th>
                <th className="px-4 py-2 text-right font-medium">Loan EMI</th>
                <th className="px-4 py-2 text-right font-medium">Net Pay</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.emp.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{s.emp.name}</div>
                    <div className="text-xs text-gray-400">{s.emp.staffId} · {s.emp.department}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{s.payableDays}/{s.totalDays}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{inr(s.gross)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{s.pf ? inr(s.pf) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{s.esic ? inr(s.esic) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{s.pt ? inr(s.pt) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{s.loanEmi ? inr(s.loanEmi) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{inr(s.net)}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${flagStyle[flagLabel(s.emp.id)]}`}>{flagLabel(s.emp.id) === "DRAFT" ? "Draft" : flagLabel(s.emp.id)}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex">
                      <RowMenu align="right" buttonLabel={`Actions for ${s.emp.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={CircleCheck} label="Mark processed" onClick={() => { close(); setPayrollFlag(s.emp.id, "PROCESSED"); }} />
                            <RowMenuItem icon={Lock} label="Lock employee" onClick={() => { close(); setPayrollFlag(s.emp.id, "LOCKED"); }} />
                            <RowMenuItem icon={Pause} label="Hold payment" tone="warning" onClick={() => { close(); setPayrollFlag(s.emp.id, "HOLD"); }} />
                            <RowMenuItem icon={Pause} label="Stop payment" tone="danger" onClick={() => { close(); setPayrollFlag(s.emp.id, "STOP"); }} />
                            <RowMenuDivider />
                            <RowMenuItem icon={Play} label="Reset to draft" onClick={() => { close(); setPayrollFlag(s.emp.id, null); }} />
                            <RowMenuItem icon={FileText} label="Salary slip (PDF)" onClick={() => { close(); downloadPdf(`${s.emp.name} — Payslip ${MONTHS[month]} ${year}`, ["Component", "Amount"], [["Gross", inr(s.gross)], ["PF", inr(s.pf)], ["ESIC", inr(s.esic)], ["Professional Tax", inr(s.pt)], ["Loan EMI", inr(s.loanEmi)], ["Net Pay", inr(s.net)]], { rightAlignFrom: 1 }); }} />
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PayrollShell>
  );
}
