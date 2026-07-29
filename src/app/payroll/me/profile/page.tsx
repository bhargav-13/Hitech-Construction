"use client";

import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useAuthStore } from "@/lib/authStore";
import { useMyProfile } from "@/lib/usePayrollLive";
import { categoryConfig } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { Banknote, BadgeIndianRupee, IdCard, ShieldCheck, UserRound } from "lucide-react";

/** My Profile — the signed-in employee's own record (real payroll profile: salary, statutory, bank). */
export default function MyProfilePage() {
  const user = useAuthStore((s) => s.user);
  const { profile, loading, error } = useMyProfile(user?.id ?? null);

  if (loading) {
    return (
      <PayrollShell>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </PayrollShell>
    );
  }

  if (!profile) {
    return (
      <PayrollShell>
        <PayrollEmpty
          icon={UserRound}
          title="Your payroll profile isn't set up yet"
          hint={`Signed in as ${user?.email ?? "your account"}. Ask HR to complete your payroll profile so your salary, statutory and bank details show here.`}
        />
      </PayrollShell>
    );
  }

  const name = user?.fullName ?? user?.email ?? "—";
  const isWork = profile.category === "WORK_BASIS";
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <PayrollShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Header card */}
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-lg font-semibold text-brand-accent">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800">{name}</h2>
            <p className="text-sm text-gray-500">{profile.designation ?? "—"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-500">{categoryConfig(profile.category).title}</span>
            </div>
          </div>
        </div>

        <Card icon={IdCard} title="Contact & Employment">
          <Row label="Email" value={user?.email ?? "—"} />
          <Row label="Designation" value={profile.designation ?? "—"} />
          <Row label="Joining Date" value={profile.joiningDate ?? "—"} />
        </Card>

        <Card icon={BadgeIndianRupee} title={isWork ? "Work-based Pay" : "Salary Structure"}>
          {isWork ? (
            <Row label="Rate" value={`${inr(profile.salary.workRate)} / ${profile.salary.workType === "HOURLY" ? "hour" : profile.salary.workType === "PIECE" ? "piece" : "day"}`} />
          ) : (
            <>
              <Row label="Monthly CTC" value={inr(profile.salary.monthlyCtc)} />
              <Row label="Basic" value={inr(profile.salary.basic)} />
              <Row label="HRA" value={inr(profile.salary.hra)} />
              <Row label="Other Allowances" value={inr(profile.salary.otherAllowances)} />
            </>
          )}
        </Card>

        <Card icon={ShieldCheck} title="Statutory">
          <Row label="PF" value={profile.salary.pf ? "Enrolled" : "—"} />
          <Row label="ESIC" value={profile.salary.esic ? "Enrolled" : "—"} />
          <Row label="Professional Tax" value={profile.salary.pt ? "Applicable" : "—"} />
          <Row label="PAN" value={profile.pan ?? "—"} mono />
        </Card>

        <Card icon={Banknote} title="Bank">
          <Row label="Account No." value={profile.bankAccount ?? "—"} mono />
          <Row label="IFSC" value={profile.ifsc ?? "—"} mono />
          <Row label="Bank" value={profile.bankName ?? "—"} />
        </Card>

        <p className="text-center text-[11px] text-gray-400">To update these details, contact your HR / admin.</p>
      </div>
    </PayrollShell>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Icon size={16} /></div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-50 py-1.5 last:border-b-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className={`text-sm text-gray-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
