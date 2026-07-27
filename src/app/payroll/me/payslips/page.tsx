"use client";

import { useMemo } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { usePayrollStore, useMyEmployee, daysInMonth, computePayslip } from "@/lib/payrollApi";
import type { Employee } from "@/lib/payrollApi";
import { inr } from "@/lib/format";
import { downloadPdf } from "@/lib/vyaparExport";
import { Download, UserRound, Wallet } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** My Payslips — the signed-in employee's own month-by-month pay, with a downloadable slip each. */
export default function MyPayslipsPage() {
  const me = useMyEmployee();
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const loans = usePayrollStore((s) => s.loans);

  const rows = useMemo(() => {
    if (!me) return [];
    const out: { label: string; year: number; month: number; slip: ReturnType<typeof computePayslip> }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dates = daysInMonth(d.getFullYear(), d.getMonth());
      out.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth(), slip: computePayslip(me, overrides, loans, dates) });
    }
    return out;
  }, [me, overrides, loans]);

  if (!me) {
    return <PayrollShell><PayrollEmpty icon={UserRound} title="Your staff profile isn't linked yet" hint="Ask HR to add you as a staff member so your payslips show here." /></PayrollShell>;
  }

  function slipPdf(label: string, slip: ReturnType<typeof computePayslip>, emp: Employee) {
    downloadPdf(
      `Payslip ${label} — ${emp.name}`,
      ["Component", "Amount"],
      [
        ["Employee", emp.name],
        ["Staff ID", emp.staffId],
        ["Designation", `${emp.designation} · ${emp.department}`],
        ["Payable Days", `${slip.payableDays} / ${slip.totalDays}`],
        ["Gross Earnings", inr(slip.gross)],
        ["PF", `- ${inr(slip.pf)}`],
        ["ESIC", `- ${inr(slip.esic)}`],
        ["Professional Tax", `- ${inr(slip.pt)}`],
        ["Loan EMI", `- ${inr(slip.loanEmi)}`],
        ["Net Pay", inr(slip.net)],
      ],
      { subtitle: `${emp.staffId} · ${label}`, rightAlignFrom: 1 }
    );
  }

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">My Payslips</h2>
          <p className="mt-0.5 text-sm text-gray-500">Your monthly pay. Download any slip as a PDF.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.label} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{r.label}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{i === 0 ? "Current cycle (estimate)" : "Issued"}</div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Wallet size={16} /></div>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[11px] tracking-wide text-gray-400 uppercase">Net Pay</div>
                  <div className="text-xl font-semibold text-gray-900">{inr(r.slip.net)}</div>
                </div>
                <button onClick={() => slipPdf(r.label, r.slip, me)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent">
                  <Download size={13} /> PDF
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
                <span>Gross {inr(r.slip.gross)}</span>
                <span>Ded {inr(r.slip.pf + r.slip.esic + r.slip.pt + r.slip.loanEmi)}</span>
                <span>{r.slip.payableDays}/{r.slip.totalDays} days</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PayrollShell>
  );
}
