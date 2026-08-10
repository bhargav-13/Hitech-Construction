"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { getMemberPayslips, type PayrollLoan, type PayrollPayslip, type PayrollReimbursement } from "@/lib/payrollClient";
import { staffFinancials } from "@/lib/staffLedger";
import type { UserResponse } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { CreditCard, ExternalLink, Mail, Phone } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  const v = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}/.test(v)) return v || "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d ? `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}` : `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/**
 * The Vyapar Parties detail panel for a staff member. Mirrors the party ledger, but sourced from
 * the real payroll-service — loans and reimbursements (passed in from the page's bulk load) plus the
 * member's salary payslips (fetched here).
 */
export function StaffLedgerPanel({
  member,
  loans,
  reimbursements,
}: {
  member: UserResponse;
  loans: PayrollLoan[];
  reimbursements: PayrollReimbursement[];
}) {
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMemberPayslips(member.id)
      .then((s) => !cancelled && setPayslips(s))
      .catch(() => !cancelled && setPayslips([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const fin = useMemo(() => staffFinancials(loans, reimbursements, payslips), [loans, reimbursements, payslips]);
  const posting = member.staffType === "SITE" ? "Site" : member.staffType === "OFFICE" ? "Office" : null;

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-gray-800">{member.fullName}</h3>
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                {posting === "Site" ? "Worker" : "Staff"}
              </span>
              {member.onPayroll && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">On payroll</span>
              )}
              {!member.isActive && (
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Inactive</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <Meta label="Role" value={member.role.name} />
              <Meta label="Department" value={member.departmentName} />
              {posting && <Meta label="Posting" value={posting} />}
              <Meta label="Phone" value={member.phoneNumber} icon={Phone} />
              <Meta label="Email" value={member.email} icon={Mail} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[11px] tracking-wide text-gray-400 uppercase">
                {fin.balance >= 0 ? "They owe (loans)" : "We owe (reimb.)"}
              </div>
              <div className={`text-xl font-semibold ${fin.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {inr(Math.abs(fin.balance))}
              </div>
            </div>
            <Link
              href={`/payroll?member=${member.id}`}
              className="flex items-center gap-1 text-xs font-medium text-brand-accent transition-opacity duration-150 hover:opacity-80"
            >
              <ExternalLink size={12} /> Open in Payroll
            </Link>
          </div>
        </div>
      </div>

      {/* Financial summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Salary paid" value={inr(fin.totalPaid)} />
        <Stat label="Loans outstanding" value={inr(fin.outstandingLoans)} tone={fin.outstandingLoans > 0 ? "emerald" : undefined} />
        <Stat label="Reimb. pending" value={inr(fin.pendingReimbursements)} tone={fin.pendingReimbursements > 0 ? "rose" : undefined} />
        <Stat label="Net" value={inr(fin.balance)} />
      </div>

      {/* Ledger */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            <CreditCard size={14} className="text-brand-accent" /> Payroll ledger
          </h4>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">From Payroll</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <Spinner size={14} className="text-brand-accent" /> Loading payroll…
          </div>
        ) : fin.rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No payroll transactions for this member yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Ref / Month</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fin.rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 text-gray-700">{r.type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.ref ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{inr(r.amount)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] tracking-wide text-gray-400 uppercase">{label}</span>
      {Icon && <Icon size={12} className="shrink-0 text-gray-300" />}
      <span className="truncate text-gray-700">{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-gray-800";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}
