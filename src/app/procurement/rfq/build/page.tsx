"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { ProcurementShell } from "@/components/procurement/ProcurementShell";
import { MaterialLibrary } from "@/components/procurement/MaterialLibrary";
import { BillShipDialog } from "@/components/procurement/BillShipDialog";
import { SendRfqDialog } from "@/components/procurement/SendRfqDialog";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { useProjects } from "@/lib/useProjects";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as procurement from "@/lib/procurementApi";
import * as vyapar from "@/lib/vyaparApi";
import type { Rfq } from "@/lib/procurementApi";
import type { Item, Party } from "@/lib/vyaparApi";

/**
 * The RFQ builder — a full page, not a dialog.
 *
 * Modelled on the tool the client already uses, because an enquiry is a document with four distinct
 * parts and a drawer cannot hold them side by side: the header details, the material list, the
 * suppliers it goes to, and the terms printed at the foot.
 *
 * Materials come from a library panel that slides in from the right rather than a per-row picker.
 * A real enquiry is ten or twenty lines chosen in one pass; typing them one at a time into a grid
 * is the slow way to do the same thing.
 *
 * Two save paths, and the difference matters: **Save Draft** keeps it internal, **Save and Send**
 * marks the suppliers as sent. Nothing is sent to a vendor until the second is pressed.
 */
export default function RfqBuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}

const UNITS = ["Nos", "Bag", "Kg", "MT", "Mtr", "Sqm", "Cum", "Litre", "Set", "Box", "Tonne"];

type DraftLine = {
  id?: number;
  itemId: number | null;
  itemName: string;
  specification: string;
  hsnCode: string;
  unit: string;
  quantity: number;
  deliveryDate: string;
  budgetRate: string;
};

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params?.get("id");
  const { projects } = useProjects();
  const scopeProjectId = useVyaparProjectId();

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  // The enquiry as saved, held so the send dialog can mint links against it. Set only by
  // "Save and Send Email" — a draft never reaches a supplier.
  const [sending, setSending] = useState<Rfq | null>(null);

  const [rfqNo, setRfqNo] = useState("");
  const [editingNo, setEditingNo] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(scopeProjectId != null ? String(scopeProjectId) : "");
  const [rfqDate, setRfqDate] = useState(new Date().toISOString().slice(0, 10));
  const [taxType, setTaxType] = useState<"ITEM" | "BILL">("ITEM");
  const [biddingStart, setBiddingStart] = useState("");
  const [biddingEnd, setBiddingEnd] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [terms, setTerms] = useState("");
  const [addr, setAddr] = useState({
    billToName: "",
    billToAddress: "",
    billToGstin: "",
    shipToName: "",
    shipToAddress: "",
    shipToGstin: "",
    shipSameAsBill: false,
  });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [supplierIds, setSupplierIds] = useState<number[]>([]);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);

  // Masters, and the firm's own details for the default Bill To.
  const loadMasters = useCallback(async () => {
    try {
      const [i, p] = await Promise.all([vyapar.getItems(), vyapar.getParties()]);
      setItems(i);
      setParties(p);
    } catch {
      /* the builder still works with an empty library; the user can type a line by hand */
    }
    if (!editId) {
      try {
        const firm = await vyapar.getFirmProfile();
        setAddr((a) => ({
          ...a,
          billToName: firm.businessName ?? "",
          billToAddress: [firm.address, firm.state].filter(Boolean).join(", "),
          billToGstin: firm.gstin ?? "",
        }));
      } catch {
        /* no firm profile yet — the Bill To panel lets it be typed */
      }
    }
  }, [editId]);

  useEffect(() => {
    loadMasters();
  }, [loadMasters]);

  function hydrate(r: Rfq) {
    setRfqNo(r.rfqNo);
    setTitle(r.title);
    setProjectId(r.projectId != null ? String(r.projectId) : "");
    setRfqDate(r.rfqDate ?? "");
    setTaxType(r.taxType);
    setBiddingStart(r.biddingStartDate ?? "");
    setBiddingEnd(r.biddingEndDate ?? "");
    setDeliveryDate(r.deliveryDate ?? "");
    setTerms(r.terms ?? "");
    setAddr({
      billToName: r.billToName ?? "",
      billToAddress: r.billToAddress ?? "",
      billToGstin: r.billToGstin ?? "",
      shipToName: r.shipToName ?? "",
      shipToAddress: r.shipToAddress ?? "",
      shipToGstin: r.shipToGstin ?? "",
      shipSameAsBill: r.shipSameAsBill,
    });
    setLines(
      r.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemName: l.itemName,
        specification: l.specification ?? "",
        hsnCode: l.hsnCode ?? "",
        unit: l.unit ?? "Nos",
        quantity: l.quantity,
        deliveryDate: l.deliveryDate ?? "",
        budgetRate: l.budgetRate != null ? String(l.budgetRate) : "",
      })),
    );
    setSupplierIds(r.suppliers.map((s) => s.vendorPartyId));
  }

  // Editing an existing enquiry.
  const loadRfq = useCallback(async () => {
    if (!editId) return;
    setLoading(true);
    try {
      const r = await procurement.getRfq(Number(editId));
      hydrate(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this enquiry.");
    } finally {
      setLoading(false);
    }
  }, [editId]);

  useEffect(() => {
    loadRfq();
  }, [loadRfq]);

  const selectedSuppliers = useMemo(
    () => supplierIds.map((id) => parties.find((p) => p.id === id)).filter((p): p is Party => !!p),
    [supplierIds, parties],
  );

  const supplierOptions = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return parties
      .filter((p) => !supplierIds.includes(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q))
      .sort((a, b) => {
        const rank = (p: Party) => (p.partyType === "SUPPLIER" ? 0 : 1);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [parties, supplierIds, supplierSearch]);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  /** Materials chosen in the library panel join the list; ones already there are left alone. */
  function addMaterials(picked: Item[]) {
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.itemId).filter(Boolean));
      const fresh = picked
        .filter((it) => !have.has(it.id))
        .map((it) => ({
          itemId: it.id,
          itemName: it.name,
          specification: it.description ?? "",
          hsnCode: it.hsn ?? "",
          unit: it.unit || "Nos",
          quantity: 1,
          deliveryDate: "",
          budgetRate: it.purchasePrice ? String(it.purchasePrice) : "",
        }));
      return [...prev, ...fresh];
    });
    setLibraryOpen(false);
  }

  function addBlankLine() {
    setLines((prev) => [
      ...prev,
      { itemId: null, itemName: "", specification: "", hsnCode: "", unit: "Nos", quantity: 1, deliveryDate: "", budgetRate: "" },
    ]);
  }

  async function save(send: boolean) {
    const clean = lines.filter((l) => l.itemName.trim());
    if (!title.trim()) return setError("Give the enquiry a title.");
    if (!projectId) return setError("Pick a project.");
    if (clean.length === 0) return setError("Add at least one material.");
    if (send && supplierIds.length === 0) return setError("Add at least one supplier before sending.");

    setSaving(send ? "send" : "draft");
    setError("");
    try {
      const body: procurement.RfqInput = {
        title: title.trim(),
        rfqNo: rfqNo.trim() || null,
        projectId: Number(projectId),
        status: send ? "Sent" : "Draft",
        rfqDate: rfqDate || null,
        taxType,
        biddingStartDate: biddingStart || null,
        biddingEndDate: biddingEnd || null,
        deliveryDate: deliveryDate || null,
        terms: terms.trim() || null,
        ...addr,
        lines: clean.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName.trim(),
          specification: l.specification.trim() || null,
          hsnCode: l.hsnCode.trim() || null,
          deliveryDate: l.deliveryDate || null,
          unit: l.unit,
          quantity: Number(l.quantity) || 1,
          budgetRate: l.budgetRate === "" ? null : Number(l.budgetRate),
        })),
        supplierPartyIds: supplierIds,
      };
      const saved = editId ? await procurement.updateRfq(Number(editId), body) : await procurement.createRfq(body);
      // A draft is finished business; sending is not. Leaving the page now would drop the buyer
      // back on the list with the links they came here to hand out still unmade.
      if (send) {
        setSending(saved);
        setSaving("");
        return;
      }
      router.push("/procurement/rfq");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this enquiry.");
      setSaving("");
    }
  }

  if (loading) {
    return (
      <ProcurementShell>
        <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading enquiry…
        </div>
      </ProcurementShell>
    );
  }

  return (
    <ProcurementShell>
      <div className="space-y-4 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-gray-800">{editId ? "Edit RFQ" : "New RFQ"}</h1>
          <button
            onClick={() => router.push("/procurement/rfq")}
            aria-label="Close"
            className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* ---- Details ---- */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">Details</h2>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="RFQ No.">
              {editingNo ? (
                <input
                  value={rfqNo}
                  onChange={(e) => setRfqNo(e.target.value)}
                  onBlur={() => setEditingNo(false)}
                  autoFocus
                  className="input"
                  placeholder="Auto"
                />
              ) : (
                <button
                  onClick={() => setEditingNo(true)}
                  className="flex w-full items-center gap-2 rounded-lg border border-transparent py-1 text-left text-sm text-gray-800 hover:text-brand-accent"
                >
                  {rfqNo || <span className="text-gray-400">Auto</span>}
                  <Pencil size={13} className="text-gray-400" />
                </button>
              )}
            </Field>
            <Field label="RFQ Date" required>
              <DatePicker value={rfqDate} onChange={setRfqDate} placeholder="Date" />
            </Field>
            <Field label="Project" required>
              <Select
                value={projectId}
                onChange={setProjectId}
                placeholder="Select project"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="What are you buying" required className="sm:col-span-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Valves — Pedak Road chambers"
                className="input"
              />
            </Field>
            <Field label="Bill To / Ship To">
              <button
                onClick={() => setAddrOpen(true)}
                className="text-left text-sm font-medium text-brand-accent hover:underline"
              >
                {addr.billToName ? "View / edit" : "+ Add"}
              </button>
            </Field>
            <Field label="Bidding Start Date">
              <DatePicker value={biddingStart} onChange={setBiddingStart} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Bidding End Date">
              <DatePicker value={biddingEnd} onChange={setBiddingEnd} min={biddingStart || undefined} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Delivery Date">
              <DatePicker value={deliveryDate} onChange={setDeliveryDate} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Tax Type" className="sm:col-span-2">
              <div className="flex items-center gap-5 pt-1.5">
                {(["ITEM", "BILL"] as const).map((t) => (
                  <label key={t} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="taxType"
                      checked={taxType === t}
                      onChange={() => setTaxType(t)}
                      className="h-4 w-4 accent-cyan-600"
                    />
                    {t === "ITEM" ? "Item Level Tax" : "Bill Level Tax"}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </section>

        {/* ---- Material List ---- */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">Material List</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                  <th className="w-12 px-3 py-2">S.No.</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="w-28 px-3 py-2">HSN Code</th>
                  <th className="w-32 px-3 py-2">Quantity</th>
                  <th className="w-40 px-3 py-2">Delivery Date</th>
                  <th className="w-28 px-3 py-2 text-right">Budget rate</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50 align-top last:border-b-0">
                    <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        value={l.itemName}
                        onChange={(e) => setLine(i, { itemName: e.target.value, itemId: null })}
                        placeholder="Item name"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                      />
                      {/* The brand/spec line their enquiries carry under the item name. */}
                      <input
                        value={l.specification}
                        onChange={(e) => setLine(i, { specification: e.target.value })}
                        placeholder="Make / specification (optional)"
                        className="mt-1 w-full rounded-md border border-transparent px-2 py-0.5 text-xs text-gray-500 outline-none hover:border-gray-200 focus:border-cyan-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={l.hsnCode}
                        onChange={(e) => setLine(i, { hsnCode: e.target.value })}
                        placeholder="--"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={l.quantity}
                          onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                          className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                        />
                        <Select
                          value={l.unit}
                          onChange={(v) => setLine(i, { unit: v })}
                          size="sm"
                          className="w-20"
                          options={UNITS.map((u) => ({ value: u, label: u }))}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <DatePicker
                        value={l.deliveryDate}
                        onChange={(v) => setLine(i, { deliveryDate: v })}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={l.budgetRate}
                        onChange={(e) => setLine(i, { budgetRate: e.target.value })}
                        placeholder="--"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                        aria-label={`Remove line ${i + 1}`}
                        className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3 p-4">
            <button
              onClick={() => setLibraryOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
            >
              <Plus size={14} /> Add Material
            </button>
            <button
              onClick={addBlankLine}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors duration-150 hover:border-brand-accent hover:text-brand-accent"
            >
              Type a line
            </button>
          </div>
        </section>

        {/* ---- Target Suppliers ---- */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">Target Suppliers</h2>
          <div className="p-4">
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-400">
                <Search size={15} className="text-gray-400" />
                <input
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Select supplier"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              {supplierSearch && supplierOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {supplierOptions.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSupplierIds((prev) => [...prev, p.id]);
                        setSupplierSearch("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-cyan-50"
                    >
                      <span className="text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.phone ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                    <th className="px-3 py-2">Supplier Name</th>
                    <th className="w-40 px-3 py-2">Phone Number</th>
                    <th className="w-56 px-3 py-2">Email Address</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {selectedSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">
                        No suppliers added yet. Select a supplier above.
                      </td>
                    </tr>
                  ) : (
                    selectedSuppliers.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent/10 text-[11px] font-semibold text-brand-accent">
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-gray-800">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.phone ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{p.email ?? "—"}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setSupplierIds((prev) => prev.filter((id) => id !== p.id))}
                            aria-label={`Remove ${p.name}`}
                            className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---- Terms ---- */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold tracking-wide text-gray-800 uppercase">
            Terms &amp; Conditions
          </h2>
          <div className="p-4">
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={4}
              placeholder="Payment terms, validity, delivery expectations — printed at the foot of the enquiry."
              className="input resize-none"
            />
          </div>
        </section>
      </div>

      {/* ---- Sticky footer: the two save paths ---- */}
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
            {saving === "send" ? "Saving…" : "Save and Send Email"}
          </button>
        </div>
      </div>

      {libraryOpen && (
        <MaterialLibrary
          items={items}
          alreadyPicked={lines.map((l) => l.itemId).filter((x): x is number => x != null)}
          onClose={() => setLibraryOpen(false)}
          onPick={addMaterials}
        />
      )}

      {sending && (
        <SendRfqDialog
          rfq={sending}
          onSent={setSending}
          onClose={() => router.push("/procurement/rfq")}
        />
      )}

      {addrOpen && (
        <BillShipDialog
          value={addr}
          projectName={projects.find((p) => String(p.id) === projectId)?.name}
          onClose={() => setAddrOpen(false)}
          onSave={(next) => {
            setAddr(next);
            setAddrOpen(false);
          }}
        />
      )}
    </ProcurementShell>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
