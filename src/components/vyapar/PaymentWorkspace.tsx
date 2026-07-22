"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { inr } from "@/lib/format";
import { useVyaparBankId, usePaymentTypeOptions } from "@/lib/bankScope";
import { downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Party, Payment } from "@/lib/vyaparApi";
import { Download, FileText, Plus, Search, Trash2, Wallet } from "lucide-react";

/**
 * Payment-In / Payment-Out workspace. Unlike an invoice, a payment moves money directly: a
 * party-level Payment-In reduces that party's receivable (and feeds the dashboard). We deliberately
 * create it WITHOUT an invoice link — the backend would otherwise count the amount twice (once on
 * the payment, once on the settled invoice) in the party balance.
 */
export function PaymentWorkspace({
  direction,
  title,
}: {
  direction: "IN" | "OUT";
  title: string;
}) {
  const params = useSearchParams();
  const bankAccountId = useVyaparBankId();
  const isIn = direction === "IN";
  const [payments, setPayments] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pays, pty] = await Promise.all([
        vyapar.getPayments(direction, bankAccountId),
        vyapar.getParties(undefined, bankAccountId),
      ]);
      setPayments(pays);
      setParties(pty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load payments.");
    } finally {
      setLoading(false);
    }
  }, [direction, bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params?.get("new") === "1") setCreating(true);
  }, [params]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (!q) return true;
      return [p.partyName, p.reference, p.paymentDate, p.mode].some((f) => f?.toLowerCase().includes(q));
    });
  }, [payments, search]);

  const total = useMemo(() => rows.reduce((s, p) => s + p.amount, 0), [rows]);

  async function remove(p: Payment) {
    if (!confirm(`Delete this payment of ${inr(p.amount)}? The party balance will be restored.`)) return;
    try {
      await vyapar.deletePayment(p.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this payment.");
    }
  }

  function exportCsv() {
    const head = ["Date", "Party", "Amount", "Payment Type", "Reference"];
    const lines = rows.map((p) => [p.paymentDate ?? "", p.partyName ?? "", p.amount, p.mode, p.reference ?? ""]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-${direction.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() =>
              downloadPdf(
                title,
                ["Date", "Party", "Payment Type", "Reference", "Amount"],
                rows.map((p) => [formatDate(p.paymentDate), p.partyName ?? "", p.mode, p.reference ?? "", inr(p.amount)]),
                { rightAlignFrom: 4 }
              )
            }
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
          >
            <Plus size={15} /> Add {title}
          </button>
        </div>
      </div>

      {/* Summary — mirrors Vyapar's "Total Amount / Received" card */}
      <div className="inline-flex flex-wrap gap-6 rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div>
          <div className="text-xs text-gray-500">Total Amount</div>
          <div className="mt-1 text-2xl font-semibold text-gray-800">{inr(total)}</div>
        </div>
        <div className="border-l border-gray-100 pl-6 text-sm">
          <div className="text-gray-500">
            {isIn ? "Received" : "Paid"}: <span className="font-medium text-emerald-600">{inr(total)}</span>
          </div>
          <div className="mt-1 text-gray-500">
            Count: <span className="font-medium text-gray-700">{rows.length}</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party, reference or mode…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <VyaparEmpty
          icon={Wallet}
          title={payments.length === 0 ? `No ${title.toLowerCase()} yet` : "Nothing matches"}
          hint={payments.length === 0 ? "Record a payment to update the party's balance." : "Try a different search."}
          action={
            payments.length === 0 ? (
              <button onClick={() => setCreating(true)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
                + Add {title}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Party Name</th>
                <th className="px-4 py-2 font-medium">Payment Type</th>
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
                  <td className="px-4 py-2.5 text-gray-600">{p.mode}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.reference || "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                    {inr(p.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex">
                      <RowMenu align="right" buttonLabel="Payment actions">
                        {(close) => (
                          <>
                            <RowMenuDivider />
                            <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); remove(p); }} />
                          </>
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

      {creating && (
        <PaymentForm
          direction={direction}
          title={title}
          parties={parties}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

/** Record a standalone party payment (no invoice link — see the note on PaymentWorkspace). */
function PaymentForm({
  direction,
  title,
  parties,
  onClose,
  onSaved,
}: {
  direction: "IN" | "OUT";
  title: string;
  parties: Party[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bankAccountId = useVyaparBankId();
  const paymentTypeOptions = usePaymentTypeOptions();

  const selectedParty = parties.find((p) => String(p.id) === partyId) ?? null;

  async function save() {
    if (!partyId) {
      setError("Select a party.");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.createPayment({
        direction,
        partyId: Number(partyId),
        invoiceId: null, // party-level payment — keeps the balance effect single-counted
        amount: Number(amount) || 0,
        mode,
        reference: reference || null,
        paymentDate,
        bankAccountId: bankAccountId ?? null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record this payment.");
      setSaving(false);
    }
  }

  const isIn = direction === "IN";

  return (
    <Drawer title={title} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save"}>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div>
          <DrawerField label="Party" required>
            <Select
              value={partyId}
              onChange={setPartyId}
              placeholder="Search by name"
              options={[{ value: "", label: "Select party" }, ...parties.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
          </DrawerField>
          {selectedParty && (
            <div className={`mt-1 text-xs font-medium ${selectedParty.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              Bal: {inr(Math.abs(selectedParty.balance))} {selectedParty.balance >= 0 ? "to receive" : "to pay"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DrawerField label={isIn ? "Received" : "Paid"} required>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" autoFocus />
          </DrawerField>
          <DrawerField label="Date">
            <DatePicker value={paymentDate} onChange={setPaymentDate} placeholder="Payment date" />
          </DrawerField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Payment Type">
            <Select value={mode} onChange={setMode} options={paymentTypeOptions} />
          </DrawerField>
          <DrawerField label="Reference No.">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="NEFT / cheque no" />
          </DrawerField>
        </div>

        {selectedParty && amount > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{selectedParty.name}&apos;s balance after this {isIn ? "receipt" : "payment"}</span>
              <span className="font-semibold text-gray-800">
                {inr(Math.abs(selectedParty.balance - (isIn ? amount : -amount)))}
              </span>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}
