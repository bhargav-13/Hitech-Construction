"use client";

import { useState } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useMyReimbursements } from "@/lib/usePayrollLive";
import { ApiError } from "@/lib/api";
import type { ReimbStatus } from "@/lib/api";
import { inr } from "@/lib/format";
import { CircleCheck, Clock, Plus, Receipt, Wallet } from "lucide-react";

const STATUS_STYLE: Record<ReimbStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-blue-50 text-blue-700",
  REJECTED: "bg-rose-50 text-rose-700",
  PAID: "bg-emerald-50 text-emerald-700",
};
const EXPENSE_TYPES = ["Travel", "Fuel", "Site Supplies", "Food & Lodging", "Tools", "Medical", "Other"];

/** My Reimbursements — self-service, backed by the real reimbursements API. */
export default function MyReimbursementsPage() {
  const { rows, loading, error, create } = useMyReimbursements();
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState("");

  const totals = {
    paid: rows.filter((r) => r.status === "PAID").reduce((a, r) => a + Number(r.approvedAmount ?? 0), 0),
    approved: rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + Number(r.approvedAmount ?? 0), 0),
    pending: rows.filter((r) => r.status === "PENDING").length,
  };

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Reimbursements</h2>
            <p className="mt-0.5 text-sm text-gray-500">Raise expense claims and track their approval.</p>
          </div>
          <button onClick={() => setApplying(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
            <Plus size={15} /> New Claim
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Paid to me" value={inr(totals.paid)} accent="green" icon={CircleCheck} />
          <StatCard label="Approved (awaiting)" value={inr(totals.approved)} accent="blue" icon={Wallet} />
          <StatCard label="Pending review" value={totals.pending} accent="amber" icon={Clock} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={Receipt} title="No claims yet" hint="Raise your first reimbursement claim — travel, fuel, tools and more." action={<button onClick={() => setApplying(true)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New Claim</button>} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Claim</th>
                  <th className="px-4 py-2 font-medium">Expense Date</th>
                  <th className="px-4 py-2 text-right font-medium">Requested</th>
                  <th className="px-4 py-2 text-right font-medium">Approved</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{r.expenseType}</div>
                      <div className="font-mono text-xs text-gray-400">{r.claimId}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{r.expenseDate}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{inr(r.requestedAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{r.approvedAmount != null ? inr(r.approvedAmount) : "—"}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {applying && (
        <ClaimDialog
          onClose={() => setApplying(false)}
          onCreate={async (body) => {
            try {
              await create(body);
              setApplying(false);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : "Unable to submit this claim.");
            }
          }}
        />
      )}
    </PayrollShell>
  );
}

function ClaimDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: { expenseType: string; expenseDate: string; requestedAmount: number }) => Promise<void>;
}) {
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES[0]);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amount) { setError("Enter the claim amount."); return; }
    setSaving(true);
    setError("");
    try {
      await onCreate({ expenseType, expenseDate, requestedAmount: amount });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title="New Reimbursement Claim" onClose={onClose} onSave={save} saveLabel={saving ? "Submitting…" : "Submit Claim"} width="max-w-md">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Expense Type</span>
          <Select value={expenseType} onChange={setExpenseType} options={EXPENSE_TYPES.map((t) => ({ value: t, label: t }))} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Expense Date</span>
            <DatePicker value={expenseDate} onChange={setExpenseDate} placeholder="Date" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Amount (₹) *</span>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" autoFocus />
          </label>
        </div>
        <p className="text-[11px] text-gray-400">Your claim goes to HR/your manager for approval. You&apos;ll see the status update here.</p>
      </div>
    </Drawer>
  );
}
