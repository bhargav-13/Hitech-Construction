"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { formatRupee } from "@/lib/projectHelpers";

interface Asset {
  id: string;
  serial: string;
  name: string;
  value: number;
  type: string;
  total: number;
  available: number;
}

const SEED: Asset[] = [
  { id: "a5", serial: "AS-5", name: "Mahindra Mini Tractor", value: 0, type: "Vehicle", total: 1, available: 1 },
  { id: "a4", serial: "AS-4", name: "Swaraj Mini Tractor", value: 0, type: "Machinery", total: 1, available: 1 },
  { id: "a3", serial: "AS-3", name: "Mud Pump", value: 18000, type: "Machinery", total: 1, available: 1 },
  { id: "a2", serial: "AS-2", name: "Mixer Machine", value: 0, type: "Machinery", total: 3, available: 3 },
  { id: "a1", serial: "AS-1", name: "Camera", value: 10500, type: "Electronics", total: 2, available: 0 },
];

export default function AssetPage() {
  const [assets, setAssets] = useState(SEED);
  const [showAdd, setShowAdd] = useState(false);

  function assign(id: string) {
    setAssets(assets.map((a) => (a.id === id && a.available > 0 ? { ...a, available: a.available - 1 } : a)));
  }

  return (
    <AppShell title="Asset">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input placeholder="Search" className="w-40 text-sm outline-none" readOnly />
        </div>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          + New Asset
        </button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Serial No.</th>
              <th className="px-4 py-3">Asset Name</th>
              <th className="px-4 py-3">Asset Type</th>
              <th className="px-4 py-3">Total Qty</th>
              <th className="px-4 py-3">Available Qty</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-4 py-3 font-medium text-gray-700">{a.serial}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{a.name}</div>
                  <div className="text-xs text-gray-400">{formatRupee(a.value)}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{a.type}</td>
                <td className="px-4 py-3 text-gray-700">{a.total}</td>
                <td className="px-4 py-3 text-gray-700">{a.available}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => assign(a.id)}
                    disabled={a.available === 0}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      a.available > 0 ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    Assign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddAssetModal
          onClose={() => setShowAdd(false)}
          onSave={(a) => {
            setAssets([a, ...assets]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}

function AddAssetModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Asset) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Machinery");
  const [value, setValue] = useState("0");
  const [total, setTotal] = useState("1");

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Asset</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Asset Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Asset Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input">
                {["Machinery", "Vehicle", "Electronics", "Tools", "Furniture"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Total Qty</span>
              <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Value (₹)</span>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="input" />
          </label>
          <button
            onClick={() => {
              if (!name.trim()) return;
              const qty = Number(total) || 1;
              onSave({ id: `a${Date.now()}`, serial: `AS-${Date.now() % 1000}`, name, value: Number(value) || 0, type, total: qty, available: qty });
            }}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Asset
          </button>
        </div>
      </div>
    </Modal>
  );
}
