"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import { itemStock } from "@/lib/warehouseHelpers";

export function StockMovementModal({
  mode,
  defaultItemId,
  onClose,
}: {
  mode: "Received" | "Issued";
  defaultItemId?: string;
  onClose: () => void;
}) {
  const items = useAppStore((s) => s.warehouseItems);
  const warehouses = useAppStore((s) => s.warehouses);
  const projects = useAppStore((s) => s.projects);
  const movements = useAppStore((s) => s.stockMovements);
  const receiveStock = useAppStore((s) => s.receiveStock);
  const issueStock = useAppStore((s) => s.issueStock);

  const [itemId, setItemId] = useState(defaultItemId ?? items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("02-Jul-2026");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [issuedTo, setIssuedTo] = useState("");
  const [reference, setReference] = useState("");

  const item = items.find((i) => i.id === itemId);
  const warehouse = warehouses.find((w) => w.id === item?.warehouseId);
  const available = useMemo(
    () => (item ? itemStock(item, movements).closing : 0),
    [item, movements]
  );

  const isIssue = mode === "Issued";
  const qtyNum = Number(quantity);
  const overIssue = isIssue && qtyNum > available;
  const canSave = item && qtyNum > 0 && !overIssue && (!isIssue || (item.kind === "Consumable" || issuedTo.trim()));

  function save() {
    if (!canSave || !item) return;
    if (isIssue) {
      issueStock({
        itemId: item.id,
        quantity: qtyNum,
        date: date || "02-Jul-2026",
        projectId,
        issuedTo: item.kind === "Returnable" ? issuedTo.trim() : undefined,
        reference: reference.trim() || (item.kind === "Returnable" ? "Checkout" : "Site issue"),
      });
    } else {
      receiveStock({
        itemId: item.id,
        quantity: qtyNum,
        date: date || "02-Jul-2026",
        reference: reference.trim() || "Stock received",
      });
    }
    onClose();
  }

  const accent = isIssue ? "text-rose-600" : "text-green-600";

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {isIssue ? "Issue Stock" : "Receive Stock"}
          </h2>
          <span className={`text-xs font-medium ${accent}`}>
            {isIssue ? "Stock Out" : "Stock In"}
          </span>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Item</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="input">
              {items.map((i) => {
                const wh = warehouses.find((w) => w.id === i.warehouseId);
                return (
                  <option key={i.id} value={i.id}>
                    {i.name} · {wh?.name}
                  </option>
                );
              })}
            </select>
          </label>

          {item && (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
              <span className="text-gray-500">
                {warehouse?.name} · <span className="text-gray-700">{item.kind}</span>
              </span>
              <span className="font-medium text-gray-700">
                In stock: {available} {item.unit}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Quantity {item ? `(${item.unit})` : ""}
              </span>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input"
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Date</span>
              <input value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
          </div>

          {overIssue && (
            <div className="rounded-lg bg-rose-50 px-4 py-2 text-xs font-medium text-rose-600">
              Only {available} {item?.unit} available in {warehouse?.name}.
            </div>
          )}

          {isIssue && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Issue to Project / Site</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isIssue && item?.kind === "Returnable" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Issued to (worker) <span className="text-rose-500">*</span>
              </span>
              <input
                value={issuedTo}
                onChange={(e) => setIssuedTo(e.target.value)}
                className="input"
                placeholder="Worker name — needed for return tracking"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              {isIssue ? "Purpose / Note" : "Reference (PO / vendor)"}
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="input"
              placeholder={isIssue ? "e.g. Slab casting" : "e.g. PO-2026-0012"}
            />
          </label>

          {isIssue && item?.kind === "Returnable" && (
            <div className="rounded-lg bg-brand-accent/5 px-4 py-2.5 text-xs text-gray-500">
              This creates an open <span className="font-medium text-brand-accent">checkout</span>. Mark
              it returned from the Checkouts tab when the worker brings it back.
            </div>
          )}

          <button
            onClick={save}
            disabled={!canSave}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {isIssue ? "Issue Stock" : "Receive Stock"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
