"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { ProcurementShell } from "@/components/procurement/ProcurementShell";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { useProjects } from "@/lib/useProjects";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as wo from "@/lib/workOrderApi";
import * as vyapar from "@/lib/vyaparApi";
import { measuredQuantity } from "@/lib/workOrderApi";
import { inr } from "@/lib/format";
import type { Party } from "@/lib/vyaparApi";

/**
 * The work-order builder.
 *
 * Built around the one field that has no equivalent anywhere else in the system: **N × L × W × H**.
 * Site work is not counted, it is measured — 4 lengths of 12.5m at 0.6 wide and 0.15 deep — and the
 * quantity falls out of the four numbers. The row computes as it is typed and the quantity box goes
 * read-only, because a measured quantity that can also be overtyped is a quantity nobody can defend
 * when the contractor disputes his bill six months later.
 *
 * Leave the dimensions empty and the quantity is simply typed, which is how a per-metre or lump-sum
 * line gets entered. Both kinds sit in the same grid.
 */
export default function WorkOrderBuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}

const UNITS = ["Nos", "Rmt", "Sqm", "Cum", "Kg", "MT", "Brass", "Day", "Lump sum"];

type DraftItem = {
  id?: number;
  itemId: number | null;
  itemName: string;
  description: string;
  unit: string;
  dimN: string;
  dimL: string;
  dimW: string;
  dimH: string;
  quantity: string;
  rate: string;
};

const blankItem = (): DraftItem => ({
  itemId: null,
  itemName: "",
  description: "",
  unit: "Nos",
  dimN: "",
  dimL: "",
  dimW: "",
  dimH: "",
  quantity: "1",
  rate: "",
});

const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params?.get("id");
  const { projects } = useProjects();
  const scopeProjectId = useVyaparProjectId();

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const [woNo, setWoNo] = useState("");
  const [editingNo, setEditingNo] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(scopeProjectId != null ? String(scopeProjectId) : "");
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [woDate, setWoDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [taxPercent, setTaxPercent] = useState("0");
  const [discount, setDiscount] = useState("");
  const [charges, setCharges] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNumber, setBankNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);

  const [parties, setParties] = useState<Party[]>([]);

  const loadParties = useCallback(async () => {
    try {
      setParties(await vyapar.getParties());
    } catch {
      /* the form still works with a typed contractor name once one is picked elsewhere */
    }
  }, []);

  useEffect(() => {
    loadParties();
  }, [loadParties]);

  function hydrate(w: wo.WorkOrder) {
    setWoNo(w.woNo);
    setTitle(w.title);
    setProjectId(w.projectId != null ? String(w.projectId) : "");
    setVendorId(w.vendorPartyId);
    setWoDate(w.woDate ?? "");
    setStartDate(w.startDate ?? "");
    setEndDate(w.endDate ?? "");
    setTaxPercent(String(w.taxPercent ?? 0));
    setDiscount(w.discount ? String(w.discount) : "");
    setCharges(w.charges ? String(w.charges) : "");
    setBankName(w.bankAccountName ?? "");
    setBankNumber(w.bankAccountNumber ?? "");
    setBankIfsc(w.bankIfsc ?? "");
    setTerms(w.terms ?? "");
    setNotes(w.notes ?? "");
    setItems(
      w.items.length
        ? w.items.map((i) => ({
            id: i.id,
            itemId: i.itemId,
            itemName: i.itemName,
            description: i.description ?? "",
            unit: i.unit ?? "Nos",
            dimN: i.dimN != null ? String(i.dimN) : "",
            dimL: i.dimL != null ? String(i.dimL) : "",
            dimW: i.dimW != null ? String(i.dimW) : "",
            dimH: i.dimH != null ? String(i.dimH) : "",
            quantity: String(i.quantity),
            rate: String(i.rate),
          }))
        : [blankItem()],
    );
  }

  const loadWorkOrder = useCallback(async () => {
    if (!editId) return;
    setLoading(true);
    try {
      hydrate(await wo.getWorkOrder(Number(editId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this work order.");
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    loadWorkOrder();
  }, [loadWorkOrder]);

  const vendorOptions = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return parties
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q))
      .sort((a, b) => {
        const rank = (p: Party) => (p.partyType === "SUPPLIER" ? 0 : 1);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [parties, vendorSearch]);

  const vendor = parties.find((p) => p.id === vendorId) ?? null;

  function setItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  /** The row's quantity: measured when any dimension is filled, typed otherwise. */
  const rowQuantity = (it: DraftItem) => {
    const measured = measuredQuantity({
      dimN: num(it.dimN) || null,
      dimL: num(it.dimL) || null,
      dimW: num(it.dimW) || null,
      dimH: num(it.dimH) || null,
    });
    return measured ?? num(it.quantity);
  };

  const totals = useMemo(() => {
    const sub = items.reduce((t, it) => t + rowQuantity(it) * num(it.rate), 0);
    const afterTerms = sub - num(discount) + num(charges);
    const tax = (afterTerms * num(taxPercent)) / 100;
    return { sub, tax, total: afterTerms + tax };
  }, [items, discount, charges, taxPercent]);

  async function save(approve: boolean) {
    const clean = items.filter((i) => i.itemName.trim());
    if (!title.trim()) return setError("Give the work order a title.");
    if (!vendorId) return setError("Pick the subcontractor.");
    if (!projectId) return setError("Pick a project.");
    if (clean.length === 0) return setError("Add at least one item of work.");

    setSaving(approve ? "approve" : "draft");
    setError("");
    try {
      const body: wo.WorkOrderInput = {
        title: title.trim(),
        woNo: woNo.trim() || null,
        projectId: Number(projectId),
        vendorPartyId: vendorId,
        status: approve ? "Approved" : "Draft",
        woDate: woDate || null,
        startDate: startDate || null,
        endDate: endDate || null,
        taxPercent: num(taxPercent),
        discount: num(discount),
        charges: num(charges),
        bankAccountName: bankName.trim() || null,
        bankAccountNumber: bankNumber.trim() || null,
        bankIfsc: bankIfsc.trim() || null,
        terms: terms.trim() || null,
        notes: notes.trim() || null,
        items: clean.map((it) => ({
          id: it.id,
          itemId: it.itemId,
          itemName: it.itemName.trim(),
          description: it.description.trim() || null,
          unit: it.unit,
          // Send the measurement, not its product — the server derives the quantity, so the two can
          // never disagree about what the order was signed on.
          dimN: num(it.dimN) || null,
          dimL: num(it.dimL) || null,
          dimW: num(it.dimW) || null,
          dimH: num(it.dimH) || null,
          quantity: num(it.quantity) || 1,
          rate: num(it.rate),
        })),
      };
      const saved = editId ? await wo.updateWorkOrder(Number(editId), body) : await wo.createWorkOrder(body);
      router.push(`/procurement/work-order/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this work order.");
      setSaving("");
    }
  }

  if (loading) {
    return (
      <ProcurementShell>
        <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading work order…
        </div>
      </ProcurementShell>
    );
  }

  return (
    <ProcurementShell>
      <div className="space-y-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-900">{editId ? "Edit Work Order" : "New Work Order"}</h1>
          <button
            onClick={() => router.push("/procurement/work-order")}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

        {/* ---- Details ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Work Order No.">
              {editingNo ? (
                <input
                  value={woNo}
                  onChange={(e) => setWoNo(e.target.value)}
                  onBlur={() => setEditingNo(false)}
                  autoFocus
                  className="input"
                />
              ) : (
                <button
                  onClick={() => setEditingNo(true)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:border-brand-accent"
                >
                  {woNo || <span className="text-gray-400">Auto</span>}
                  <Pencil size={12} className="text-gray-400" />
                </button>
              )}
            </Field>
            <Field label="Work Order Date" required>
              <DatePicker value={woDate} onChange={setWoDate} />
            </Field>
            <Field label="Project" required>
              <Select
                value={projectId}
                onChange={setProjectId}
                placeholder="Select project"
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </Field>
            <Field label="Work Order Title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Boundary wall plaster"
                className="input"
              />
            </Field>
            <Field label="Start Date">
              <DatePicker value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="End Date">
              <DatePicker value={endDate} onChange={setEndDate} />
            </Field>
          </div>

          {/* Subcontractor */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
              Sub Contractor <span className="text-rose-500">*</span>
            </span>
            {vendor ? (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-700">
                  {vendor.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{vendor.name}</p>
                  <p className="truncate text-xs text-gray-500">{vendor.phone || "No phone"}</p>
                </div>
                <button
                  onClick={() => setVendorId(null)}
                  className="text-xs font-medium text-rose-600 transition-opacity duration-150 hover:opacity-80"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-400">
                  <Search size={14} className="text-gray-400" />
                  <input
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    placeholder="Search contractor by name or phone"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                {vendorSearch.trim() && (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {vendorOptions.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-400">
                        No party matches. Add them under Vyapar → Parties first.
                      </p>
                    ) : (
                      vendorOptions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setVendorId(p.id);
                            setVendorSearch("");
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-cyan-50/50"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{p.name}</span>
                          <span className="text-xs text-gray-400">{p.phone}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---- Items ---- */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Scope of Work</h2>
            <p className="text-[11px] text-gray-400">
              Fill N × L × W × H to measure a line, or leave them blank and type the quantity.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="w-10 px-3 py-2">#</th>
                  <th className="min-w-[220px] px-3 py-2">Item of work</th>
                  <th className="px-2 py-2 text-center" colSpan={4}>
                    N × L × W × H
                  </th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => {
                  const measured = measuredQuantity({
                    dimN: num(it.dimN) || null,
                    dimL: num(it.dimL) || null,
                    dimW: num(it.dimW) || null,
                    dimH: num(it.dimH) || null,
                  });
                  const qty = measured ?? num(it.quantity);
                  return (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          value={it.itemName}
                          onChange={(e) => setItem(i, { itemName: e.target.value })}
                          placeholder="e.g. HSC laying"
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-cyan-500"
                        />
                        <input
                          value={it.description}
                          onChange={(e) => setItem(i, { description: e.target.value })}
                          placeholder="Specification (optional)"
                          className="mt-1 w-full rounded-md border border-transparent px-2 py-1 text-xs text-gray-500 outline-none focus:border-gray-200"
                        />
                      </td>
                      {(["dimN", "dimL", "dimW", "dimH"] as const).map((k) => (
                        <td key={k} className="px-1 py-2">
                          <input
                            value={it[k]}
                            onChange={(e) => setItem(i, { [k]: e.target.value } as Partial<DraftItem>)}
                            inputMode="decimal"
                            placeholder={k.slice(3)}
                            className="w-14 rounded-md border border-gray-200 px-1.5 py-1.5 text-center text-sm outline-none focus:border-cyan-500"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        {measured != null ? (
                          <span
                            className="block rounded-md bg-cyan-50 px-2 py-1.5 text-sm font-medium text-cyan-800 tabular-nums"
                            title="Measured from N × L × W × H"
                          >
                            {measured.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                          </span>
                        ) : (
                          <input
                            value={it.quantity}
                            onChange={(e) => setItem(i, { quantity: e.target.value })}
                            inputMode="decimal"
                            className="w-24 rounded-md border border-gray-200 px-2 py-1.5 text-right text-sm outline-none focus:border-cyan-500"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={it.unit}
                          onChange={(v) => setItem(i, { unit: v })}
                          size="sm"
                          className="w-24"
                          options={UNITS.map((u) => ({ value: u, label: u }))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          value={it.rate}
                          onChange={(e) => setItem(i, { rate: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          className="w-24 rounded-md border border-gray-200 px-2 py-1.5 text-right text-sm outline-none focus:border-cyan-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium whitespace-nowrap text-gray-800 tabular-nums">
                        {inr(qty * num(it.rate))}
                      </td>
                      <td className="px-2 py-2">
                        {items.length > 1 && (
                          <button
                            onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                            aria-label="Remove line"
                            className="rounded p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-2.5">
            <button
              onClick={() => setItems((prev) => [...prev, blankItem()])}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-accent transition-opacity duration-150 hover:opacity-80"
            >
              <Plus size={14} /> Add Row
            </button>
          </div>
        </section>

        {/* ---- Money, bank and terms ---- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Payment details</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Account holder name">
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" />
              </Field>
              <Field label="Account number">
                <input
                  value={bankNumber}
                  onChange={(e) => setBankNumber(e.target.value)}
                  className="input font-mono"
                />
              </Field>
              <Field label="IFSC">
                <input
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  className="input font-mono"
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Terms & Conditions">
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={4}
                  placeholder="Retention, payment terms, penalty for delay…"
                  className="input resize-none"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Anything the site should know"
                  className="input resize-none"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Order value</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Item sub total" value={inr(totals.sub)} />
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">Discount</dt>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">Additional charges</dt>
                <input
                  value={charges}
                  onChange={(e) => setCharges(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">GST %</dt>
                <input
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  inputMode="decimal"
                  className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                />
              </div>
              <Row label="GST amount" value={inr(totals.tax)} />
              <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold text-gray-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{inr(totals.total)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* ---- Sticky footer ---- */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => save(false)}
            disabled={!!saving}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent disabled:opacity-50"
          >
            {saving === "draft" ? "Saving…" : "Save Draft"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={!!saving}
            className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          >
            {saving === "approve" ? "Saving…" : "Save & Approve"}
          </button>
        </div>
      </div>
    </ProcurementShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-800 tabular-nums">{value}</dd>
    </div>
  );
}
