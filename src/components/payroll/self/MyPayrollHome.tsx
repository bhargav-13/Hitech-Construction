"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useAuthStore } from "@/lib/authStore";
import {
  useMyProfile,
  useMemberAttendance,
  useMyPayslips,
  useMyLoans,
  useMyReimbursements,
} from "@/lib/usePayrollLive";
import { categoryConfig } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { CalendarDays, CircleCheck, IdCard, Landmark, Plane, Receipt, Wallet } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** My Payroll — a self-service home for a signed-in employee: their own attendance, pay and claims. Real backend data. */
export function MyPayrollHome() {
  const user = useAuthStore((s) => s.user);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(last)}`;

  const { profile, loading: profileLoading } = useMyProfile(user?.id ?? null);
  const { rows, loading: attLoading } = useMemberAttendance(user?.id ?? null, from, to);
  const { slips } = useMyPayslips();
  const { loans } = useMyLoans();
  const { rows: claims } = useMyReimbursements();

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, overtime: 0, fine: 0, payableDays: 0 };
    for (const r of rows) {
      s.overtime += Number(r.overtimeHours ?? 0);
      s.fine += Number(r.fineHours ?? 0);
      switch (r.code) {
        case "P": s.present++; s.payableDays += 1; break;
        case "HD": s.halfDay++; s.payableDays += 0.5; break;
        case "PL": s.paidLeave++; s.payableDays += 1; break;
        case "A": s.absent++; break;
        case "WO": s.payableDays += 1; break;
      }
    }
    return s;
  }, [rows]);

  const outstanding = useMemo(() => loans.reduce((a, l) => a + Number(l.outstanding ?? 0), 0), [loans]);
  const activeLoans = useMemo(() => loans.filter((l) => Number(l.outstanding ?? 0) > 0).length, [loans]);
  const pendingClaims = useMemo(() => claims.filter((c) => c.status === "PENDING").length, [claims]);
  const latestSlip = slips[0] ?? null;

  const firstName = (user?.fullName ?? user?.email ?? "there").split(" ")[0];
  const initials = (user?.fullName ?? user?.email ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  const subtitle = profile ? `${profile.designation ?? categoryConfig(profile.category).title}` : user?.email ?? "";

  if (profileLoading || attLoading) {
    return (
      <PayrollShell>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell>
      <div className="space-y-5">
        {/* Greeting */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-50 text-base font-semibold text-brand-accent">
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Hi {firstName} 👋</h2>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>
          </div>
          <span className="rounded-lg bg-cyan-50 px-3 py-1.5 text-sm font-medium text-brand-accent">{MONTHS[now.getMonth()]} {now.getFullYear()}</span>
        </div>

        {/* This month at a glance */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Present this month" value={summary.present} accent="green" icon={CircleCheck} hint={`${summary.payableDays} payable days`} />
          <StatCard label="On Leave" value={summary.paidLeave} accent="blue" icon={Plane} hint={`${summary.absent} absent`} />
          <StatCard label="Latest Net Pay" value={latestSlip ? inr(latestSlip.net) : "—"} accent="cyan" icon={Wallet} hint={latestSlip?.month ? `for ${latestSlip.month}` : "No payslip yet"} />
          <StatCard label="Overtime" value={`${summary.overtime.toFixed(1)} hrs`} accent="gray" hint={`${summary.fine.toFixed(1)} fine hrs`} />
        </div>

        {/* Latest payslip snapshot + shortcuts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{latestSlip?.month ? `Payslip — ${latestSlip.month}` : "Latest payslip"}</h3>
              <Link href="/payroll/me/payslips" className="text-xs font-medium text-brand-accent hover:underline">All payslips →</Link>
            </div>
            {latestSlip ? (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <PayRow label="Gross" value={inr(latestSlip.gross)} />
                  <PayRow label="PF" value={latestSlip.pf ? `- ${inr(latestSlip.pf)}` : "—"} />
                  <PayRow label="ESIC" value={latestSlip.esic ? `- ${inr(latestSlip.esic)}` : "—"} />
                  <PayRow label="Professional Tax" value={latestSlip.pt ? `- ${inr(latestSlip.pt)}` : "—"} />
                  <PayRow label="Loan EMI" value={latestSlip.loanEmi ? `- ${inr(latestSlip.loanEmi)}` : "—"} />
                  <PayRow label="Net Pay" value={inr(latestSlip.net)} strong />
                </div>
                <p className="mt-3 text-[11px] text-gray-400">Payable {latestSlip.payableDays} / {latestSlip.totalDays} days. Issued by HR&apos;s monthly payroll run.</p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">No payslip yet — it appears here once HR runs payroll for a month.</p>
            )}
          </div>

          <div className="space-y-3">
            <ShortcutCard href="/payroll/me/attendance" icon={CalendarDays} title="My Attendance" hint="Your monthly calendar" />
            <ShortcutCard href="/payroll/me/loans" icon={Landmark} title="My Loans" hint={outstanding > 0 ? `${inr(outstanding)} outstanding · ${activeLoans} active` : "No active loans"} />
            <ShortcutCard href="/payroll/me/reimbursements" icon={Receipt} title="My Reimbursements" hint={pendingClaims > 0 ? `${pendingClaims} pending` : "Apply for a claim"} />
            <ShortcutCard href="/payroll/me/profile" icon={IdCard} title="My Profile" hint={profile ? categoryConfig(profile.category).title : "View details"} />
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
