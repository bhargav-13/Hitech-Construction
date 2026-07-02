"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";
import type { PartyType } from "@/lib/types";

const TYPES: PartyType[] = ["Client", "Vendor", "Subcontractor"];

export function PartyModal({ onClose }: { onClose: () => void }) {
  const addParty = useAppStore((s) => s.addParty);
  const [name, setName] = useState("");
  const [type, setType] = useState<PartyType>("Client");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  function save() {
    if (!name.trim()) return;
    addParty({ name, type, phone, gstin });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Party</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as PartyType)} className="input">
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">GSTIN</span>
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} className="input" />
          </label>
          <button
            onClick={save}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Party
          </button>
        </div>
      </div>
    </Modal>
  );
}
