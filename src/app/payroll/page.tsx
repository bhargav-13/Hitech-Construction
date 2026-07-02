"use client";

import { useState } from "react";
import { IndianRupee, UserRound, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { Modal } from "@/components/Modal";
import { CREW } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";

interface Worker {
  name: string;
  role: string;
  payrollType: "Daily Wages" | "Monthly Salary" | "Work Basis";
  rate: number;
  presentDays: number;
}

const SEED_WORKERS: Worker[] = [
  { name: "Vishwas Bhai Ujjain", role: "Site Supervisor", payrollType: "Monthly Salary", rate: 28000, presentDays: 26 },
  { name: "Shubham Bhai Ujjain", role: "Site Engineer", payrollType: "Monthly Salary", rate: 32000, presentDays: 25 },
  { name: "Mahesh Bhai Chauhan", role: "Mason", payrollType: "Daily Wages", rate: 800, presentDays: 24 },
  { name: "Ketan Bhai Vaghela", role: "Helper", payrollType: "Daily Wages", rate: 550, presentDays: 22 },
  { name: "Ramesh Patel", role: "Electrician", payrollType: "Daily Wages", rate: 900, presentDays: 18 },
  { name: "Suresh Bhai", role: "Plumber", payrollType: "Work Basis", rate: 0, presentDays: 15 },
];

const PAYMENTS = [
  { date: "01-Jul-2026", worker: "Vishwas Bhai Ujjain", type: "Salary - Jun 2026", amount: 28000, mode: "Bank Transfer" },
  { date: "01-Jul-2026", worker: "Shubham Bhai Ujjain", type: "Salary - Jun 2026", amount: 32000, mode: "Bank Transfer" },
  { date: "28-Jun-2026", worker: "Mahesh Bhai Chauhan", type: "Weekly Wages", amount: 4800, mode: "Cash" },
  { date: "28-Jun-2026", worker: "Ketan Bhai Vaghela", type: "Weekly Wages", amount: 3300, mode: "Cash" },
  { date: "25-Jun-2026", worker: "Suresh Bhai", type: "Advance", amount: 5000, mode: "UPI" },
];

export default function PayrollPage() {
  const [workers, setWorkers] = useState(SEED_WORKERS);
  const [tab, setTab] = useState<"Workforce" | "Payments">("Workforce");
  const [showAdd, setShowAdd] = useState(false);

  const monthlyBill = workers.reduce(
    (sum, w) => sum + (w.payrollType === "Monthly Salary" ? w.rate : w.rate * w.presentDays),
    0
  );

  return (
    <AppShell title="Payroll">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={Users} label="Total Workforce" value={String(workers.length)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={Wallet} label="Est. Monthly Payout" value={formatRupee(monthlyBill)} tint="bg-green-100 text-green-600" />
        <Kpi icon={IndianRupee} label="Paid This Month" value={formatRupee(PAYMENTS.reduce((s, p) => s + p.amount, 0))} tint="bg-amber-100 text-amber-600" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-6 border-b border-gray-200">
          {(["Workforce", "Payments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "Workforce" && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Add Worker
          </button>
        )}
      </div>

      {tab === "Workforce" ? (
        <SimpleTable
          columns={[
            { key: "name", label: "Name" },
            { key: "role", label: "Role" },
            { key: "payrollType", label: "Payroll Type" },
            { key: "rate", label: "Rate" },
            { key: "presentDays", label: "Present Days (Jun)" },
            { key: "estimated", label: "Est. Payout" },
          ]}
          rows={workers.map((w) => ({
            name: w.name,
            role: w.role,
            payrollType: w.payrollType,
            rate: w.payrollType === "Monthly Salary" ? `${formatRupee(w.rate)}/month` : w.rate ? `${formatRupee(w.rate)}/day` : "Per work",
            presentDays: w.presentDays,
            estimated: formatRupee(w.payrollType === "Monthly Salary" ? w.rate : w.rate * w.presentDays),
          }))}
        />
      ) : (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "worker", label: "Worker" },
            { key: "type", label: "Payment Type" },
            { key: "amount", label: "Amount" },
            { key: "mode", label: "Mode" },
          ]}
          rows={PAYMENTS.map((p) => ({ ...p, amount: formatRupee(p.amount) }))}
        />
      )}

      {showAdd && (
        <AddWorkerModal
          onClose={() => setShowAdd(false)}
          onSave={(w) => {
            setWorkers([w, ...workers]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, tint }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; tint: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}

function AddWorkerModal({ onClose, onSave }: { onClose: () => void; onSave: (w: Worker) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Helper");
  const [payrollType, setPayrollType] = useState<Worker["payrollType"]>("Daily Wages");
  const [rate, setRate] = useState("600");

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">Add Worker</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
                {["Site Supervisor", "Site Engineer", "Mason", "Helper", "Electrician", "Plumber"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Payroll Type</span>
              <select value={payrollType} onChange={(e) => setPayrollType(e.target.value as Worker["payrollType"])} className="input">
                {["Daily Wages", "Monthly Salary", "Work Basis"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Rate (₹)</span>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="input" />
          </label>
          <button
            onClick={() => name.trim() && onSave({ name, role, payrollType, rate: Number(rate) || 0, presentDays: 0 })}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Worker
          </button>
        </div>
      </div>
    </Modal>
  );
}
