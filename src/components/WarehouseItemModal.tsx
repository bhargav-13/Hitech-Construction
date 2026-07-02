"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import { ITEM_CATEGORIES, ITEM_UNITS, type ItemKind } from "@/lib/types";

const KINDS: { value: ItemKind; label: string; hint: string }[] = [
  { value: "Consumable", label: "Consumable", hint: "Used up on site (diesel, cement…)" },
  { value: "Returnable", label: "Returnable", hint: "Tools & machines that come back" },
];

export function WarehouseItemModal({
  defaultWarehouseId,
  onClose,
}: {
  defaultWarehouseId?: string;
  onClose: () => void;
}) {
  const warehouses = useAppStore((s) => s.warehouses);
  const addWarehouseItem = useAppStore((s) => s.addWarehouseItem);

  const [warehouseId, setWarehouseId] = useState(
    defaultWarehouseId ?? warehouses[0]?.id ?? ""
  );
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(ITEM_CATEGORIES[0]);
  const [kind, setKind] = useState<ItemKind>("Consumable");
  const [unit, setUnit] = useState<string>(ITEM_UNITS[0]);
  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [rate, setRate] = useState("");

  const canSave = name.trim() && warehouseId;

  function save() {
    if (!canSave) return;
    addWarehouseItem({
      warehouseId,
      name: name.trim(),
      category,
      kind,
      unit,
      openingStock: Number(openingStock) || 0,
      reorderLevel: Number(reorderLevel) || 0,
      rate: Number(rate) || 0,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">Add Item to Warehouse</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">Item Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Cement OPC 53 / Concrete Vibrator"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Warehouse</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="input">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              {ITEM_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">Item Type</span>
            <div className="grid grid-cols-2 gap-3">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    kind === k.value
                      ? "border-brand-accent bg-brand-accent/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      kind === k.value ? "text-brand-accent" : "text-gray-700"
                    }`}
                  >
                    {k.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{k.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input">
              {ITEM_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Opening Stock</span>
            <input
              type="number"
              min={0}
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
              className="input"
              placeholder="0"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Reorder Level (low-stock alert)</span>
            <input
              type="number"
              min={0}
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="input"
              placeholder="0"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Rate (₹ / unit)</span>
            <input
              type="number"
              min={0}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input"
              placeholder="0"
            />
          </label>
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-6 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Add Item
        </button>
      </div>
    </Modal>
  );
}
