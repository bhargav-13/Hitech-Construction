"use client";

import { Trash2 } from "lucide-react";
import type { FinanceItem } from "@/lib/types";
import { formatRupee } from "@/lib/projectHelpers";

export interface LineDraft {
  itemId: string;
  qty: number;
}

export function LineItemsEditor({
  items,
  lines,
  onChange,
}: {
  items: FinanceItem[];
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
}) {
  function updateLine(index: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function addLine() {
    onChange([...lines, { itemId: items[0]?.id ?? "", qty: 1 }]);
  }

  const subtotal = lines.reduce((sum, l) => {
    const item = items.find((i) => i.id === l.itemId);
    return sum + (item ? item.rate * l.qty : 0);
  }, 0);
  const gstAmount = lines.reduce((sum, l) => {
    const item = items.find((i) => i.id === l.itemId);
    return sum + (item ? (item.rate * l.qty * item.gstRate) / 100 : 0);
  }, 0);

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 text-xs font-medium text-gray-500">
        <div>Item</div>
        <div>Qty</div>
        <div>Rate</div>
        <div>Amount</div>
        <div />
      </div>
      <div className="space-y-2">
        {lines.map((line, i) => {
          const item = items.find((it) => it.id === line.itemId);
          const amount = item ? item.rate * line.qty : 0;
          return (
            <div key={i} className="grid grid-cols-[1fr_80px_100px_100px_32px] items-center gap-2">
              <select
                value={line.itemId}
                onChange={(e) => updateLine(i, { itemId: e.target.value })}
                className="input"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={line.qty}
                onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                className="input"
              />
              <div className="text-sm text-gray-500">{item ? formatRupee(item.rate) : "—"}</div>
              <div className="text-sm font-medium text-gray-700">{formatRupee(amount)}</div>
              <button onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={addLine}
        className="mt-2 text-xs font-medium text-brand-accent hover:underline"
      >
        + Add Line
      </button>

      <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span>
          <span>{formatRupee(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>GST</span>
          <span>{formatRupee(Math.round(gstAmount))}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-gray-800">
          <span>Total</span>
          <span>{formatRupee(Math.round(subtotal + gstAmount))}</span>
        </div>
      </div>
    </div>
  );
}
