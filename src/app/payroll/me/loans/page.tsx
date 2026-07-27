"use client";

import { useMemo } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { usePayrollStore, useMyEmployee } from "@/lib/payrollApi";
import { inr } from "@/lib/format";
import { Landmark, UserRound } from "lucide-react";

/** My Loans — the signed-in employee's own advances, EMI and outstanding balance (read-only). */
export default function MyLoansPage() {
  const me = useMyEmployee();
  const loans = usePayrollStore((s) => s.loans);
  const mine = useMemo(() => (me ? loans.filter((l) => l.employeeId === me.id) : []), [me, loans]);

  if (!me) {
    return <PayrollShell><PayrollEmpty icon={UserRound} title="Your staff profile isn't linked yet" hint="Ask HR to add you as a staff member so your loans show here." /></PayrollShell>;
  }

  const outstanding = mine.reduce((a, l) => a + l.outstanding, 0);
  const monthlyEmi = mine.reduce((a, l) => a + (l.outstanding > 0 ? l.emi : 0), 0);

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">My Loans</h2>
          <p className="mt-0.5 text-sm text-gray-500">Advances issued to you and their repayment progress.</p>
        </div>

        {mine.length === 0 ? (
          <PayrollEmpty icon={Landmark} title="No loans" hint="You have no active advances. Loan requests are issued by HR." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Outstanding" value={inr(outstanding)} accent="rose" icon={Landmark} />
              <StatCard label="Monthly EMI" value={inr(monthlyEmi)} accent="gray" />
              <StatCard label="Active Loans" value={mine.filter((l) => l.outstanding > 0).length} accent="cyan" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((l) => {
                const repaid = l.principal > 0 ? Math.round(((l.principal - l.outstanding) / l.principal) * 100) : 0;
                return (
                  <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800">{l.name}</h3>
                        {l.description && <p className="text-xs text-gray-400">{l.description}</p>}
                      </div>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{l.annualRate}%</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div><div className="text-[11px] tracking-wide text-gray-400 uppercase">Outstanding</div><div className="font-semibold text-rose-600">{inr(l.outstanding)}</div></div>
                      <div><div className="text-[11px] tracking-wide text-gray-400 uppercase">EMI</div><div className="font-medium text-gray-800">{inr(l.emi)}</div></div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-gray-400"><span>Repaid</span><span>{repaid}%</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-accent transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, repaid))}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PayrollShell>
  );
}
