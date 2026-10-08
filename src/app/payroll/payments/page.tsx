"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { AddPaymentDialog, PAYMENT_CATEGORIES, PAYMENT_MODES, cycleOptions } from "@/components/payroll/PayrollDialogs";
import { ApiError, deletePaymentApi, getPaymentsApi, getPayrollPeople, syncPayrollToVyapar } from "@/lib/api";
import type { PaymentApi, UserResponse } from "@/lib/api";
import { formatDateIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { exportRowsToCsv, exportRowsToXlsx } from "@/lib/vyaparExport";
import { Banknote, FileSpreadsheet, Plus, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { downloadPaymentVoucher } from "@/lib/payslipExport";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";

/**
 * Payments — every payment recorded to staff (PagarBook's Payment Logs): salary, advances,
 * bonuses, general payments and adjustments, by cycle. Advances are recovered from that month's
 * payslip; salary payments recorded by a payroll run settle it. Nothing here moves money.
 */
const PAYMENT_SORT = {
  date: (p: PaymentApi) => p.recordDate,
  staff: (p: PaymentApi) => p.memberName,
  cycle: (p: PaymentApi) => p.month,
  category: (p: PaymentApi) => p.category,
  mode: (p: PaymentApi) => p.mode,
  description: (p: PaymentApi) => p.description ?? "",
  amount: (p: PaymentApi) => Number(p.amount),
};

export default function PaymentsPage() {
  const cycles = cycleOptions(12);
  const [month, setMonth] = useState(cycles[0].value);
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PaymentApi[] | null>(null);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [payFor, setPayFor] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    try { setRows(await getPaymentsApi({ month: month === "all" ? undefined : month })); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payments."); setRows([]); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getPayrollPeople().then((r) => setMembers(r.content.filter((u) => u.onPayroll))).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((p) =>
      (category === "all" || p.category === category)
      && (mode === "all" || p.mode === mode)
      && (!q || p.memberName.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)));
  }, [rows, category, mode, search]);
  const { sorted, sortKey, sortDir, toggle } = useTableSort(filtered, PAYMENT_SORT, { key: "date", dir: "desc" });
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const p of filtered) t[p.category] = (t[p.category] ?? 0) + Number(p.amount);
    return t;
  }, [filtered]);

  async function remove(p: PaymentApi) {
    if (!confirm(`Delete this ${p.category.toLowerCase()} entry of ${inr(p.amount)} for ${p.memberName}?`)) return;
    try { await deletePaymentApi(p.id); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }

  const head = ["Date", "Cycle", "Staff", "Category", "Mode", "Amount", "Description", "Recorded by"];
  const data = filtered.map((p) => [p.recordDate, p.month, p.memberName, p.category, p.mode, Number(p.amount), p.description ?? "", p.createdByName ?? ""]);
  const member = members.find((m) => String(m.id) === payFor);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Payments</h2>
            <p className="mt-0.5 text-sm text-gray-500">Salary, advances, bonuses and adjustments recorded to staff — a record only, no money moves.</p>
          </div>
          <div className="flex items-center gap-2">
            <SyncToVyapar />
            <div className="w-56">
              <Select value={payFor} onChange={setPayFor} placeholder="Pick staff to pay…" options={members.map((m) => ({ value: String(m.id), label: m.fullName }))} />
            </div>
            <button
              onClick={() => member && setAdding(true)}
              disabled={!member}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={14} /> Add Payment
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PAYMENT_CATEGORIES.map((c) => (
            <StatCard key={c.value} label={c.label} value={inr(totals[c.value] ?? 0)} accent={c.value === "ADVANCE" ? "amber" : c.value === "SALARY" ? "green" : "gray"} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44"><Select value={month} onChange={setMonth} options={[{ value: "all", label: "All cycles" }, ...cycles]} /></div>
          <div className="w-48"><Select value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, ...PAYMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} /></div>
          <div className="w-40"><Select value={mode} onChange={setMode} options={[{ value: "all", label: "All modes" }, ...PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))]} /></div>
          <button onClick={() => exportRowsToXlsx("payment-logs", head, data, [], { title: "Payment Logs" })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><FileSpreadsheet size={14} /> Excel</button>
          <button onClick={() => exportRowsToCsv("payment-logs", head, data)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">CSV</button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {rows === null ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <PayrollEmpty icon={Banknote} title="No payments recorded" hint="Record an advance or a payment from here, a staff profile, or the payroll Payment tab." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Staff" sortKey="staff" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Cycle" sortKey="cycle" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Mode" sortKey="mode" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Description" sortKey="description" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><th />
              </tr></thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-2.5">{formatDateIST(p.recordDate)}</td>
                    <td className="px-4 py-2.5"><Link href={`/payroll/staff/${p.userId}#payments`} className="font-medium text-gray-800 hover:text-brand-accent hover:underline">{p.memberName}</Link></td>
                    <td className="px-4 py-2.5 text-gray-600">{p.month}</td>
                    <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${p.category === "ADVANCE" ? "bg-amber-50 text-amber-700" : p.category === "SALARY" ? "bg-emerald-50 text-emerald-700" : p.category === "BONUS" ? "bg-violet-50 text-violet-700" : p.category === "FNF" ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-600"}`}>{PAYMENT_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category}</span></td>
                    <td className="px-4 py-2.5 text-gray-600">{p.mode}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.description ?? "—"}{p.createdByName ? ` · by ${p.createdByName}` : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{inr(p.amount)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <button onClick={() => downloadPaymentVoucher(p, p.memberName)} title="Download voucher" className="rounded p-1 text-gray-400 hover:bg-cyan-50 hover:text-brand-accent"><Printer size={14} /></button>
                      <button onClick={() => remove(p)} title="Delete" className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && member && <AddPaymentDialog userId={member.id} name={member.fullName} onClose={() => setAdding(false)} onSaved={load} />}
    </PayrollShell>
  );
}

/**
 * Re-post every payroll entry onto the staff members' Vyapar ledgers. Payroll posts as it goes;
 * this is the catch-up — the first run backfills history, later runs repair anything that failed.
 */
function SyncToVyapar() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true); setMsg("");
    try {
      const r = await syncPayrollToVyapar();
      setMsg(`Synced ${r.staffParties ?? 0} staff ledgers · ${r.payments ?? 0} payments · ${r.runs ?? 0} runs · ${r.claims ?? 0} claims · ${r.loans ?? 0} loans`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative">
      <button
        onClick={run}
        disabled={busy}
        title="Post every payroll payment, salary due, claim and loan to the staff members' Vyapar party ledgers"
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <Spinner size={14} /> : <RefreshCw size={14} />} Sync to Vyapar
      </button>
      {msg && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600 shadow-lg">
          {msg}
          <button onClick={() => setMsg("")} className="ml-2 font-medium text-brand-accent">OK</button>
        </div>
      )}
    </div>
  );
}
