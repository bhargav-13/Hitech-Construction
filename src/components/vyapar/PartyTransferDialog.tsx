"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { PartyDialog } from "@/components/vyapar/PartyDialog";
import { useVyaparProjectId } from "@/lib/projectScope";
import { inr } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Invoice, Party } from "@/lib/vyaparApi";

/**
 * Move a balance from one party to another.
 *
 * Not an invoice, which is why this is its own form rather than the shared document builder: no
 * items, no tax, no payment, and — uniquely in the ledger — two parties. What the source owes falls
 * by the amount and what the destination owes rises by the same, so the books are unchanged in
 * total. It is the entry for "the amount sat against the wrong firm", or for netting a sister
 * concern's account off against its parent.
 *
 * The amount rides on a single untaxed line so the document shares the numbering, project scoping
 * and cancellation behaviour of everything else in the ledger; the server reads its total from
 * there. Nothing else about a transfer touches the invoice machinery.
 */
export function PartyTransferDialog({
  existing,
  parties,
  onClose,
  onSaved,
  onPartyCreated,
}: {
  existing?: Invoice;
  parties: Party[];
  onClose: () => void;
  onSaved: (saved: Invoice) => void;
  onPartyCreated?: (created: Party) => void;
}) {
  const projectId = useVyaparProjectId();
  const [fromId, setFromId] = useState(existing?.partyId != null ? String(existing.partyId) : "");
  const [toId, setToId] = useState(existing?.transferToPartyId != null ? String(existing.transferToPartyId) : "");
  const [amount, setAmount] = useState(existing ? String(existing.total) : "");
  const [date, setDate] = useState(existing?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState(existing?.invoiceNo ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [creating, setCreating] = useState<"from" | "to" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(
    () =>
      [...parties]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
          value: String(p.id),
          // The running balance is the whole reason for picking one party over another here.
          label: `${p.name} · ${inr(Math.abs(p.balance))} ${p.balance >= 0 ? "to receive" : "to pay"}`,
        })),
    [parties],
  );

  const from = parties.find((p) => String(p.id) === fromId) ?? null;
  const to = parties.find((p) => String(p.id) === toId) ?? null;
  const value = Number(amount) || 0;

  async function save() {
    if (!fromId) return setError("Which party is the balance moving from?");
    if (!toId) return setError("Which party is it moving to?");
    if (fromId === toId) return setError("Pick two different parties — a transfer to the same party moves nothing.");
    if (value <= 0) return setError("Enter the amount to transfer.");

    setSaving(true);
    setError("");
    try {
      const body: vyapar.InvoiceInput = {
        docType: "PARTY_TRANSFER",
        invoiceNo: refNo.trim() || undefined,
        partyId: Number(fromId),
        transferToPartyId: Number(toId),
        invoiceDate: date || undefined,
        // Never settled: a transfer has nothing outstanding on it, it relocates what already is.
        paidAmount: 0,
        paymentType: "Credit",
        isCash: false,
        notes: notes.trim() || null,
        projectId: projectId ?? null,
        lines: [
          {
            itemId: null,
            itemName: `Balance transfer${to ? ` to ${to.name}` : ""}`,
            quantity: 1,
            rate: value,
            taxPercent: 0,
          },
        ],
      };
      const saved = existing ? await vyapar.updateInvoice(existing.id, body) : await vyapar.createInvoice(body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this transfer.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? `Edit transfer · ${existing.invoiceNo}` : "Party To Party Transfer"}
      onClose={onClose}
      onSave={save}
      saveLabel={saving ? "Saving…" : "Save Transfer"}
      width="max-w-2xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DrawerField label="Transfer from" required hint="What this party owes falls by the amount.">
            <Select
              value={fromId}
              onChange={setFromId}
              placeholder="Which party"
              options={options}
              onCreate={() => setCreating("from")}
              createLabel="Add new party"
            />
          </DrawerField>
          <DrawerField label="Transfer to" required hint="What this party owes rises by the same.">
            <Select
              value={toId}
              onChange={setToId}
              placeholder="Which party"
              options={options}
              onCreate={() => setCreating("to")}
              createLabel="Add new party"
            />
          </DrawerField>
          <DrawerField label="Amount" required>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="input text-right"
            />
          </DrawerField>
          <DrawerField label="Date">
            <DatePicker value={date} onChange={setDate} placeholder="Date" />
          </DrawerField>
          <DrawerField label="Reference no.">
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Auto" className="input" />
          </DrawerField>
        </div>

        {/* What this will actually do to the two balances, before it is saved. */}
        {from && to && value > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div className="mb-3 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
              After this transfer
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <BalanceAfter name={from.name} before={from.balance} after={from.balance - value} />
              <ArrowRight size={16} className="shrink-0 text-gray-300" />
              <BalanceAfter name={to.name} before={to.balance} after={to.balance + value} />
            </div>
          </div>
        )}

        <DrawerField label="Note">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Why the balance is being moved — the wrong firm was billed, a sister concern is settling…"
            className="input resize-none"
          />
        </DrawerField>
      </div>

      {creating && (
        <PartyDialog
          onClose={() => setCreating(null)}
          onSaved={(created) => {
            onPartyCreated?.(created);
            if (creating === "from") setFromId(String(created.id));
            else setToId(String(created.id));
            setCreating(null);
          }}
        />
      )}
    </Drawer>
  );
}

function BalanceAfter({ name, before, after }: { name: string; before: number; after: number }) {
  const label = (v: number) => `${inr(Math.abs(v))} ${v >= 0 ? "to receive" : "to pay"}`;
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="truncate text-sm font-medium text-gray-800">{name}</div>
      <div className="mt-0.5 text-xs text-gray-400">
        <span className="line-through">{label(before)}</span>{" "}
        <span className={`font-medium ${after >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{label(after)}</span>
      </div>
    </div>
  );
}
