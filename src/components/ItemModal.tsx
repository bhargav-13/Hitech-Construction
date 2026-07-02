"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";

const UNITS = ["Nos", "Cum", "Sqm", "Kg", "Litre", "Bag", "Mtr"];
const GST_RATES = [0, 5, 12, 18, 28];

export function ItemModal({ onClose }: { onClose: () => void }) {
  const addItem = useAppStore((s) => s.addItem);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [rate, setRate] = useState("0");
  const [gstRate, setGstRate] = useState("18");

  function save() {
    if (!name.trim()) return;
    addItem({ name, unit, rate: Number(rate) || 0, gstRate: Number(gstRate) || 0 });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Item</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Item Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input">
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">GST %</span>
              <select value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="input">
                {GST_RATES.map((g) => (
                  <option key={g} value={g}>
                    {g}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Rate (₹)</span>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input"
            />
          </label>
          <button
            onClick={save}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Item
          </button>
        </div>
      </div>
    </Modal>
  );
}
