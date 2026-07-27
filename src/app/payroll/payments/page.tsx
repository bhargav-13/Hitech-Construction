"use client";

import { useMemo, useState } from "react";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { usePayrollStore } from "@/lib/payrollApi";
import type { PaymentCategory, PaymentStatus } from "@/lib/payrollApi";
import { inr } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { CircleCheck, Clock, FileCog, FileSpreadsheet, Loader, Save, Search } from "lucide-react";

const STATUS_STYLE: Record<PaymentStatus, string> = {
  SAVED_OFFLINE: "bg-gray-100 text-gray-600",
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
};
const STATUS_LABEL: Record<PaymentStatus, string> = {
  SAVED_OFFLINE: "Saved Offline", PENDING: "Pending", PROCESSING: "Processing", COMPLETED: "Completed",
};
const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  SALARY: "Salary Payment", ADVANCE: "Advance Payout", BONUS: "Bonus", REIMBURSEMENT: "Reimbursement",
};

/** Payments — salary disbursement logs, transaction tracking and payout templates. */
export default function PaymentsPage() {
  const payments = usePayrollStore((s) => s.payments);
  const employees = usePayrollStore((s) => s.employees);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [template, setTemplate] = useState(false);
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";
  const staffOf = (id: string) => employees.find((e) => e.id === id)?.staffId ?? "";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return [nameOf(p.employeeId), staffOf(p.employeeId), p.description, p.department].some((f) => f.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, search, status]);

  const summary = useMemo(() => ({
    completed: payments.filter((p) => p.status === "COMPLETED").reduce((a, p) => a + p.amount, 0),
    pending: payments.filter((p) => p.status === "PENDING" || p.status === "PROCESSING").reduce((a, p) => a + p.amount, 0),
    offline: payments.filter((p) => p.status === "SAVED_OFFLINE").length,
  }), [payments]);

  const head = ["Staff ID", "Employee", "Date", "Cycle", "Department", "Description", "Category", "Amount", "Status"];
  const data = rows.map((p) => [staffOf(p.employeeId), nameOf(p.employeeId), p.date, p.cycleMonth, p.department, p.description, CATEGORY_LABEL[p.category], p.amount, STATUS_LABEL[p.status]]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Payments</h2>
            <p className="mt-0.5 text-sm text-gray-500">Salary disbursement logs and transaction tracking.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportRowsToCsv("payment-logs", head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">
              <FileSpreadsheet size={14} /> Export
            </button>
            <button onClick={() => setTemplate(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
              <FileCog size={15} /> Add Payment Template
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Completed Payouts" value={inr(summary.completed)} accent="green" icon={CircleCheck} />
          <StatCard label="In Progress" value={inr(summary.pending)} accent="blue" icon={Loader} />
          <StatCard label="Saved Offline" value={summary.offline} accent="gray" icon={Clock} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, staff ID, description…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44">
            <Select value={status} onChange={(v) => setStatus(v as "all" | PaymentStatus)} options={[{ value: "all", label: "All statuses" }, ...(["SAVED_OFFLINE", "PENDING", "PROCESSING", "COMPLETED"] as PaymentStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Cycle</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{nameOf(p.employeeId)}</div>
                    <div className="text-xs text-gray-400">{staffOf(p.employeeId)} · {p.description}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.date}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.cycleMonth}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.department}</td>
                  <td className="px-4 py-2.5 text-gray-600">{CATEGORY_LABEL[p.category]}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{inr(p.amount)}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {template && <TemplateDialog onClose={() => setTemplate(false)} />}
    </PayrollShell>
  );
}

function TemplateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [holder, setHolder] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [acc, setAcc] = useState("");
  const [accConfirm, setAccConfirm] = useState("");
  const [statementName, setStatementName] = useState("HITECH CONSTRUCTION");
  const [error, setError] = useState("");

  function save() {
    if (!name.trim()) return setError("Template name is required.");
    if (acc !== accConfirm) return setError("Account numbers do not match.");
    onClose();
  }

  return (
    <Drawer title="Add Payment Template" onClose={onClose} onSave={save} saveLabel="Save Template" width="max-w-lg">
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <Section title="Template Identification">
          <F label="Template Name" required><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Monthly Payroll" autoFocus /></F>
          <F label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="optional" /></F>
        </Section>
        <Section title="Refund Bank Account">
          <p className="mb-2 text-[11px] text-gray-400">Where failed or returned payouts are credited back.</p>
          <F label="Account Holder Name"><input value={holder} onChange={(e) => setHolder(e.target.value)} className="input" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="IFSC Code"><input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className="input font-mono" /></F>
            <F label="Account Number"><input value={acc} onChange={(e) => setAcc(e.target.value)} className="input font-mono" /></F>
          </div>
          <F label="Confirm Account Number"><input value={accConfirm} onChange={(e) => setAccConfirm(e.target.value)} className="input font-mono" /></F>
        </Section>
        <Section title="Business Name in Bank Statement">
          <p className="mb-2 text-[11px] text-gray-400">How your payouts appear on employees&apos; bank statements.</p>
          <F label="Recipient Display Name"><input value={statementName} onChange={(e) => setStatementName(e.target.value)} className="input" /></F>
        </Section>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400"><Save size={12} /> Refunds for Virtual Account payouts are credited back to the source account automatically.</div>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
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
