"use client";

import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { useAuthStore } from "@/lib/authStore";
import { useMyEmployee } from "@/lib/payrollApi";
import { categoryConfig } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { Banknote, BadgeIndianRupee, IdCard, ShieldCheck, UserRound } from "lucide-react";

/** My Profile — the signed-in employee's own record: identity, salary structure, bank, statutory. */
export default function MyProfilePage() {
  const me = useMyEmployee();
  const user = useAuthStore((s) => s.user);

  if (!me) {
    return <PayrollShell><PayrollEmpty icon={UserRound} title="Your staff profile isn't linked yet" hint="Ask HR to add you as a staff member so your profile shows here." /></PayrollShell>;
  }

  const isWork = me.category === "WORK_BASIS";

  return (
    <PayrollShell>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Header card */}
        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-lg font-semibold text-brand-accent">
            {me.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800">{me.name}</h2>
            <p className="text-sm text-gray-500">{me.designation} · {me.department}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-cyan-50 px-2 py-0.5 font-medium text-brand-accent">{me.staffId}</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-500">{categoryConfig(me.category).title}</span>
              <span className={`rounded-md px-2 py-0.5 font-medium ${me.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{me.active ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>

        <Card icon={IdCard} title="Contact & Employment">
          <Row label="Phone" value={me.phone} />
          <Row label="Email" value={me.email ?? user?.email ?? "—"} />
          <Row label="Department" value={me.department} />
          <Row label="Designation" value={me.designation} />
          <Row label="Joining Date" value={me.joiningDate} />
        </Card>

        <Card icon={BadgeIndianRupee} title={isWork ? "Work-based Pay" : "Salary Structure"}>
          {isWork ? (
            <Row label="Rate" value={`${inr(me.salary.workRate)} / ${me.salary.workType === "HOURLY" ? "hour" : me.salary.workType === "PIECE" ? "piece" : "day"}`} />
          ) : (
            <>
              <Row label="Monthly CTC" value={inr(me.salary.monthlyCtc)} />
              <Row label="Basic" value={inr(me.salary.basic)} />
              <Row label="HRA" value={inr(me.salary.hra)} />
              <Row label="Other Allowances" value={inr(me.salary.otherAllowances)} />
            </>
          )}
        </Card>

        <Card icon={ShieldCheck} title="Statutory">
          <Row label="PF" value={me.salary.pf ? "Enrolled" : "—"} />
          <Row label="ESIC" value={me.salary.esic ? "Enrolled" : "—"} />
          <Row label="Professional Tax" value={me.salary.pt ? "Applicable" : "—"} />
          <Row label="PAN" value={me.pan ?? "—"} mono />
        </Card>

        <Card icon={Banknote} title="Bank">
          <Row label="Account No." value={me.bankAccount ?? "—"} mono />
          <Row label="IFSC" value={me.ifsc ?? "—"} mono />
          <Row label="Bank" value={me.bankName ?? "—"} />
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
