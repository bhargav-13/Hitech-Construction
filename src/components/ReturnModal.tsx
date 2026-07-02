"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import type { Checkout } from "@/lib/types";

export function ReturnModal({
  checkout,
  onClose,
}: {
  checkout: Checkout;
  onClose: () => void;
}) {
  const items = useAppStore((s) => s.warehouseItems);
  const returnCheckout = useAppStore((s) => s.returnCheckout);

  const item = items.find((i) => i.id === checkout.itemId);
  const outstanding = checkout.qty - checkout.returnedQty;

  const [quantity, setQuantity] = useState(String(outstanding));
  const [date, setDate] = useState("02-Jul-2026");

  const qtyNum = Number(quantity);
  const canSave = qtyNum > 0 && qtyNum <= outstanding;

  function save() {
    if (!canSave) return;
    returnCheckout(checkout.id, qtyNum, date || "02-Jul-2026");
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">Return Item</h2>
        <p className="mb-6 text-sm text-gray-500">
          {item?.name} · issued to <span className="font-medium text-gray-700">{checkout.issuedTo}</span>
        </p>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
          <span className="text-gray-500">Currently out</span>
          <span className="font-medium text-gray-700">
            {outstanding} {item?.unit}
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Return Quantity</span>
              <input
                type="number"
                min={0}
                max={outstanding}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
              <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
          </div>

          {qtyNum > outstanding && (
            <div className="rounded-lg bg-rose-50 px-4 py-2 text-xs font-medium text-rose-600">
              Cannot return more than {outstanding} {item?.unit}.
            </div>
          )}

          <button
            onClick={save}
            disabled={!canSave}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Confirm Return
          </button>
        </div>
      </div>
    </Modal>
  );
}
