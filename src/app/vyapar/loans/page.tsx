"use client";

import { useCallback, useEffect, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { LoanAccount } from "@/lib/vyaparApi";
import { FileSpreadsheet, FileText, Landmark, Plus } from "lucide-react";

/** Loan Accounts — outstanding principal, EMI and interest per lender. */
export default function LoanAccountsPage() {
  const [loans, setLoans] = useState<LoanAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLoans(await vyapar.getLoanAccounts());
    } catch {
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalOutstanding = loans.reduce((s, l) => s + l.balance, 0);
  const totalEmi = loans.reduce((s, l) => s + l.emiAmount, 0);
  const head = ["Loan", "Lender", "Account No", "Loan Amount", "Outstanding", "Rate %", "EMI"];
  const data = loans.map((l) => [l.name, l.lender ?? "", l.accountNumber ?? "", l.loanAmount, l.balance, l.interestRate, l.emiAmount]);

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Loan Accounts</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Outstanding <span className="font-medium text-rose-600">{inr(totalOutstanding)}</span> · Monthly EMI{" "}
              <span className="font-medium text-gray-700">{inr(totalEmi)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportRowsToCsv("loan-accounts", head, data)}
              disabled={loans.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <button
              onClick={() =>
                downloadPdf("Loan Accounts", head, loans.map((l) => [l.name, l.lender ?? "", l.accountNumber ?? "", inr(l.loanAmount), inr(l.balance), `${l.interestRate}%`, inr(l.emiAmount)]), { rightAlignFrom: 3, landscape: true })
              }
              disabled={loans.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
            >
              <FileText size={14} /> PDF
            </button>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
            >
              <Plus size={15} /> Add Loan
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : loans.length === 0 ? (
          <VyaparEmpty
            icon={Landmark}
            title="No loan accounts"
            hint="Track business loans, their EMI and outstanding principal."
            action={
              <button onClick={() => setCreating(true)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95">
                + Add Loan
              </button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loans.map((l) => {
              const paid = l.loanAmount > 0 ? Math.round(((l.loanAmount - l.balance) / l.loanAmount) * 100) : 0;
              return (
                <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-150 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-gray-800">{l.name}</h3>
                      {l.lender && <p className="truncate text-xs text-gray-400">{l.lender}</p>}
                    </div>
                    <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{l.interestRate}%</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-[11px] tracking-wide text-gray-400 uppercase">Outstanding</div>
                      <div className="font-semibold text-rose-600">{inr(l.balance)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] tracking-wide text-gray-400 uppercase">EMI</div>
                      <div className="font-medium text-gray-800">{inr(l.emiAmount)}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                      <span>Repaid</span>
                      <span>{paid}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand-accent transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, paid))}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && <LoanDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </VyaparShell>
  );
}

function LoanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [lender, setLender] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loanAmount, setLoanAmount] = useState(0);
  const [interestRate, setInterestRate] = useState(0);
  const [termMonths, setTermMonths] = useState(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Standard reducing-balance EMI so the figure matches what the lender quotes.
  const emi = (() => {
    const p = Number(loanAmount) || 0;
    const n = Number(termMonths) || 0;
    const r = (Number(interestRate) || 0) / 12 / 100;
    if (!p || !n) return 0;
    if (!r) return p / n;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  })();

  async function submit() {
    if (!name.trim()) {
      setError("Loan name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.createLoanAccount({
        name: name.trim(),
        lender: lender.trim() || null,
        accountNumber: accountNumber.trim() || null,
        loanAmount: Number(loanAmount) || 0,
        balance: Number(loanAmount) || 0,
        interestRate: Number(interestRate) || 0,
        termMonths: Number(termMonths) || 0,
        startDate,
        emiAmount: Math.round(emi),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this loan.");
      setSaving(false);
    }
  }

  return (
    <Drawer title="Add Loan Account" onClose={onClose} onSave={submit} saveLabel={saving ? "Saving…" : "Save"} width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <F label="Loan Name" required><input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus /></F>
          <F label="Lender"><input value={lender} onChange={(e) => setLender(e.target.value)} className="input" /></F>
          <F label="Account Number"><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="input font-mono" /></F>
          <F label="Loan Amount"><input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="input" /></F>
          <F label="Interest Rate (% p.a.)"><input type="number" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} className="input" /></F>
          <F label="Term (months)"><input type="number" value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))} className="input" /></F>
          <F label="Start Date"><DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" /></F>
        </div>
        {emi > 0 && (
          <div className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-brand-accent">
            Estimated EMI <span className="font-semibold">{inr(Math.round(emi))}</span> / month
          </div>
        )}
      </div>
    </Drawer>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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
