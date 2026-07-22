"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { inr } from "@/lib/format";
import { useVyaparBankId, usePaymentTypeOptions } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import { STATES_OF_SUPPLY } from "@/lib/vyaparApi";
import type { DocType, Invoice, Item, Party } from "@/lib/vyaparApi";
import { Plus, X } from "lucide-react";

const UNITS = ["NONE", "PCS", "NOS", "KG", "TON", "MTR", "SQM", "CUM", "BAG", "BOX", "LTR", "HOUR"];

type LineDraft = {
  itemId: number | null;
  itemName: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
};

const emptyLine = (): LineDraft => ({
  itemId: null,
  itemName: "",
  description: "",
  unit: "NONE",
  quantity: 1,
  rate: 0,
  discountPercent: 0,
  taxPercent: 0,
});

/**
 * Invoice builder modelled on Vyapar's own Sale/Purchase form: Credit↔Cash toggle, prefixed
 * invoice number, place of supply, a spreadsheet-style line grid with per-line discount and tax,
 * a totals row, terms & conditions, whole-document discount and round-off.
 */
export function InvoiceBuilder({
  docType,
  existing,
  parties,
  items,
  onClose,
  onSaved,
}: {
  docType: DocType;
  existing?: Invoice;
  parties: Party[];
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const bankAccountId = useVyaparBankId();
  const paymentTypeOptions = usePaymentTypeOptions();
  const isPurchase = docType === "PURCHASE";
  // Estimates, proformas, sale orders and delivery challans are planning docs: they don't move stock
  // or party balance (see vyapar-service POSTED). So: no cash/credit toggle, no received amount.
  const isQuote = docType === "ESTIMATE" || docType === "PROFORMA";
  const isOrder = docType === "SALE_ORDER" || docType === "PURCHASE_ORDER";
  const isChallan = docType === "DELIVERY_CHALLAN";
  // Returns (credit/debit notes) DO move the balance, but Vyapar shows no cash/credit toggle on them.
  const isReturn = docType === "SALE_RETURN" || docType === "PURCHASE_RETURN";
  // Purchase-family docs pick suppliers, not customers.
  const isSupplierSide = docType === "PURCHASE" || docType === "PURCHASE_ORDER" || docType === "PURCHASE_RETURN";
  const noPayment = isQuote || isOrder || isChallan;
  // Vyapar drives purchase paid/unpaid from a "Paid" amount, not a cash/credit toggle.
  const noToggle = noPayment || isReturn || isPurchase;
  const partyRequired = noPayment || isReturn || isPurchase;
  const singleNumber = noPayment || isReturn || isPurchase; // Bill/Ref/Order/Challan/Return No. — no prefix
  const showDueDate = docType === "SALE" || isOrder || isChallan; // only these carry a due date
  const moneyLabel = isPurchase ? "Paid" : "Received"; // money out vs money in
  const numberLabel = isPurchase
    ? "Bill Number"
    : isOrder
      ? "Order No."
      : isChallan
        ? "Challan No."
        : isReturn
          ? "Return No."
          : isQuote
            ? "Ref No."
            : "Invoice Number";
  const dateLabel = isPurchase ? "Bill Date" : isOrder ? "Order Date" : isReturn ? "Date" : "Invoice Date";
  const docHeading =
    docType === "ESTIMATE"
      ? "Estimate / Quotation"
      : docType === "PROFORMA"
        ? "Proforma Invoice"
        : docType === "SALE_ORDER"
          ? "Sale Order"
          : docType === "PURCHASE_ORDER"
            ? "Purchase Order"
            : docType === "DELIVERY_CHALLAN"
              ? "Delivery Challan"
            : docType === "SALE_RETURN"
              ? "Credit Note"
              : docType === "PURCHASE_RETURN"
                ? "Debit Note"
                : isPurchase
                  ? "Purchase"
                  : "Sale";

  // Sales default to cash (fully received); purchases default to unpaid until a Paid amount is entered.
  const [isCash, setIsCash] = useState(existing?.isCash ?? docType !== "PURCHASE");
  const [partyId, setPartyId] = useState(existing?.partyId ? String(existing.partyId) : "");
  const [phone, setPhone] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState(existing?.invoicePrefix ?? "");
  const [invoiceNo, setInvoiceNo] = useState(existing?.invoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [stateOfSupply, setStateOfSupply] = useState(existing?.stateOfSupply ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "Thank you for doing business with us.");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [discountPercent, setDiscountPercent] = useState(existing?.discountPercent ?? 0);
  const [discountAmount, setDiscountAmount] = useState(existing?.discount ?? 0);
  const [roundOffOn, setRoundOffOn] = useState(true);
  // Vyapar's Price/Unit column can be entered tax-inclusive or exclusive; the toggle applies to every row.
  const [priceHasTax, setPriceHasTax] = useState(false);
  // Received amount, so a sale can be saved fully/partly paid — mirrors Vyapar's Received / Balance.
  const [received, setReceived] = useState(existing?.paidAmount ?? 0);
  const [receivedTouched, setReceivedTouched] = useState(existing != null);
  // Payment mode for the received portion — Vyapar's "Payment Type" picker on a paid invoice.
  const [paymentMode, setPaymentMode] = useState(
    existing?.paymentType && existing.paymentType !== "Credit" ? existing.paymentType : "Cash"
  );
  const [lines, setLines] = useState<LineDraft[]>(
    existing?.lines.length
      ? existing.lines.map((l) => ({
          itemId: l.itemId,
          itemName: l.itemName,
          description: l.description ?? "",
          unit: l.unit ?? "NONE",
          quantity: l.quantity,
          rate: l.rate,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
        }))
      : [emptyLine(), emptyLine()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /** Mirrors the server's maths exactly so the on-screen preview always matches what gets saved. */
  const calc = useMemo(() => {
    let qty = 0;
    let discTotal = 0;
    let taxTotal = 0;
    let net = 0;
    const rows = lines.map((l) => {
      const taxPct = Number(l.taxPercent) || 0;
      const rawRate = Number(l.rate) || 0;
      // When the price is entered "with tax", strip the tax back out to get the taxable base.
      const baseRate = priceHasTax ? rawRate / (1 + taxPct / 100) : rawRate;
      const gross = (Number(l.quantity) || 0) * baseRate;
      const disc = (gross * (Number(l.discountPercent) || 0)) / 100;
      const taxable = gross - disc;
      const tax = (taxable * taxPct) / 100;
      qty += Number(l.quantity) || 0;
      discTotal += disc;
      taxTotal += tax;
      net += taxable;
      return { disc, tax, amount: taxable + tax, baseRate };
    });
    const headerDisc = discountPercent > 0 ? (net * discountPercent) / 100 : Number(discountAmount) || 0;
    const beforeRound = net + taxTotal - headerDisc;
    // Round-off nudges the total to the nearest rupee, like Vyapar's checkbox.
    const roundOff = roundOffOn ? Math.round(beforeRound) - beforeRound : 0;
    return { rows, qty, discTotal, taxTotal, net, headerDisc, roundOff, total: beforeRound + roundOff };
  }, [lines, discountPercent, discountAmount, roundOffOn, priceHasTax]);

  // Received defaults to the full total on a cash bill and nothing on credit, until the user edits it.
  const displayReceived = receivedTouched ? received : isCash ? calc.total : 0;
  const balanceDue = Math.max(0, calc.total - displayReceived);
  const selectedParty = parties.find((p) => String(p.id) === partyId) ?? null;

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  /** Picking a party pulls in its phone and, for a sale, its state as the place of supply. */
  function pickParty(value: string) {
    setPartyId(value);
    const p = parties.find((x) => String(x.id) === value);
    if (!p) return;
    setPhone(p.phone ?? "");
    if (p.state && STATES_OF_SUPPLY.includes(p.state)) setStateOfSupply(p.state);
  }

  /** Choosing a catalogue item fills in its rate, unit and tax — the usual billing shortcut. */
  function pickItem(idx: number, value: string) {
    const item = items.find((x) => String(x.id) === value);
    if (!item) {
      setLine(idx, { itemId: null });
      return;
    }
    setLine(idx, {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit || "NONE",
      rate: isPurchase ? item.purchasePrice : item.salePrice,
      taxPercent: item.taxPercent,
    });
  }

  async function save() {
    const clean = lines.filter((l) => l.itemName.trim());
    if (clean.length === 0) {
      setError("Add at least one item.");
      return;
    }
    // A credit bill must be tied to a party so the outstanding balance has an owner.
    if (!isCash && !partyId && !noToggle) {
      setError(`Select a ${isPurchase ? "supplier" : "customer"} for a credit bill.`);
      return;
    }
    // Planning docs and returns always need a party.
    if (partyRequired && !partyId) {
      setError("Select a party.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: vyapar.InvoiceInput = {
        docType,
        bankAccountId: existing ? existing.bankAccountId : bankAccountId ?? null,
        invoiceNo: invoiceNo || undefined,
        invoicePrefix: invoicePrefix || null,
        partyId: partyId ? Number(partyId) : null,
        invoiceDate,
        dueDate: dueDate || null,
        discount: discountPercent > 0 ? 0 : Number(discountAmount) || 0,
        discountPercent: Number(discountPercent) || 0,
        roundOff: calc.roundOff,
        paidAmount: noPayment ? 0 : Math.min(displayReceived, calc.total),
        isCash: noPayment ? false : isCash,
        paymentType: noPayment ? "Credit" : displayReceived > 0 ? paymentMode : "Credit",
        stateOfSupply: stateOfSupply || null,
        terms: terms || null,
        notes: notes || null,
        lines: clean.map((l) => {
          const taxPct = Number(l.taxPercent) || 0;
          const rawRate = Number(l.rate) || 0;
          // Persist the tax-exclusive base rate; the server re-applies tax on top.
          const rate = priceHasTax ? Number((rawRate / (1 + taxPct / 100)).toFixed(2)) : rawRate;
          return {
            itemId: l.itemId,
            itemName: l.itemName.trim(),
            description: l.description || null,
            unit: l.unit === "NONE" ? null : l.unit,
            quantity: Number(l.quantity) || 1,
            rate,
            discountPercent: Number(l.discountPercent) || 0,
            taxPercent: taxPct,
          };
        }),
      };
      if (existing) await vyapar.updateInvoice(existing.id, body);
      else await vyapar.createInvoice(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this document.");
      setSaving(false);
    }
  }

  const relevantParties = parties.filter((p) => (isSupplierSide ? p.partyType === "SUPPLIER" : p.partyType === "CUSTOMER"));
  const partyOptions = relevantParties.length ? relevantParties : parties;

  return (
    <Drawer
      title={existing ? existing.invoiceNo : docHeading}
      onClose={onClose}
      onSave={save}
      saveLabel={saving ? "Saving…" : "Save"}
      width="max-w-6xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* Credit ↔ Cash toggle, exactly like Vyapar's form header (payment docs only) */}
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-gray-800">{docHeading}</span>
          {!noToggle && (
            <div className="flex items-center gap-2">
              <span className={`text-sm ${!isCash ? "font-medium text-brand-accent" : "text-gray-400"}`}>Credit</span>
              <button
                type="button"
                role="switch"
                aria-checked={isCash}
                onClick={() => setIsCash((c) => !c)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isCash ? "bg-brand-accent" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${isCash ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span className={`text-sm ${isCash ? "font-medium text-brand-accent" : "text-gray-400"}`}>Cash</span>
            </div>
          )}
        </div>

        {/* Party on the left, document meta on the right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Field label={partyRequired ? "Party *" : isPurchase ? (isCash ? "Supplier" : "Supplier *") : isCash ? "Customer" : "Customer *"}>
                <Select
                  value={partyId}
                  onChange={pickParty}
                  placeholder="Search by name"
                  options={[{ value: "", label: "Select party" }, ...partyOptions.map((p) => ({ value: String(p.id), label: p.name }))]}
                />
              </Field>
              {selectedParty && (
                <div className={`mt-1 text-xs font-medium ${selectedParty.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  Bal: {inr(Math.abs(selectedParty.balance))} {selectedParty.balance >= 0 ? "to receive" : "to pay"}
                </div>
              )}
            </div>
            <Field label="Phone No.">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="Phone No." />
            </Field>
          </div>

          <div className="space-y-3">
            {singleNumber ? (
              <Field label={numberLabel}>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Auto"
                  className="input"
                />
              </Field>
            ) : (
              <Field label={numberLabel}>
                <div className="flex gap-2">
                  <input
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="Prefix"
                    className="input w-32 font-mono"
                  />
                  <input
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="Auto"
                    className="input flex-1"
                  />
                </div>
              </Field>
            )}
            <div className={showDueDate ? "grid grid-cols-2 gap-3" : ""}>
              <Field label={dateLabel}>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} placeholder={dateLabel.toLowerCase()} />
              </Field>
              {showDueDate && (
                <Field label="Due Date">
                  <DatePicker value={dueDate} onChange={setDueDate} min={invoiceDate || undefined} placeholder="Due date" />
                </Field>
              )}
            </div>
            <Field label="State of supply">
              <Select
                value={stateOfSupply}
                onChange={setStateOfSupply}
                placeholder="Select"
                options={[{ value: "", label: "Select" }, ...STATES_OF_SUPPLY.map((s) => ({ value: s, label: s }))]}
              />
            </Field>
          </div>
        </div>

        {/* Line grid */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Description</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-24 px-2 py-2">Unit</th>
                <th className="w-32 px-2 py-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span>Price/Unit</span>
                    <select
                      value={priceHasTax ? "with" : "without"}
                      onChange={(e) => setPriceHasTax(e.target.value === "with")}
                      className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-normal normal-case text-gray-600 outline-none focus:border-cyan-500"
                    >
                      <option value="without">Without Tax</option>
                      <option value="with">With Tax</option>
                    </select>
                  </div>
                </th>
                <th className="w-20 px-2 py-2 text-right">Disc %</th>
                <th className="w-24 px-2 py-2 text-right">Disc ₹</th>
                <th className="w-20 px-2 py-2 text-right">Tax %</th>
                <th className="w-24 px-2 py-2 text-right">Tax ₹</th>
                <th className="w-28 px-2 py-2 text-right">Amount</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5 text-center text-xs text-gray-400">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={l.itemId ? String(l.itemId) : ""}
                      onChange={(v) => pickItem(idx, v)}
                      size="sm"
                      placeholder="Select item"
                      options={[{ value: "", label: "Custom item" }, ...items.map((i) => ({ value: String(i.id), label: i.name }))]}
                    />
                    <input
                      value={l.itemName}
                      onChange={(e) => setLine(idx, { itemName: e.target.value })}
                      placeholder="Item name"
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.description}
                      onChange={(e) => setLine(idx, { description: e.target.value })}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <Num value={l.quantity} onChange={(v) => setLine(idx, { quantity: v })} />
                  <td className="px-2 py-1.5">
                    <Select value={l.unit} onChange={(v) => setLine(idx, { unit: v })} size="sm" options={UNITS.map((u) => ({ value: u, label: u }))} />
                  </td>
                  <Num value={l.rate} onChange={(v) => setLine(idx, { rate: v })} />
                  <Num value={l.discountPercent} onChange={(v) => setLine(idx, { discountPercent: v })} />
                  <td className="px-2 py-1.5 text-right text-gray-500">{calc.rows[idx] ? inr(calc.rows[idx].disc) : "—"}</td>
                  <Num value={l.taxPercent} onChange={(v) => setLine(idx, { taxPercent: v })} />
                  <td className="px-2 py-1.5 text-right text-gray-500">{calc.rows[idx] ? inr(calc.rows[idx].tax) : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-gray-800">{calc.rows[idx] ? inr(calc.rows[idx].amount) : "—"}</td>
                  <td className="px-1 py-1.5">
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {/* Totals row, as in Vyapar's grid footer */}
              <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
                <td className="px-2 py-2" />
                <td className="px-2 py-2">
                  <button
                    onClick={() => setLines((p) => [...p, emptyLine()])}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </td>
                <td className="px-2 py-2 text-right text-xs text-gray-500">TOTAL</td>
                <td className="px-2 py-2 text-right">{calc.qty}</td>
                <td />
                <td />
                <td />
                <td className="px-2 py-2 text-right">{inr(calc.discTotal)}</td>
                <td />
                <td className="px-2 py-2 text-right">{inr(calc.taxTotal)}</td>
                <td className="px-2 py-2 text-right">{inr(calc.net + calc.taxTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Terms on the left, totals on the right */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-2 text-sm font-semibold text-gray-700">Terms &amp; Conditions</div>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              className="input resize-none"
            />
            <div className="mt-3">
              <Field label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
              </Field>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
            <Row label="Sub Total" value={inr(calc.net)} />
            <Row label="Tax" value={inr(calc.taxTotal)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">Discount</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => {
                    setDiscountPercent(Number(e.target.value));
                    if (Number(e.target.value) > 0) setDiscountAmount(0);
                  }}
                  className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                />
                <span className="text-xs text-gray-400">%</span>
                <span className="text-gray-300">–</span>
                <input
                  type="number"
                  value={discountPercent > 0 ? Math.round(calc.headerDisc) : discountAmount}
                  disabled={discountPercent > 0}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="text-xs text-gray-400">₹</span>
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 pt-1">
              <span className="flex items-center gap-2 text-gray-500">
                <input type="checkbox" checked={roundOffOn} onChange={(e) => setRoundOffOn(e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                Round Off
              </span>
              <span className="text-gray-600">{calc.roundOff >= 0 ? "+" : "−"}{inr(Math.abs(calc.roundOff))}</span>
            </label>
            <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="text-xl font-semibold text-gray-900">{inr(calc.total)}</span>
            </div>
            {!noPayment && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-gray-500">{moneyLabel}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">₹</span>
                  <input
                    type="number"
                    value={displayReceived}
                    onChange={(e) => { setReceived(Number(e.target.value)); setReceivedTouched(true); }}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}
            {!noPayment && displayReceived > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Payment Type</span>
                <Select
                  value={paymentMode}
                  onChange={setPaymentMode}
                  size="sm"
                  className="w-44"
                  options={paymentTypeOptions}
                />
              </div>
            )}
            {!noPayment && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Balance Due</span>
                <span className={`font-medium ${balanceDue > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inr(balanceDue)}</span>
              </div>
            )}
            {!noPayment && (
              <p className="pt-1 text-[11px] text-gray-400">
                {balanceDue <= 0 ? "Fully paid on save." : `${inr(balanceDue)} will stay outstanding.`}
              </p>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/** Numeric grid cell. */
function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-2 py-1.5">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
      />
    </td>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
