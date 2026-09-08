"use client";

import { useMemo, useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { PartyDialog } from "@/components/vyapar/PartyDialog";
import { DatePicker } from "@/components/DatePicker";
import { inr } from "@/lib/format";
import * as procurement from "@/lib/procurementApi";
import type { Rfq } from "@/lib/procurementApi";
import type { Party } from "@/lib/vyaparApi";

/**
 * Key in what a supplier came back with.
 *
 * The rate box is deliberately left **empty**, not zeroed. An empty box saves as "no quote" and the
 * comparison shows it as such; a zero would be a real price of nothing and would win every
 * comparison it appeared in. Vendors skip lines all the time, so this distinction is the point.
 *
 * Saving again for the same vendor replaces their quote and bumps its version — the comparison
 * keeps one column per supplier rather than sprouting a new one per revision.
 */
export function QuoteDialog({
  rfq,
  vendors,
  existingVendorId,
  onClose,
  onSaved,
  onVendorAdded,
}: {
  rfq: Rfq;
  vendors: Party[];
  /** Set when revising a quote already on file. */
  existingVendorId?: number;
  onClose: () => void;
  onSaved: (saved: Rfq) => void;
  /** Lets the page behind refresh its party list after one is created from in here. */
  onVendorAdded?: (created: Party) => void;
}) {
  const existing = rfq.quotes.find((q) => q.vendorPartyId === existingVendorId);

  const [vendorId, setVendorId] = useState(existingVendorId != null ? String(existingVendorId) : "");
  const [receivedOn, setReceivedOn] = useState(existing?.receivedOn ?? new Date().toISOString().slice(0, 10));
  const [deliveryDays, setDeliveryDays] = useState(existing?.deliveryDays != null ? String(existing.deliveryDays) : "");
  const [taxPercent, setTaxPercent] = useState(String(existing?.taxPercent ?? 18));
  const [discount, setDiscount] = useState(String(existing?.discount ?? 0));
  const [charges, setCharges] = useState(String(existing?.charges ?? 0));
  const [note, setNote] = useState(existing?.note ?? "");
  const [rates, setRates] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const l of rfq.lines) {
      const cell = existing?.lines.find((c) => c.rfqLineId === l.id);
      out[l.id] = cell?.rate != null ? String(cell.rate) : "";
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  // A supplier created from inside this drawer, held here so it can be selected before the page
  // behind has refetched its party list.
  const [freshVendor, setFreshVendor] = useState<Party | null>(null);

  /** What this quote comes to, priced the way the comparison will price it. */
  const total = useMemo(() => {
    const sub = rfq.lines.reduce((s, l) => {
      const r = rates[l.id];
      return s + (r === "" || r == null ? 0 : Number(r) * l.quantity);
    }, 0);
    const afterTerms = sub - (Number(discount) || 0) + (Number(charges) || 0);
    return afterTerms + (afterTerms * (Number(taxPercent) || 0)) / 100;
  }, [rfq.lines, rates, discount, charges, taxPercent]);

  const priced = rfq.lines.filter((l) => rates[l.id] !== "" && rates[l.id] != null).length;

  async function save() {
    if (!vendorId) return setError("Which supplier is this quote from?");
    if (priced === 0) return setError("Enter a rate for at least one line.");

    setSaving(true);
    setError("");
    try {
      const saved = await procurement.saveQuote(rfq.id, {
        vendorPartyId: Number(vendorId),
        receivedOn: receivedOn || null,
        deliveryDays: deliveryDays === "" ? null : Number(deliveryDays),
        discount: Number(discount) || 0,
        charges: Number(charges) || 0,
        taxPercent: Number(taxPercent) || 0,
        note: note.trim() || null,
        lines: rfq.lines.map((l) => ({
          rfqLineId: l.id,
          // Empty stays null — "no quote", never a price of zero.
          rate: rates[l.id] === "" || rates[l.id] == null ? null : Number(rates[l.id]),
        })),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this quote.");
      setSaving(false);
    }
  }

  /**
   * The suppliers this enquiry actually went to, first and labelled — then everyone else.
   *
   * A quote almost always comes back from someone who was asked for one, and hunting for that name
   * in an alphabetical list of every party on file is the wrong way round. The rest stay selectable
   * below the divider, because a supplier who was never invited does sometimes quote anyway.
   */
  const options = useMemo(() => {
    const all = freshVendor && !vendors.some((v) => v.id === freshVendor.id) ? [...vendors, freshVendor] : vendors;
    const invitedIds = new Set(rfq.suppliers.map((s) => s.vendorPartyId));
    const byName = (a: Party, b: Party) => a.name.localeCompare(b.name);

    const invited = all.filter((p) => invitedIds.has(p.id)).sort(byName);
    const rest = all
      .filter((p) => !invitedIds.has(p.id))
      .sort((a, b) => {
        const rank = (p: Party) => (p.partyType === "SUPPLIER" ? 0 : 1);
        return rank(a) - rank(b) || byName(a, b);
      });

    const row = (p: Party) => ({
      value: String(p.id),
      // Who has already answered matters when keying a stack of replies.
      label: rfq.quotes.some((q) => q.vendorPartyId === p.id) ? `${p.name} — quoted` : p.name,
    });

    // Suppliers named on the enquiry but no longer in the party list (deleted, or scoped to another
    // project) would otherwise vanish from a quote that is theirs. Fall back to the stored name.
    const missing = rfq.suppliers
      .filter((s) => !all.some((p) => p.id === s.vendorPartyId))
      .map((s) => ({ value: String(s.vendorPartyId), label: s.vendorName }));

    if (invited.length === 0 && missing.length === 0) return rest.map(row);
    return [
      { value: "__asked", label: `Asked on ${rfq.rfqNo}`, header: true },
      ...invited.map(row),
      ...missing,
      ...(rest.length ? [{ value: "__other", label: "Other parties", header: true }] : []),
      ...rest.map(row),
    ];
  }, [vendors, freshVendor, rfq.suppliers, rfq.quotes, rfq.rfqNo]);

  return (
    <Drawer
      title={existing ? `Revise quote · ${existing.vendorName}` : `Enter quote · ${rfq.rfqNo}`}
      onClose={onClose}
      onSave={save}
      saveLabel={saving ? "Saving…" : existing ? `Save as v${existing.version + 1}` : "Save Quote"}
      dirty
      width="max-w-2xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DrawerField label="Supplier" required>
            <Select
              value={vendorId}
              onChange={setVendorId}
              placeholder="Which supplier"
              disabled={!!existing}
              options={options}
              // A quote arriving from a firm nobody has entered yet is common enough that sending
              // the user off to Vyapar → Parties (and losing the rates already keyed) is a real cost.
              onCreate={existing ? undefined : () => setAddingVendor(true)}
              createLabel="Add new supplier"
            />
          </DrawerField>
          <DrawerField label="Received on">
            <DatePicker value={receivedOn} onChange={setReceivedOn} placeholder="Date" />
          </DrawerField>
        </div>

        {/* Rates, one row per line of the enquiry */}
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="px-3 py-2">Item</th>
                <th className="w-20 px-3 py-2 text-right">Qty</th>
                <th className="w-32 px-3 py-2 text-right">Rate</th>
                <th className="w-28 px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {rfq.lines.map((l) => {
                const raw = rates[l.id] ?? "";
                const overBudget = l.budgetRate != null && raw !== "" && Number(raw) > l.budgetRate;
                return (
                  <tr key={l.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="text-gray-800">{l.itemName}</div>
                      {l.budgetRate != null && (
                        <div className="text-[11px] text-gray-400">budget {inr(l.budgetRate)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={raw}
                        onChange={(e) => setRates((p) => ({ ...p, [l.id]: e.target.value }))}
                        placeholder="no quote"
                        className={`w-full rounded-md border px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 ${
                          overBudget ? "border-amber-300 bg-amber-50/50" : "border-gray-200"
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {raw === "" ? <span className="text-xs text-gray-400 italic">—</span> : inr(Number(raw) * l.quantity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="-mt-3 text-xs text-gray-400">
          Leave a rate empty if they didn&apos;t quote that line — it shows as &ldquo;No quote&rdquo;, not zero.
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DrawerField label="Delivery (days)">
            <input
              type="number"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              placeholder="—"
              className="input"
            />
          </DrawerField>
          <DrawerField label="Discount ₹">
            <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="input" />
          </DrawerField>
          <DrawerField label="Charges ₹">
            <input type="number" value={charges} onChange={(e) => setCharges(e.target.value)} className="input" />
          </DrawerField>
          <DrawerField label="Tax %">
            <input type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} className="input" />
          </DrawerField>
        </div>

        <DrawerField label="Note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. ex-works, validity 15 days"
            className="input"
          />
        </DrawerField>

        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
          <span className="text-sm text-gray-500">
            {priced} of {rfq.lines.length} lines priced
          </span>
          <div className="text-right">
            <div className="text-[11px] tracking-wide text-gray-400 uppercase">Quote total</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{inr(total)}</div>
          </div>
        </div>
      </div>

      {addingVendor && (
        <PartyDialog
          defaultType="SUPPLIER"
          onClose={() => setAddingVendor(false)}
          onSaved={(created) => {
            setFreshVendor(created);
            setVendorId(String(created.id));
            setAddingVendor(false);
            onVendorAdded?.(created);
          }}
        />
      )}
    </Drawer>
  );
}
