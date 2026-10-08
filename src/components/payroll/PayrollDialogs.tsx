"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { ApiError, addPaymentApi, addVariablesApi, savePayrollProfile } from "@/lib/api";
import type { PaymentCategoryApi, PaymentModeApi, PayrollProfileResponse } from "@/lib/api";
import { todayIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { useBankAccountResolver, usePaymentTypeOptions } from "@/lib/bankScope";

/** Shared Payroll dialogs: Add Payment, Variable earnings / deductions, and Revise Salary. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Recent salary cycles, newest first — "2026-10" labelled "October 2026". */
export function cycleOptions(count = 6) {
  const [y, m] = todayIST().split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export const PAYMENT_CATEGORIES: { value: PaymentCategoryApi; label: string; hint: string }[] = [
  { value: "SALARY", label: "Salary Payment", hint: "Settles the month's salary due" },
  { value: "ADVANCE", label: "Advance Salary", hint: "Recovered from this month's payslip" },
  { value: "GENERAL", label: "General Payment", hint: "Recorded on the ledger only" },
  { value: "BONUS", label: "Bonus", hint: "Paid outside the payslip" },
  { value: "ADJUSTMENT", label: "Adjustment", hint: "Correction entry" },
  { value: "FNF", label: "Full & Final", hint: "Settlement paid at exit" },
];
export const PAYMENT_MODES: { value: PaymentModeApi; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

function Shell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="space-y-3 px-5 py-4">{children}</div>
      <div className="border-t border-gray-100 px-5 py-3">{footer}</div>
    </>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </div>
  );
}

function Buttons({ busy, error, onCancel, onSave, label }: { busy: boolean; error: string; onCancel: () => void; onSave: () => void; label: string }) {
  return (
    <>
      {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={onSave} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <Spinner size={14} />} {label}
        </button>
      </div>
    </>
  );
}

/**
 * "Paid from" — the Vyapar cash / bank account a payroll payment came out of. Payroll posts every
 * payment onto the staff member's Vyapar party, and the account's balance only moves when the
 * payment carries its id (a bare name is just a label), so the picker resolves the name to an id.
 */
export function usePaidFrom(initial = "Cash") {
  const options = usePaymentTypeOptions();
  const resolve = useBankAccountResolver();
  const [account, setAccount] = useState(initial);
  return { account, setAccount, options, bankAccountId: resolve(account) };
}

export function PaidFromField({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Field label="Paid From">
      <Select value={value} onChange={onChange} options={options} />
      <p className="mt-1 text-[11px] text-gray-400">Posts to the staff member&apos;s Vyapar ledger and moves this account&apos;s balance.</p>
    </Field>
  );
}

/** Record a payment to one staff member. A record only — no money moves. */
export function AddPaymentDialog({
  userId, name, onClose, onSaved, defaultCategory = "GENERAL",
}: {
  userId: number; name: string; onClose: () => void; onSaved?: () => void | Promise<void>; defaultCategory?: PaymentCategoryApi;
}) {
  const cycles = cycleOptions();
  const [month, setMonth] = useState(cycles[0].value);
  const [mode, setMode] = useState<PaymentModeApi>("CASH");
  const [category, setCategory] = useState<PaymentCategoryApi>(defaultCategory);
  const [date, setDate] = useState(todayIST());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paidFrom = usePaidFrom();
  // Picking a bank account means it wasn't cash, and vice versa — keep the two in step.
  const pickAccount = (v: string) => {
    paidFrom.setAccount(v);
    if (v === "Cash") setMode("CASH");
    else if (mode === "CASH") setMode("BANK");
  };

  async function save() {
    const amt = Number(amount);
    if (!(amt > 0)) { setError("Enter an amount above zero."); return; }
    setBusy(true); setError("");
    try {
      await addPaymentApi({
        userId, month, category, mode, amount: amt, recordDate: date, description: description || undefined,
        bankAccountId: paidFrom.bankAccountId,
      });
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to record the payment.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <Shell
        title="Add Payment"
        subtitle={name}
        footer={<Buttons busy={busy} error={error} onCancel={onClose} onSave={save} label="Continue" />}
      >
        <Field label="Cycle"><Select value={month} onChange={setMonth} options={cycles} /></Field>
        <Field label="Mode"><Select value={mode} onChange={(v) => setMode(v as PaymentModeApi)} options={PAYMENT_MODES} /></Field>
        <PaidFromField value={paidFrom.account} onChange={pickAccount} options={paidFrom.options} />
        <Field label="Payment Category" required>
          <Select value={category} onChange={(v) => setCategory(v as PaymentCategoryApi)} options={PAYMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
          <p className="mt-1 text-[11px] text-gray-400">{PAYMENT_CATEGORIES.find((c) => c.value === category)?.hint}</p>
        </Field>
        <Field label="Record Date"><DatePicker value={date} onChange={setDate} /></Field>
        <Field label="Amount" required>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Enter amount" className="input w-full" />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter description" className="input w-full" />
        </Field>
        <p className="text-[11px] text-gray-400">This records a payment Hi-Tech made by hand (cash / bank / UPI). The system never transfers money.</p>
      </Shell>
    </Modal>
  );
}

const EARNING_NAMES = ["Allowance", "Bonus", "Incentive", "Commission", "Arrears"];
const DEDUCTION_NAMES = ["Deduction", "Damage recovery", "Canteen", "Uniform"];

/** Add a one-off earning or deduction to one or more members for a cycle. */
export function VariableDialog({
  members, onClose, onSaved,
}: {
  members: { id: number; name: string }[]; onClose: () => void; onSaved?: () => void | Promise<void>;
}) {
  const cycles = cycleOptions();
  const [kind, setKind] = useState<"EARNING" | "DEDUCTION">("EARNING");
  const [name, setName] = useState("Allowance");
  const [month, setMonth] = useState(cycles[0].value);
  const [date, setDate] = useState(todayIST());
  const [description, setDescription] = useState("");
  const [same, setSame] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const names = kind === "EARNING" ? EARNING_NAMES : DEDUCTION_NAMES;
  const valueOf = (id: number) => Number(amounts[id] ?? same) || 0;
  const total = members.reduce((a, m) => a + valueOf(m.id), 0);
  const count = members.filter((m) => valueOf(m.id) > 0).length;

  async function save() {
    if (count === 0) { setError("Enter an amount for at least one member."); return; }
    setBusy(true); setError("");
    try {
      // Group members by amount so "same for all" is one call and individual figures stay exact.
      const byAmount = new Map<number, number[]>();
      for (const m of members) {
        const v = valueOf(m.id);
        if (v > 0) byAmount.set(v, [...(byAmount.get(v) ?? []), m.id]);
      }
      for (const [amount, userIds] of byAmount) {
        await addVariablesApi({ userIds, month, kind, name, amount, entryDate: date, description: description || undefined });
      }
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <Shell
        title="Add Variable Earnings or Deductions"
        subtitle={`${members.length} staff selected`}
        footer={
          <>
            <div className="mb-2 flex justify-end gap-4 text-xs text-gray-500">
              <span>Total Staff: <b className="text-gray-800">{count}</b></span>
              <span>Total Amount: <b className="text-gray-800">{inr(total)}</b></span>
            </div>
            <Buttons busy={busy} error={error} onCancel={onClose} onSave={save} label="Save" />
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Entry Type" required>
            <Select
              value={`${kind}:${name}`}
              onChange={(v) => { const [k, n] = v.split(":"); setKind(k as "EARNING" | "DEDUCTION"); setName(n); }}
              options={[
                ...EARNING_NAMES.map((n) => ({ value: `EARNING:${n}`, label: `Earning · ${n}` })),
                ...DEDUCTION_NAMES.map((n) => ({ value: `DEDUCTION:${n}`, label: `Deduction · ${n}` })),
              ]}
            />
          </Field>
          <Field label="Name on payslip">
            <input value={name} onChange={(e) => setName(e.target.value)} list="variable-names" className="input w-full" />
            <datalist id="variable-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Cycle" required><Select value={month} onChange={setMonth} options={cycles} /></Field>
          <Field label="Date" required><DatePicker value={date} onChange={setDate} /></Field>
        </div>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="input w-full" /></Field>
        <div className="rounded-xl border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
            <span className="text-xs font-medium text-gray-600">Same amount for all</span>
            <input type="number" min={0} value={same} onChange={(e) => setSame(e.target.value)} placeholder="₹" className="input w-32 py-1 text-right" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 last:border-b-0">
                <span className="text-sm text-gray-700">{m.name}</span>
                <input
                  type="number"
                  min={0}
                  value={amounts[m.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))}
                  placeholder={same ? `₹ ${same}` : "₹"}
                  className="input w-32 py-1 text-right"
                />
              </div>
            ))}
          </div>
        </div>
      </Shell>
    </Modal>
  );
}

/**
 * Revise salary for one or more members: raise (or cut) the monthly CTC — or the day / hour rate
 * for daily and hourly staff — by a percentage or a fixed amount. Basic / HRA scale with it.
 */
export function ReviseSalaryDialog({
  profiles, names, onClose, onSaved,
}: {
  profiles: PayrollProfileResponse[]; names: Record<number, string>; onClose: () => void; onSaved?: () => void | Promise<void>;
}) {
  const [by, setBy] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [value, setValue] = useState("");
  // Arrears: a revision effective from a past cycle pays the difference for the cycles already run
  // as a one-off "Arrears" earning on the current cycle.
  const cycles = cycleOptions(7);
  const current = cycles[0].value;
  const [effective, setEffective] = useState(current);
  const backMonths = cycles.findIndex((c) => c.value === effective);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const v = Number(value) || 0;

  const revised = (p: PayrollProfileResponse) => {
    const usesRate = !!p.salary.workType;
    const cur = usesRate ? Number(p.salary.workRate) : Number(p.salary.monthlyCtc);
    const next = by === "PERCENT" ? cur * (1 + v / 100) : cur + v;
    return { usesRate, cur, next: Math.max(0, Math.round(next)) };
  };
  /** Monthly-salaried only: the difference × the cycles between the effective month and now. */
  const arrearsOf = (p: PayrollProfileResponse) => {
    const r = revised(p);
    if (r.usesRate || backMonths <= 0) return 0;
    return Math.max(0, (r.next - r.cur) * backMonths);
  };

  async function save() {
    if (v === 0) { setError("Enter the revision."); return; }
    setBusy(true); setError("");
    try {
      for (const p of profiles) {
        const r = revised(p);
        const ratio = r.cur > 0 ? r.next / r.cur : 1;
        const salary = r.usesRate
          ? { ...p.salary, workRate: r.next }
          : {
              ...p.salary,
              monthlyCtc: r.next,
              basic: Math.round(Number(p.salary.basic) * ratio),
              hra: Math.round(Number(p.salary.hra) * ratio),
              otherAllowances: Math.round(Number(p.salary.otherAllowances) * ratio),
            };
        await savePayrollProfile({ ...p, salary });
        const arrears = arrearsOf(p);
        if (arrears > 0) {
          await addVariablesApi({
            userIds: [p.userId], month: current, kind: "EARNING",
            name: `Arrears (${cycles[backMonths].label} – ${cycles[1].label})`,
            amount: arrears, entryDate: todayIST(), description: "Salary revision effective from an earlier cycle",
          });
        }
      }
      await onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to revise salary.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <Shell title="Revise Salary" subtitle={`${profiles.length} staff`} footer={<Buttons busy={busy} error={error} onCancel={onClose} onSave={save} label="Revise" />}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Revise by">
            <Select value={by} onChange={(x) => setBy(x as "PERCENT" | "AMOUNT")} options={[{ value: "PERCENT", label: "Percentage (%)" }, { value: "AMOUNT", label: "Fixed amount (₹)" }]} />
          </Field>
          <Field label={by === "PERCENT" ? "Increase %" : "Increase ₹ (negative to cut)"}>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="input w-full" />
          </Field>
          <Field label="Effective from">
            <Select value={effective} onChange={setEffective} options={cycles.map((c, i) => ({ value: c.value, label: i === 0 ? `${c.label} (current)` : c.label }))} />
          </Field>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><th className="px-3 py-2">Staff</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Revised</th>{backMonths > 0 && <th className="px-3 py-2 text-right">Arrears</th>}</tr></thead>
            <tbody>
              {profiles.map((p) => {
                const r = revised(p);
                return (
                  <tr key={p.userId} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{names[p.userId] ?? `#${p.userId}`}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{inr(r.cur)}{r.usesRate ? `/${p.salary.workType === "HOURLY" ? "hr" : p.salary.workType === "PIECE" ? "pc" : "day"}` : "/mo"}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{inr(r.next)}</td>
                    {backMonths > 0 && <td className="px-3 py-1.5 text-right text-emerald-700">{r.usesRate ? "—" : inr(arrearsOf(p))}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400">
          Takes effect from the next payroll generated. Basic, HRA and allowances scale in proportion.
          {backMonths > 0 && <> Arrears for {backMonths} past cycle{backMonths === 1 ? "" : "s"} are added to {cycles[0].label} as a one-off earning (monthly staff only).</>}
        </p>
      </Shell>
    </Modal>
  );
}
