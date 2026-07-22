"use client";

import { useState } from "react";
import { Drawer } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { inr } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { MinusCircle, PlusCircle } from "lucide-react";

/** Manual stock correction for damage, wastage or a recount — Vyapar's "Adjust Item". */
export function AdjustStockDialog({
  item,
  onClose,
  onDone,
}: {
  item: Item;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"ADD" | "REDUCE">("ADD");
  const [quantity, setQuantity] = useState(0);
  const [atPrice, setAtPrice] = useState(item.purchasePrice);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const resulting = mode === "ADD" ? item.stockQty + (Number(quantity) || 0) : item.stockQty - (Number(quantity) || 0);

  async function submit() {
    if (!quantity || Number(quantity) <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (resulting < 0) {
      setError("That would take stock below zero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await vyapar.adjustStock(item.id, {
        mode,
        quantity: Number(quantity),
        atPrice: Number(atPrice) || 0,
        date,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't adjust stock.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`Adjust Stock — ${item.name}`}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "Saving…" : "Adjust"}
      width="max-w-lg"
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          Current stock <span className="font-medium text-gray-800">{item.stockQty} {item.unit}</span> · value{" "}
          <span className="font-medium text-gray-800">{inr(item.stockValue)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["ADD", "REDUCE"] as const).map((m) => {
            const on = mode === m;
            const Icon = m === "ADD" ? PlusCircle : MinusCircle;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-95 ${
                  on
                    ? m === "ADD"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon size={15} /> {m === "ADD" ? "Add Stock" : "Reduce Stock"}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="input" autoFocus />
          </Field>
          <Field label="At Price">
            <input type="number" value={atPrice} onChange={(e) => setAtPrice(Number(e.target.value))} className="input" />
          </Field>
          <Field label="Date">
            <DatePicker value={date} onChange={setDate} placeholder="Adjustment date" />
          </Field>
          <Field label="Reason">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damage, recount…" className="input" />
          </Field>
        </div>

        <div className={`rounded-lg px-3 py-2 text-sm ${resulting < 0 ? "bg-rose-50 text-rose-600" : "bg-cyan-50 text-brand-accent"}`}>
          Stock after adjustment: <span className="font-semibold">{resulting} {item.unit}</span>
        </div>
      </div>
    </Drawer>
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
