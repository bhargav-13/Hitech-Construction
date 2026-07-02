"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import { itemStock } from "@/lib/warehouseHelpers";
import type { MaterialRequest } from "@/lib/types";

export function FulfillRequestModal({
  request,
  onClose,
}: {
  request: MaterialRequest;
  onClose: () => void;
}) {
  const items = useAppStore((s) => s.warehouseItems);
  const movements = useAppStore((s) => s.stockMovements);
  const fulfillMaterialRequest = useAppStore((s) => s.fulfillMaterialRequest);

  const [issued, setIssued] = useState<Record<string, string>>(
    Object.fromEntries(request.lines.map((l) => [l.itemId, String(l.qty)]))
  );
  const [workers, setWorkers] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [date, setDate] = useState("02-Jul-2026");

  const rows = request.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    const available = item ? itemStock(item, movements).closing : 0;
    const qty = Number(issued[l.itemId] ?? 0);
    return { line: l, item, available, qty, over: qty > available };
  });

  const anyOver = rows.some((r) => r.over);
  const anyQty = rows.some((r) => r.qty > 0);
  const canSave = workers.trim() && vehicle.trim() && anyQty && !anyOver;

  function save() {
    if (!canSave) return;
    fulfillMaterialRequest(request.id, {
      dispatch: { workers: workers.trim(), vehicle: vehicle.trim(), driver: driver.trim(), date: date || "02-Jul-2026" },
      issued: rows.map((r) => ({ itemId: r.line.itemId, qty: r.qty })),
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">Dispatch Request · {request.number}</h2>
        <p className="mb-6 text-sm text-gray-500">
          Confirm quantities and record who collected the material.
        </p>

        {/* Items to issue */}
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-500">
            <div>Item</div>
            <div className="text-right">Requested</div>
            <div className="text-right">In Stock</div>
            <div className="text-right">Issue Qty</div>
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
                {r.line.qty} {r.item?.unit}
              </div>
              <div className={`text-right text-sm ${r.over ? "text-rose-600" : "text-gray-600"}`}>
                {r.available} {r.item?.unit}
              </div>
              <div className="text-right">
                <input
                  type="number"
                  min={0}
                  max={r.available}
                  value={issued[r.line.itemId] ?? ""}
                  onChange={(e) => setIssued((s) => ({ ...s, [r.line.itemId]: e.target.value }))}
                  className={`input w-24 text-right ${r.over ? "border-rose-300" : ""}`}
                />
              </div>
            </div>
          ))}
        </div>
        {anyOver && (
          <div className="mt-2 text-xs font-medium text-rose-600">
            One or more quantities exceed available stock.
          </div>
        )}

        {/* Dispatch details */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Workers who collected <span className="text-rose-500">*</span>
            </span>
            <input
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
              className="input"
              placeholder="e.g. Anil, Rakesh, Dinesh"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Vehicle / Truck No. <span className="text-rose-500">*</span>
            </span>
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="input"
              placeholder="e.g. GJ-01-AB-1234"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Driver</span>
            <input value={driver} onChange={(e) => setDriver(e.target.value)} className="input" placeholder="Driver name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Dispatch Date</span>
            <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </label>
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-6 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Confirm Dispatch
        </button>
      </div>
    </Modal>
  );
}
