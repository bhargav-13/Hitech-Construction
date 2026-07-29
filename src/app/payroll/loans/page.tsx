"use client";

import { useEffect, useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { computeEmi } from "@/lib/payrollApi";
import { useLoans } from "@/lib/usePayrollLive";
import { getUsers, ApiError } from "@/lib/api";
import type { LoanApi, UserResponse } from "@/lib/api";
import { inr } from "@/lib/format";
import { HandCoins, Landmark, Plus } from "lucide-react";

/** Loans — real backend, keyed by ERP member (user_id). Deducted from payroll runs as EMI. */
export default function LoansPage() {
  const { loans, loading, error, create } = useLoans();
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    getUsers(0, 200).then((r) => setMembers(r.content.filter((u) => u.onPayroll))).catch(() => setMembers([]));
  }, []);

  const totals = useMemo(() => ({
    disbursed: loans.reduce((a, l) => a + Number(l.principal), 0),
    outstanding: loans.reduce((a, l) => a + Number(l.outstanding), 0),
    monthlyEmi: loans.reduce((a, l) => a + (Number(l.outstanding) > 0 ? Number(l.emi) : 0), 0),
  }), [loans]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Loans &amp; Advances</h2>
            <p className="mt-0.5 text-sm text-gray-500">Member loans, their EMI and outstanding principal — deducted from monthly payroll.</p>
          </div>
          <button onClick={() => setCreating(true)} disabled={members.length === 0} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50">
            <Plus size={15} /> Add Loan
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Total Disbursed" value={inr(totals.disbursed)} accent="cyan" icon={HandCoins} />
          <StatCard label="Outstanding" value={inr(totals.outstanding)} accent="rose" icon={Landmark} />
          <StatCard label="Monthly EMI" value={inr(totals.monthlyEmi)} accent="gray" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : loans.length === 0 ? (
          <PayrollEmpty icon={Landmark} title="No loans yet" hint="Issue a member loan and track its EMI and outstanding." action={<button onClick={() => setCreating(true)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add Loan</button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loans.map((l) => <LoanCard key={l.id} loan={l} />)}
          </div>
        )}
      </div>

      {creating && (
        <LoanDialog
          members={members}
          onClose={() => setCreating(false)}
          onCreate={async (body) => {
            try {
              await create(body);
              setCreating(false);
            } catch (err) {
              setActionError(err instanceof ApiError ? err.message : "Unable to save this loan.");
            }
          }}
        />
      )}
    </PayrollShell>
  );
}

function LoanCard({ loan: l }: { loan: LoanApi }) {
  const repaid = Number(l.principal) > 0 ? Math.round(((Number(l.principal) - Number(l.outstanding)) / Number(l.principal)) * 100) : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-800">{l.name}</h3>
          <p className="truncate text-xs text-gray-400">{l.memberName}</p>
        </div>
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{l.annualRate}% · {l.interestType}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><div className="text-[11px] tracking-wide text-gray-400 uppercase">Outstanding</div><div className="font-semibold text-rose-600">{inr(l.outstanding)}</div></div>
        <div><div className="text-[11px] tracking-wide text-gray-400 uppercase">EMI</div><div className="font-medium text-gray-800">{inr(l.emi)}</div></div>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-gray-400"><span>Repaid</span><span>{repaid}%</span></div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-accent transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, repaid))}%` }} /></div>
      </div>
    </div>
  );
}

function LoanDialog({
  members,
  onClose,
  onCreate,
}: {
  members: UserResponse[];
  onClose: () => void;
  onCreate: (body: {
    userId: number;
    name: string;
    description: string | null;
    principal: number;
    tenureMonths: number;
    annualRate: number;
    interestType: "FLAT" | "SIMPLE" | "COMPOUND";
    disbursementDate: string;
    startMonth: string;
    emi: number;
    outstanding: number;
  }) => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [principal, setPrincipal] = useState(0);
  const [tenure, setTenure] = useState(12);
  const [annualRate, setAnnualRate] = useState(0);
  const [interestType, setInterestType] = useState<"FLAT" | "SIMPLE" | "COMPOUND">("FLAT");
  const [disbursementDate, setDisbursementDate] = useState(new Date().toISOString().slice(0, 10));
  const [startMonth, setStartMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const emi = computeEmi(principal, annualRate, tenure, interestType);

  async function save() {
    if (!userId) { setError("Select a member."); return; }
    if (!name.trim()) { setError("Loan name is required."); return; }
    if (!principal) { setError("Enter a principal amount."); return; }
    setSaving(true);
    setError("");
    try {
      await onCreate({
        userId: Number(userId),
        name: name.trim(),
        description: description.trim() || null,
        principal,
        tenureMonths: tenure,
        annualRate,
        interestType,
        disbursementDate,
        startMonth,
        emi,
        outstanding: principal,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title="New Loan" onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save Loan"} width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <F label="Member" required>
          <Select
            value={userId}
            onChange={setUserId}
            placeholder="Select member"
            options={[{ value: "", label: "Select member" }, ...members.map((m) => ({ value: String(m.id), label: m.fullName }))]}
          />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Loan Name" required><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Vehicle Advance" /></F>
          <F label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="optional" /></F>
          <F label="Principal (₹)" required><input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} className="input" /></F>
          <F label="Tenure (months)"><input type="number" value={tenure} onChange={(e) => setTenure(Number(e.target.value))} className="input" /></F>
          <F label="Annual Rate (%)"><input type="number" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value))} className="input" /></F>
          <F label="Interest Type"><Select value={interestType} onChange={(v) => setInterestType(v as typeof interestType)} options={[{ value: "FLAT", label: "Flat Rate" }, { value: "SIMPLE", label: "Simple Interest" }, { value: "COMPOUND", label: "Reducing Balance" }]} /></F>
          <F label="Disbursement Date"><DatePicker value={disbursementDate} onChange={setDisbursementDate} placeholder="Date" /></F>
          <F label="Instalment Start"><input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="input" /></F>
        </div>

        {principal > 0 && tenure > 0 && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
            <div className="text-[11px] font-semibold tracking-wide text-brand-accent uppercase">Monthly Instalment Preview</div>
            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-[11px] text-gray-400">Principal</div><div className="font-semibold text-gray-800">{inr(principal)}</div></div>
              <div><div className="text-[11px] text-gray-400">Tenure</div><div className="font-semibold text-gray-800">{tenure} Months</div></div>
              <div><div className="text-[11px] text-gray-400">Monthly EMI</div><div className="font-semibold text-brand-accent">{inr(emi)}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">Total repayment {inr(emi * tenure)} · Interest {inr(Math.max(0, emi * tenure - principal))}</div>
          </div>
        )}
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
