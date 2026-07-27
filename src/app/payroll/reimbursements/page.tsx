"use client";

import { useMemo, useState } from "react";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { usePayrollStore } from "@/lib/payrollApi";
import type { ReimbursementStatus } from "@/lib/payrollApi";
import { inr } from "@/lib/format";
import { Banknote, Check, CircleCheck, Clock, Plus, Receipt, Wallet, X } from "lucide-react";

const STATUS_STYLE: Record<ReimbursementStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-rose-50 text-rose-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const EXPENSE_TYPES = ["Travel", "Fuel", "Site Supplies", "Food & Lodging", "Tools", "Medical", "Other"];

/** Reimbursements — track, approve, and settle employee expense claims. */
export default function ReimbursementsPage() {
  const items = usePayrollStore((s) => s.reimbursements);
  const employees = usePayrollStore((s) => s.employees);
  const setStatus = usePayrollStore((s) => s.setReimbursementStatus);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"ALL" | ReimbursementStatus>("ALL");
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";
  const staffOf = (id: string) => employees.find((e) => e.id === id)?.staffId ?? "";

  const totals = useMemo(() => ({
    paid: items.filter((r) => r.status === "PAID").reduce((a, r) => a + (r.approvedAmount ?? 0), 0),
    paidCount: items.filter((r) => r.status === "PAID").length,
    approved: items.filter((r) => r.status === "APPROVED").reduce((a, r) => a + (r.approvedAmount ?? 0), 0),
    approvedCount: items.filter((r) => r.status === "APPROVED").length,
    pending: items.filter((r) => r.status === "PENDING").length,
  }), [items]);

  const rows = tab === "ALL" ? items : items.filter((r) => r.status === tab);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Reimbursements</h2>
            <p className="mt-0.5 text-sm text-gray-500">Track, approve and settle employee expense claims.</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
            <Plus size={15} /> New Claim
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Reimbursements Paid" value={inr(totals.paid)} accent="green" icon={CircleCheck} hint={`${totals.paidCount} settled claims`} />
          <StatCard label="Approved (awaiting payout)" value={inr(totals.approved)} accent="blue" icon={Wallet} hint={`${totals.approvedCount} claims`} />
          <StatCard label="Pending Review" value={totals.pending} accent="amber" icon={Clock} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "PENDING", "APPROVED", "PAID", "REJECTED"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${tab === t ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
              {t === "ALL" ? "All" : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Expense / Claim</th>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Expense Date</th>
                <th className="px-4 py-2 text-right font-medium">Requested</th>
                <th className="px-4 py-2 text-right font-medium">Approved</th>
                <th className="px-4 py-2 font-medium">Approved By</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{r.expenseType}</div>
                    <div className="font-mono text-xs text-gray-400">{r.claimId}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-gray-700">{nameOf(r.employeeId)}</div>
                    <div className="text-xs text-gray-400">{staffOf(r.employeeId)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.expenseDate}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{inr(r.requestedAmount)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">{r.approvedAmount != null ? inr(r.approvedAmount) : "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.approvedBy ?? "—"}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex">
                      <RowMenu align="right" buttonLabel={`Actions for ${r.claimId}`}>
                        {(close) => (
                          <>
                            {r.status === "PENDING" && <RowMenuItem icon={Check} label="Approve" onClick={() => { close(); setStatus(r.id, "APPROVED"); }} />}
                            {r.status === "PENDING" && <RowMenuItem icon={X} label="Reject" tone="danger" onClick={() => { close(); setStatus(r.id, "REJECTED"); }} />}
                            {r.status === "APPROVED" && <RowMenuItem icon={Banknote} label="Mark paid" onClick={() => { close(); setStatus(r.id, "PAID"); }} />}
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400"><Receipt size={22} className="mx-auto mb-2 text-gray-300" />No claims here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <ClaimDialog onClose={() => setCreating(false)} />}
    </PayrollShell>
  );
}

function ClaimDialog({ onClose }: { onClose: () => void }) {
  const employees = usePayrollStore((s) => s.employees);
  const add = usePayrollStore((s) => s.addReimbursement);
  const [employeeId, setEmployeeId] = useState("");
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES[0]);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");

  function save() {
    if (!employeeId) return setError("Select an employee.");
    if (!amount) return setError("Enter the claim amount.");
    add({ employeeId, expenseType, claimId: `CLM-${Math.floor(1000 + Math.random() * 9000)}`, expenseDate, appliedAt: new Date().toISOString().slice(0, 10), approvedAt: null, settlementDate: null, requestedAmount: amount, approvedAmount: null, approvedBy: null, status: "PENDING" });
    onClose();
  }

  return (
    <Drawer title="New Reimbursement Claim" onClose={onClose} onSave={save} saveLabel="Submit Claim" width="max-w-md">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <F label="Employee" required><Select value={employeeId} onChange={setEmployeeId} placeholder="Select employee" options={[{ value: "", label: "Select employee" }, ...employees.filter((e) => e.active).map((e) => ({ value: e.id, label: `${e.name} · ${e.staffId}` }))]} /></F>
        <F label="Expense Type"><Select value={expenseType} onChange={setExpenseType} options={EXPENSE_TYPES.map((t) => ({ value: t, label: t }))} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Expense Date"><DatePicker value={expenseDate} onChange={setExpenseDate} placeholder="Date" /></F>
          <F label="Amount (₹)" required><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" /></F>
        </div>
      </div>
    </Drawer>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  );
}
