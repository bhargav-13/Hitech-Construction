"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { TAX_RATES } from "@/lib/useItemSettings";
import { inr } from "@/lib/format";
import { useVyaparBankId, usePaymentTypeOptions } from "@/lib/bankScope";
import { downloadPdf } from "@/lib/vyaparExport";
import * as vyapar from "@/lib/vyaparApi";
import type { Invoice, Party } from "@/lib/vyaparApi";
import { FileText, Plus, Receipt, Search, Trash2, X } from "lucide-react";
const UNCATEGORISED = "Uncategorised";

/**
 * Expenses — Vyapar's category-first view. Each expense is an EXPENSE invoice whose category we
 * keep in `notes` (the backend has no dedicated column yet). The left rail groups spend by category;
 * the right pane lists that category's transactions.
 */
export function ExpenseWorkspace() {
  const params = useSearchParams();
  const bankAccountId = useVyaparBankId();
  const [expenses, setExpenses] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, pty] = await Promise.all([
        vyapar.getInvoices("EXPENSE", bankAccountId),
        vyapar.getParties(undefined, bankAccountId),
      ]);
      setExpenses(inv);
      setParties(pty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load expenses.");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params?.get("new") === "1") setCreating(true);
  }, [params]);

  const catOf = (e: Invoice) => e.notes?.trim() || UNCATEGORISED;

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(catOf(e), (map.get(catOf(e)) ?? 0) + e.total);
    const q = search.trim().toLowerCase();
    return [...map.entries()]
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [expenses, search]);

  // Keep a valid selection as data/filters change.
  useEffect(() => {
    setSelectedCat((cur) => (categories.some((c) => c.name === cur) ? cur : categories[0]?.name ?? null));
  }, [categories]);

  const catNames = useMemo(
    () => [...new Set(expenses.map(catOf))].sort((a, b) => a.localeCompare(b)),
    [expenses]
  );

  const rows = useMemo(() => expenses.filter((e) => catOf(e) === selectedCat), [expenses, selectedCat]);
  const catTotals = useMemo(() => {
    const total = rows.reduce((s, e) => s + e.total, 0);
    const balance = rows.reduce((s, e) => s + e.balance, 0);
    return { total, balance };
  }, [rows]);

  const grandTotal = useMemo(() => expenses.reduce((s, e) => s + e.total, 0), [expenses]);

  async function remove(e: Invoice) {
    if (!confirm(`Delete this expense of ${inr(e.total)}?`)) return;
    try {
      await vyapar.deleteInvoice(e.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this expense.");
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Expenses</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {categories.length} categories · Total spend <span className="font-medium text-gray-700">{inr(grandTotal)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              downloadPdf(
                "Expenses",
                ["Date", "Category", "Exp No.", "Party", "Payment Type", "Amount", "Balance", "Status"],
                expenses.map((e) => [formatDate(e.invoiceDate), catOf(e), e.invoiceNo || "—", e.partyName ?? "—", e.paymentType, inr(e.total), inr(e.balance), e.status]),
                { rightAlignFrom: 5, subtitle: `Total spend ${inr(grandTotal)}` }
              )
            }
            disabled={expenses.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-700 active:scale-95"
          >
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading expenses…
        </div>
      ) : expenses.length === 0 ? (
        <VyaparEmpty
          icon={Receipt}
          title="No expenses yet"
          hint="Record your first business expense — rent, fuel, wages and more."
          action={
            <button onClick={() => setCreating(true)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
              + Add Expense
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Category rail */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 p-3">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
                <Search size={15} className="text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search category"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase">
              <span>Category</span>
              <span>Amount</span>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {categories.map((c) => {
                const active = c.name === selectedCat;
                return (
                  <button
                    key={c.name}
                    onClick={() => setSelectedCat(c.name)}
                    className={`flex w-full items-center justify-between gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
                      active ? "bg-cyan-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className={`truncate text-sm ${active ? "font-medium text-brand-accent" : "text-gray-700"}`}>{c.name}</span>
                    <span className="shrink-0 text-sm text-gray-600">{inr(c.amount)}</span>
                  </button>
                );
              })}
              {categories.length === 0 && <div className="px-3 py-10 text-center text-sm text-gray-400">No categories match.</div>}
            </div>
          </div>

          {/* Category detail */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{selectedCat ?? "—"}</h3>
                <p className="text-sm text-gray-400">Expense category</p>
              </div>
              <div className="text-right text-sm">
                <div className="text-gray-500">Total: <span className="font-semibold text-gray-800">{inr(catTotals.total)}</span></div>
                <div className="mt-0.5 text-gray-500">Balance: <span className={`font-semibold ${catTotals.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inr(catTotals.balance)}</span></div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Exp No.</th>
                    <th className="px-4 py-2 font-medium">Party</th>
                    <th className="px-4 py-2 font-medium">Payment Type</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-right font-medium">Balance</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="w-10 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(e.invoiceDate)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.invoiceNo || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700">{e.partyName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.paymentType}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">{inr(e.total)}</td>
                      <td className={`px-4 py-2.5 text-right ${e.balance > 0 ? "font-medium text-rose-600" : "text-gray-400"}`}>{inr(e.balance)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.status === "Paid" ? "bg-emerald-50 text-emerald-700" : e.status === "Partial" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{e.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <RowMenu align="right" buttonLabel="Expense actions">
                          {(close) => (
                            <>
                              <RowMenuDivider />
                              <RowMenuItem icon={Trash2} label="Delete" tone="danger" onClick={() => { close(); remove(e); }} />
                            </>
                          )}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No transactions in this category.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <ExpenseForm
          parties={parties}
          categories={catNames.filter((c) => c !== UNCATEGORISED)}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

type LineDraft = { itemName: string; description: string; qty: number; rate: number; taxPercent: number };
const emptyLine = (): LineDraft => ({ itemName: "", description: "", qty: 1, rate: 0, taxPercent: 0 });

/** Add an expense — Vyapar's category-first form with a GST toggle that reveals the party & state. */
function ExpenseForm({
  parties,
  categories,
  onClose,
  onSaved,
}: {
  parties: Party[];
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gst, setGst] = useState(false);
  const [category, setCategory] = useState("");
  const [partyId, setPartyId] = useState("");
  const [expenseNo, setExpenseNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stateOfSupply, setStateOfSupply] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [paid, setPaid] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bankAccountId = useVyaparBankId();
  const paymentTypeOptions = usePaymentTypeOptions();

  const calc = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const l of lines) {
      const gross = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      net += gross;
      tax += gst ? (gross * (Number(l.taxPercent) || 0)) / 100 : 0;
    }
    return { net, tax, total: Math.round(net + tax) };
  }, [lines, gst]);

  const paidDisplay = paidTouched ? paid : calc.total;

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!category.trim()) {
      setError("Choose an expense category.");
      return;
    }
    const clean = lines.filter((l) => l.itemName.trim() || l.rate > 0);
    if (clean.length === 0) {
      setError("Add at least one expense line.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.createInvoice({
        docType: "EXPENSE",
        bankAccountId: bankAccountId ?? null,
        invoiceNo: expenseNo || undefined,
        partyId: gst && partyId ? Number(partyId) : null,
        invoiceDate: date,
        notes: category.trim(), // category lives here until the backend adds a column
        stateOfSupply: gst ? stateOfSupply || null : null,
        paidAmount: Math.min(paidDisplay, calc.total),
        isCash: paidDisplay >= calc.total,
        paymentType: paymentMode,
        lines: clean.map((l) => ({
          itemId: null,
          itemName: l.itemName.trim() || category.trim(),
          description: l.description || null,
          unit: null,
          quantity: Number(l.qty) || 1,
          rate: Number(l.rate) || 0,
          discountPercent: 0,
          taxPercent: gst ? Number(l.taxPercent) || 0 : 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this expense.");
      setSaving(false);
    }
  }

  return (
    <Drawer title="Expense" onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save"} width="max-w-4xl">
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* GST toggle — reveals the party & place of supply, like Vyapar */}
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-800">Expense</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${gst ? "font-medium text-brand-accent" : "text-gray-400"}`}>GST</span>
            <button
              type="button"
              role="switch"
              aria-checked={gst}
              onClick={() => setGst((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${gst ? "bg-brand-accent" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${gst ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <DrawerField label="Expense Category" required>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="expense-categories"
                placeholder="Select or type a category"
                className="input"
                autoFocus
              />
              <datalist id="expense-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </DrawerField>
            {gst && (
              <DrawerField label="Party">
                <Select
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="Search by name / phone"
                  options={[{ value: "", label: "Select party" }, ...parties.map((p) => ({ value: String(p.id), label: p.name }))]}
                />
              </DrawerField>
            )}
          </div>
          <div className="space-y-3">
            <DrawerField label="Expense No.">
              <input value={expenseNo} onChange={(e) => setExpenseNo(e.target.value)} placeholder="Auto" className="input" />
            </DrawerField>
            <DrawerField label={gst ? "Bill Date" : "Date"}>
              <DatePicker value={date} onChange={setDate} placeholder="Date" />
            </DrawerField>
            {gst && (
              <DrawerField label="State of supply">
                <Select
                  value={stateOfSupply}
                  onChange={setStateOfSupply}
                  placeholder="Select"
                  options={[{ value: "", label: "Select" }, ...vyapar.STATES_OF_SUPPLY.map((s) => ({ value: s, label: s }))]}
                />
              </DrawerField>
            )}
          </div>
        </div>

        {/* Line grid */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-28 px-2 py-2 text-right">Price/Unit</th>
                {gst && <th className="w-20 px-2 py-2 text-right">Tax %</th>}
                <th className="w-28 px-2 py-2 text-right">Amount</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const gross = (Number(l.qty) || 0) * (Number(l.rate) || 0);
                const amount = gross + (gst ? (gross * (Number(l.taxPercent) || 0)) / 100 : 0);
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-2 py-1.5 text-center text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        value={l.itemName}
                        onChange={(e) => setLine(idx, { itemName: e.target.value })}
                        placeholder="Item / description"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={l.qty} onChange={(e) => setLine(idx, { qty: Number(e.target.value) })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={l.rate} onChange={(e) => setLine(idx, { rate: Number(e.target.value) })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500" />
                    </td>
                    {gst && (
                      <td className="px-2 py-1.5">
                        <Select value={String(l.taxPercent)} onChange={(v) => setLine(idx, { taxPercent: Number(v) })} size="sm" options={TAX_RATES.map((t) => ({ value: String(t), label: t === 0 ? "None" : `${t}%` }))} />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right font-medium text-gray-800">{inr(amount)}</td>
                    <td className="px-1 py-1.5">
                      {lines.length > 1 && (
                        <button onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600">
                          <X size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-2 py-2" />
                <td className="px-2 py-2">
                  <button onClick={() => setLines((p) => [...p, emptyLine()])} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95">
                    <Plus size={12} /> Add Row
                  </button>
                </td>
                <td colSpan={gst ? 4 : 3} className="px-2 py-2 text-right text-xs font-medium text-gray-500">
                  TOTAL <span className="ml-2 text-sm text-gray-800">{inr(calc.total)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment + totals */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <DrawerField label="Payment Type">
              <Select value={paymentMode} onChange={setPaymentMode} options={paymentTypeOptions} />
            </DrawerField>
            <DrawerField label="Reference No.">
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="input" placeholder="NEFT / cheque no" />
            </DrawerField>
          </div>
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
            <div className="flex items-center justify-between"><span className="text-gray-500">Sub Total</span><span className="font-medium text-gray-800">{inr(calc.net)}</span></div>
            {gst && <div className="flex items-center justify-between"><span className="text-gray-500">Tax</span><span className="font-medium text-gray-800">{inr(calc.tax)}</span></div>}
            <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-2"><span className="font-semibold text-gray-700">Total</span><span className="text-lg font-semibold text-gray-900">{inr(calc.total)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">Paid</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">₹</span>
                <input type="number" value={paidDisplay} onChange={(e) => { setPaid(Number(e.target.value)); setPaidTouched(true); }} className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500" />
              </div>
            </div>
            <div className="flex items-center justify-between"><span className="text-gray-500">Balance</span><span className={`font-medium ${calc.total - paidDisplay > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inr(Math.max(0, calc.total - paidDisplay))}</span></div>
          </div>
        </div>
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
