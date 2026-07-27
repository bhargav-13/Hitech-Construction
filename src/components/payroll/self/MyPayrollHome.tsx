"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { useAuthStore } from "@/lib/authStore";
import { usePayrollStore, useMyEmployee, daysInMonth, monthlySummary, computePayslip } from "@/lib/payrollApi";
import { categoryConfig } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { CalendarDays, CircleCheck, IdCard, Landmark, Plane, Receipt, UserRound, Wallet } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** My Payroll — a self-service home for a signed-in employee: their own attendance, pay and claims. */
export function MyPayrollHome() {
  const user = useAuthStore((s) => s.user);
  const me = useMyEmployee();
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const loans = usePayrollStore((s) => s.loans);
  const reimbursements = usePayrollStore((s) => s.reimbursements);

  const now = new Date();
  const dates = useMemo(() => daysInMonth(now.getFullYear(), now.getMonth()), [now]);

  const data = useMemo(() => {
    if (!me) return null;
    const summary = monthlySummary(overrides, me, dates);
    const slip = computePayslip(me, overrides, loans, dates);
    const myLoans = loans.filter((l) => l.employeeId === me.id);
    const outstanding = myLoans.reduce((a, l) => a + l.outstanding, 0);
    const myClaims = reimbursements.filter((r) => r.employeeId === me.id);
    const pendingClaims = myClaims.filter((r) => r.status === "PENDING").length;
    return { summary, slip, outstanding, loanCount: myLoans.filter((l) => l.outstanding > 0).length, pendingClaims, claimCount: myClaims.length };
  }, [me, overrides, loans, reimbursements, dates]);

  if (!me || !data) {
    return (
      <PayrollShell>
        <PayrollEmpty
          icon={UserRound}
          title="Your staff profile isn't linked yet"
          hint={`Signed in as ${user?.email ?? "your account"}. Ask HR to add you as a staff member (or link your login) so your attendance and payslips show up here.`}
        />
      </PayrollShell>
    );
  }

  const firstName = me.name.split(" ")[0];

  return (
    <PayrollShell>
      <div className="space-y-5">
        {/* Greeting */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-50 text-base font-semibold text-brand-accent">
              {me.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Hi {firstName} 👋</h2>
              <p className="text-sm text-gray-500">{me.designation} · {me.department} · {me.staffId}</p>
            </div>
          </div>
          <span className="rounded-lg bg-cyan-50 px-3 py-1.5 text-sm font-medium text-brand-accent">{MONTHS[now.getMonth()]} {now.getFullYear()}</span>
        </div>

        {/* This month at a glance */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Present this month" value={data.summary.present} accent="green" icon={CircleCheck} hint={`${data.summary.payableDays} payable days`} />
          <StatCard label="On Leave" value={data.summary.paidLeave} accent="blue" icon={Plane} hint={`${data.summary.absent} absent`} />
          <StatCard label="Est. Net Pay" value={inr(data.slip.net)} accent="cyan" icon={Wallet} hint="This month, so far" />
          <StatCard label="Overtime" value={`${data.summary.overtime} hrs`} accent="gray" hint={`${data.summary.fine} fine hrs`} />
        </div>

        {/* Payslip snapshot + shortcuts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">This month&apos;s pay estimate</h3>
              <Link href="/payroll/me/payslips" className="text-xs font-medium text-brand-accent hover:underline">All payslips →</Link>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <PayRow label="Gross" value={inr(data.slip.gross)} />
              <PayRow label="PF" value={data.slip.pf ? `- ${inr(data.slip.pf)}` : "—"} />
              <PayRow label="ESIC" value={data.slip.esic ? `- ${inr(data.slip.esic)}` : "—"} />
              <PayRow label="Professional Tax" value={data.slip.pt ? `- ${inr(data.slip.pt)}` : "—"} />
              <PayRow label="Loan EMI" value={data.slip.loanEmi ? `- ${inr(data.slip.loanEmi)}` : "—"} />
              <PayRow label="Net Pay" value={inr(data.slip.net)} strong />
            </div>
            <p className="mt-3 text-[11px] text-gray-400">Estimate based on attendance so far this month. Final payslip is issued when HR runs payroll.</p>
          </div>

          <div className="space-y-3">
            <ShortcutCard href="/payroll/me/attendance" icon={CalendarDays} title="My Attendance" hint="Your monthly calendar" />
            <ShortcutCard href="/payroll/me/loans" icon={Landmark} title="My Loans" hint={data.outstanding > 0 ? `${inr(data.outstanding)} outstanding` : "No active loans"} />
            <ShortcutCard href="/payroll/me/reimbursements" icon={Receipt} title="My Reimbursements" hint={data.pendingClaims > 0 ? `${data.pendingClaims} pending` : "Apply for a claim"} />
            <ShortcutCard href="/payroll/me/profile" icon={IdCard} title="My Profile" hint={`${categoryConfig(me.category).title}`} />
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}

function PayRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={strong ? "text-base font-semibold text-gray-900" : "font-medium text-gray-700"}>{value}</div>
    </div>
  );
}

function ShortcutCard({ href, icon: Icon, title, hint }: { href: string; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; hint: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-sm active:scale-[0.99]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={16} /></div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800">{title}</div>
        <div className="truncate text-xs text-gray-400">{hint}</div>
      </div>
    </Link>
  );
}
