"use client";

import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useMyLoans } from "@/lib/usePayrollLive";
import { inr } from "@/lib/format";
import { Landmark } from "lucide-react";

/** My Loans — the signed-in member's own advances, EMI and outstanding balance (read-only). */
export default function MyLoansPage() {
  const { loans, loading, error } = useMyLoans();

  const outstanding = loans.reduce((a, l) => a + Number(l.outstanding), 0);
  const monthlyEmi = loans.reduce((a, l) => a + (Number(l.outstanding) > 0 ? Number(l.emi) : 0), 0);

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">My Loans</h2>
          <p className="mt-0.5 text-sm text-gray-500">Advances issued to you and their repayment progress.</p>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : loans.length === 0 ? (
          <PayrollEmpty icon={Landmark} title="No loans" hint="You have no active advances. Loan requests are issued by HR." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Outstanding" value={inr(outstanding)} accent="rose" icon={Landmark} />
              <StatCard label="Monthly EMI" value={inr(monthlyEmi)} accent="gray" />
              <StatCard label="Active Loans" value={loans.filter((l) => Number(l.outstanding) > 0).length} accent="cyan" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loans.map((l) => {
                const p = Number(l.principal);
                const o = Number(l.outstanding);
                const repaid = p > 0 ? Math.round(((p - o) / p) * 100) : 0;
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
                      <div><div className="text-[11px] tracking-wide text-gray-400 uppercase">Outstanding</div><div className="font-semibold text-rose-600">{inr(o)}</div></div>
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
