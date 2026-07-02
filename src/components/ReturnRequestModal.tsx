"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import type { MaterialRequest } from "@/lib/types";

export function ReturnRequestModal({
  request,
  onClose,
}: {
  request: MaterialRequest;
  onClose: () => void;
}) {
  const items = useAppStore((s) => s.warehouseItems);
  const returnMaterialRequest = useAppStore((s) => s.returnMaterialRequest);

  const [returns, setReturns] = useState<Record<string, string>>({});
  const [date, setDate] = useState("02-Jul-2026");

  // Only lines that were actually dispatched can come back.
  const rows = request.lines
    .filter((l) => l.issuedQty > 0)
    .map((l) => {
      const item = items.find((i) => i.id === l.itemId);
      const outstanding = l.issuedQty - l.returnedQty;
      const qty = Number(returns[l.itemId] ?? 0);
      return { line: l, item, outstanding, qty, over: qty > outstanding };
    });

  const anyOver = rows.some((r) => r.over);
  const anyQty = rows.some((r) => r.qty > 0);
  const canSave = anyQty && !anyOver;

  function save() {
    if (!canSave) return;
    returnMaterialRequest(request.id, {
      date: date || "02-Jul-2026",
      returns: rows.filter((r) => r.qty > 0).map((r) => ({ itemId: r.line.itemId, qty: r.qty })),
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">Record Return · {request.number}</h2>
        <p className="mb-6 text-sm text-gray-500">
          Returnable tools and leftover consumables coming back to the warehouse.
        </p>

        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-500">
            <div>Item</div>
            <div className="text-right">Issued</div>
            <div className="text-right">Still Out</div>
            <div className="text-right">Return Qty</div>
          </div>
          {rows.map((r) => (
            <div
              key={r.line.itemId}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-3 border-b border-gray-50 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">{r.item?.name}</div>
                <div className="text-[11px] text-gray-400">{r.item?.kind}</div>
              </div>
              <div className="text-right text-sm text-gray-600">
                {r.line.issuedQty} {r.item?.unit}
              </div>
              <div className="text-right text-sm text-gray-600">
                {r.outstanding} {r.item?.unit}
              </div>
              <div className="text-right">
                <input
                  type="number"
                  min={0}
                  max={r.outstanding}
                  value={returns[r.line.itemId] ?? ""}
                  onChange={(e) => setReturns((s) => ({ ...s, [r.line.itemId]: e.target.value }))}
                  className={`input w-24 text-right ${r.over ? "border-rose-300" : ""}`}
                  disabled={r.outstanding <= 0}
                />
              </div>
            </div>
          ))}
        </div>
        {anyOver && (
          <div className="mt-2 text-xs font-medium text-rose-600">Return quantity exceeds what is still out.</div>
        )}

        <label className="mt-4 block max-w-[12rem]">
          <span className="mb-1 block text-xs font-medium text-gray-500">Return Date</span>
          <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-6 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Confirm Return
        </button>
      </div>
    </Modal>
  );
}
