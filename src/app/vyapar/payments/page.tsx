"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import { useVyaparBankId, usePaymentTypeOptions } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Party, Payment } from "@/lib/vyaparApi";
import { ArrowDownLeft, ArrowUpRight, Plus, Search, Trash2, Wallet } from "lucide-react";

export default function VyaparPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<"All" | "IN" | "OUT">("All");
  const [creating, setCreating] = useState<"IN" | "OUT" | null>(null);
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pays, pts] = await Promise.all([
        vyapar.getPayments(undefined, bankAccountId),
        vyapar.getParties(undefined, bankAccountId),
      ]);
      setPayments(pays);
      setParties(pts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load payments.");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (dir !== "All" && p.direction !== dir) return false;
      if (!q) return true;
      return [p.partyName, p.reference, p.mode].some((f) => f?.toLowerCase().includes(q));
    });
  }, [payments, search, dir]);

  const totals = useMemo(() => {
    const inSum = payments.filter((p) => p.direction === "IN").reduce((s, p) => s + p.amount, 0);
    const outSum = payments.filter((p) => p.direction === "OUT").reduce((s, p) => s + p.amount, 0);
    return { inSum, outSum, net: inSum - outSum };
  }, [payments]);

  async function remove(p: Payment) {
    if (!confirm(`Delete this ${p.direction === "IN" ? "receipt" : "payment"} of ${inr(p.amount)}?`)) return;
    try {
      await vyapar.deletePayment(p.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this payment.");
    }
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Cash &amp; Bank</h2>
            <p className="mt-0.5 text-sm text-gray-500">Money received from customers and paid to suppliers.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreating("IN")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-emerald-700 active:scale-95"
            >
              <Plus size={15} /> Payment-In
            </button>
            <button
              onClick={() => setCreating("OUT")}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
            >
              <Plus size={15} /> Payment-Out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Total Received" value={inr(totals.inSum)} tone="in" />
          <Kpi label="Total Paid" value={inr(totals.outSum)} tone="out" />
          <Kpi label="Net Cash Flow" value={inr(totals.net)} tone={totals.net >= 0 ? "in" : "out"} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search party, reference or mode…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          {(["All", "IN", "OUT"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                dir === d ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {d === "All" ? "All" : d === "IN" ? "Received" : "Paid"}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <VyaparEmpty icon={Wallet} title="No payments recorded" hint="Record money in or out to track your cash position." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Party</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Mode</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="w-10 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{p.partyName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${p.direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {p.direction === "IN" ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                        {p.direction === "IN" ? "Received" : "Paid"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{p.mode}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.reference || "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${p.direction === "IN" ? "text-emerald-600" : "text-rose-600"}`}>
                      {p.direction === "IN" ? "+" : "−"}{inr(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex">
                        <RowMenu align="right" buttonLabel="Payment actions">
                          {(close) => (
                            <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); remove(p); }} />
                          )}
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <StandalonePaymentDrawer
          direction={creating}
          parties={parties}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); load(); }}
        />
      )}
    </VyaparShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "in" | "out" }) {
  const Icon = tone === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
      </div>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
        <Icon size={18} />
      </span>
    </div>
  );
}

function StandalonePaymentDrawer({
  direction,
  parties,
  onClose,
  onSaved,
}: {
  direction: "IN" | "OUT";
  parties: Party[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bankAccountId = useVyaparBankId();
  const paymentTypeOptions = usePaymentTypeOptions();

  async function save() {
    if (!amount) {
      setError("Enter an amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.createPayment({
        direction,
        partyId: partyId ? Number(partyId) : null,
        amount: Number(amount),
        mode,
        reference: reference || null,
        notes: notes || null,
        paymentDate,
        bankAccountId: bankAccountId ?? null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record this payment.");
      setSaving(false);
    }
  }

  const relevant = parties.filter((p) => (direction === "OUT" ? p.partyType === "SUPPLIER" : p.partyType === "CUSTOMER"));

  return (
    <Drawer
      title={direction === "IN" ? "Payment-In" : "Payment-Out"}
      onClose={onClose}
      onSave={save}
      saveLabel={saving ? "Saving…" : "Save"}
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label={direction === "IN" ? "Received From" : "Paid To"}>
          <Select
            value={partyId}
            onChange={setPartyId}
            placeholder="Select party"
            options={[{ value: "", label: "No party" }, ...(relevant.length ? relevant : parties).map((p) => ({ value: String(p.id), label: p.name }))]}
          />
        </DrawerField>
        <DrawerField label="Amount" required>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" />
        </DrawerField>
        <DrawerField label="Date">
          <DatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Payment date" />
        </DrawerField>
        <DrawerField label="Mode">
          <Select value={mode} onChange={setMode} options={paymentTypeOptions} />
        </DrawerField>
        <DrawerField label="Reference">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="NEFT / cheque no" />
        </DrawerField>
        <DrawerField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </DrawerField>
      </div>
    </Drawer>
  );
}

function formatDate(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
