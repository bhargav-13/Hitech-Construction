"use client";

import { useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { inr } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { BankAccount } from "@/lib/vyaparApi";
import { Info, Plus } from "lucide-react";

/** Add / edit a bank account — mirrors Vyapar's "Add Bank Account" screen. */
export function BankAccountDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: BankAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [openingBalance, setOpeningBalance] = useState(existing?.openingBalance ?? 0);
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? new Date().toISOString().slice(0, 10));
  const [more, setMore] = useState(!!existing?.accountNumber);
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? "");
  const [ifsc, setIfsc] = useState(existing?.ifsc ?? "");
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [accountHolder, setAccountHolder] = useState(existing?.accountHolder ?? "");
  const [upiId, setUpiId] = useState(existing?.upiId ?? "");
  const [printUpiQr, setPrintUpiQr] = useState(existing?.printUpiQr ?? false);
  const [printBankDetails, setPrintBankDetails] = useState(existing?.printBankDetails ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) {
      setError("Account display name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: Partial<BankAccount> = {
        name: name.trim(),
        openingBalance: Number(openingBalance) || 0,
        openingDate,
        accountNumber: accountNumber.trim() || null,
        ifsc: ifsc.trim().toUpperCase() || null,
        bankName: bankName.trim() || null,
        accountHolder: accountHolder.trim() || null,
        upiId: upiId.trim() || null,
        printUpiQr,
        printBankDetails,
      };
      if (existing) await vyapar.updateBankAccount(existing.id, body);
      else await vyapar.createBankAccount(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this account.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? "Edit Bank Account" : "Add Bank Account"}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "Saving…" : "Save Details"}
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Account Display Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          </Field>
          <Field label="Opening Balance">
            <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} className="input" />
          </Field>
          <Field label="As of Date">
            <DatePicker value={openingDate} onChange={setOpeningDate} placeholder="As of date" />
          </Field>
        </div>

        {more ? (
          <div className="animate-fade-in grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Account Number">
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="input font-mono" />
            </Field>
            <Field label="IFSC Code">
              <input value={ifsc} onChange={(e) => setIfsc(e.target.value)} className="input font-mono uppercase" maxLength={11} />
            </Field>
            <Field label="Bank Name">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" />
            </Field>
            <Field label="Account Holder Name">
              <input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} className="input" />
            </Field>
            <Field label="UPI ID">
              <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@bank" className="input" />
            </Field>
          </div>
        ) : (
          <button
            onClick={() => setMore(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-accent transition-colors duration-150 hover:underline"
          >
            <Plus size={14} /> Add more fields
          </button>
        )}

        <div className="space-y-2">
          <Check
            label="Print offline UPI QR on Invoices"
            hint="Only UPI, no automatic reconciliation."
            checked={printUpiQr}
            onChange={setPrintUpiQr}
          />
          <Check
            label="Print Bank Details on Invoices"
            hint="Shows account number and IFSC on the printed invoice."
            checked={printBankDetails}
            onChange={setPrintBankDetails}
          />
        </div>
      </div>
    </Drawer>
  );
}

/** Bank↔cash / bank↔bank transfers and balance adjustments — Vyapar's Deposit/Withdraw menu. */
export function CashBankEntryDialog({
  kind,
  accounts,
  currentAccountId,
  currentBalance,
  onClose,
  onDone,
}: {
  kind: "BANK_TO_CASH" | "CASH_TO_BANK" | "BANK_TO_BANK" | "ADJUST_BANK" | "ADJUST_CASH";
  accounts: BankAccount[];
  currentAccountId?: number | null;
  currentBalance?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const TITLES: Record<typeof kind, string> = {
    BANK_TO_CASH: "Bank to Cash Transfer",
    CASH_TO_BANK: "Cash to Bank Transfer",
    BANK_TO_BANK: "Bank to Bank Transfer",
    ADJUST_BANK: "Adjust Bank Balance",
    ADJUST_CASH: "Adjust Cash",
  };
  const isAdjust = kind === "ADJUST_BANK" || kind === "ADJUST_CASH";

  const [mode, setMode] = useState<"ADD" | "REDUCE">("ADD");
  const [amount, setAmount] = useState(0);
  const [fromAccountId, setFromAccountId] = useState(currentAccountId ? String(currentAccountId) : "");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updated =
    currentBalance == null ? null : mode === "ADD" ? currentBalance + (Number(amount) || 0) : currentBalance - (Number(amount) || 0);

  async function submit() {
    if (!amount || Number(amount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (kind === "BANK_TO_BANK" && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) {
      setError("Pick two different accounts.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.postCashBankEntry({
        kind,
        amount: Number(amount),
        date,
        description: description.trim() || undefined,
        mode: isAdjust ? mode : undefined,
        fromAccountId: fromAccountId ? Number(fromAccountId) : null,
        toAccountId: toAccountId ? Number(toAccountId) : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this entry.");
      setSaving(false);
    }
  }

  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: a.name }));

  return (
    <Drawer title={TITLES[kind]} onClose={onClose} onSave={submit} saveLabel={saving ? "Saving…" : "Save"} width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {isAdjust && (
          <div className="flex gap-4">
            {(["ADD", "REDUCE"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="h-4 w-4 accent-cyan-600"
                />
                <span className={mode === m ? "font-medium text-gray-800" : "text-gray-600"}>
                  {m === "ADD" ? (kind === "ADJUST_CASH" ? "Add Cash" : "Increase Balance") : kind === "ADJUST_CASH" ? "Reduce Cash" : "Reduce Balance"}
                </span>
              </label>
            ))}
          </div>
        )}

        {kind === "BANK_TO_BANK" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="From Account" required>
              <Select value={fromAccountId} onChange={setFromAccountId} placeholder="Select" options={[{ value: "", label: "Select" }, ...accountOptions]} />
            </Field>
            <Field label="To Account" required>
              <Select value={toAccountId} onChange={setToAccountId} placeholder="Select" options={[{ value: "", label: "Select" }, ...accountOptions]} />
            </Field>
          </div>
        )}

        {(kind === "BANK_TO_CASH" || kind === "CASH_TO_BANK" || kind === "ADJUST_BANK") && (
          <Field label={kind === "CASH_TO_BANK" ? "To Bank Account" : "Bank Account"} required>
            <Select value={fromAccountId} onChange={setFromAccountId} placeholder="Select" options={[{ value: "", label: "Select" }, ...accountOptions]} />
          </Field>
        )}

        <Field label="Enter Amount" required>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" autoFocus />
        </Field>

        {updated != null && (
          <p className="text-xs text-gray-500">
            Updated balance: <span className={`font-medium ${updated < 0 ? "text-rose-600" : "text-gray-800"}`}>{inr(updated)}</span>
          </p>
        )}

        <Field label={isAdjust ? "Adjustment Date" : "Transfer Date"}>
          <DatePicker value={date} onChange={setDate} placeholder="Date" />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter Description" className="input" />
        </Field>
      </div>
    </Drawer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1.5 transition-colors duration-150 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-600" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm text-gray-700">
          {label}
          <Info size={11} className="text-gray-300" />
        </span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
