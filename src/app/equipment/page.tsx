"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";

interface Equipment {
  id: string;
  name: string;
  code: string;
  type: "Rented" | "Owned";
  vendor: string;
  uom: string;
}

const SEED: Equipment[] = [
  { id: "e1", name: "Ramlal Tractor", code: "R01", type: "Rented", vendor: "Ramlal Enterprises", uom: "Clock Based / hours" },
  { id: "e2", name: "Santu Tractor", code: "ST1", type: "Rented", vendor: "Santu Charpota", uom: "Clock Based / hours" },
  { id: "e3", name: "Zuber Tractor", code: "Z01", type: "Rented", vendor: "Zuber Suppliers", uom: "Clock Based / hours" },
  { id: "e4", name: "JCB 3DX", code: "JCB1", type: "Rented", vendor: "Krishna JCB & Equipment", uom: "Clock Based / hours" },
  { id: "e5", name: "Harinarayan Breaker", code: "HB1", type: "Rented", vendor: "Harinarayan Breaker", uom: "Trip Based" },
  { id: "e6", name: "Concrete Mixer 10/7", code: "CM1", type: "Owned", vendor: "—", uom: "Clock Based / hours" },
  { id: "e7", name: "DG Set 62.5 KVA", code: "DG1", type: "Owned", vendor: "—", uom: "Clock Based / hours" },
];

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState(SEED);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <AppShell title="Equipment">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input placeholder="Search Equipment" className="w-48 text-sm outline-none" readOnly />
        </div>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          + Equipment
        </button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">S.No</th>
              <th className="px-4 py-3">Equipment Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Vendor Name</th>
              <th className="px-4 py-3">Unit of Measurement</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e, i) => (
              <tr key={e.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-4 py-3 text-gray-400">{i + 1}.</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800">{e.name}</div>
                  <div className="text-xs text-gray-400">{e.code}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${e.type === "Rented" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {e.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{e.vendor}</td>
                <td className="px-4 py-3 text-gray-600">{e.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddEquipmentModal
          onClose={() => setShowAdd(false)}
          onSave={(e) => {
            setEquipment([e, ...equipment]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}

function AddEquipmentModal({ onClose, onSave }: { onClose: () => void; onSave: (e: Equipment) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"Rented" | "Owned">("Rented");
  const [vendor, setVendor] = useState("");
  const [uom, setUom] = useState("Clock Based / hours");

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Equipment</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Equipment Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as "Rented" | "Owned")} className="input">
                <option>Rented</option>
                <option>Owned</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Unit of Measurement</span>
              <select value={uom} onChange={(e) => setUom(e.target.value)} className="input">
                <option>Clock Based / hours</option>
                <option>Trip Based</option>
                <option>Day Based</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Vendor Name</span>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="input" />
          </label>
          <button
            onClick={() => name.trim() && onSave({ id: `e${Date.now()}`, name, code: code || "—", type, vendor: vendor || "—", uom })}
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Save Equipment
          </button>
        </div>
      </div>
    </Modal>
  );
}
