"use client";

import { useState } from "react";
import { ClipboardCheck, ClipboardList, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";

type PoStatus = "Pending Approval" | "Approved" | "Ordered" | "Delivered";

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendor: string;
  project: string;
  material: string;
  qty: number;
  unit: string;
  estValue: number;
  status: PoStatus;
}

const STATUS_CLS: Record<PoStatus, string> = {
  "Pending Approval": "bg-amber-100 text-amber-700",
  Approved: "bg-blue-100 text-blue-700",
  Ordered: "bg-indigo-100 text-indigo-700",
  Delivered: "bg-green-100 text-green-700",
};

const NEXT_STATUS: Record<PoStatus, PoStatus | null> = {
  "Pending Approval": "Approved",
  Approved: "Ordered",
  Ordered: "Delivered",
  Delivered: null,
};

const SEED_POS: PurchaseOrder[] = [
  { id: "po-1", poNumber: "PO-2026-0012", vendor: "Ambuja Cement Suppliers", project: "Ishwariya (Gram Panchayat) Amreli", material: "Cement OPC 53", qty: 400, unit: "Bag", estValue: 152000, status: "Pending Approval" },
  { id: "po-2", poNumber: "PO-2026-0011", vendor: "Shree Steel Traders", project: "Raydi (Animal Husbandary EPI Center)", material: "TMT Bar 12mm", qty: 2000, unit: "Kg", estValue: 124000, status: "Approved" },
  { id: "po-3", poNumber: "PO-2026-0010", vendor: "Shree Steel Traders", project: "Pedak Road (D.I. Pipeline)", material: "SFRC Rectangular Pipe", qty: 60, unit: "Nos", estValue: 192000, status: "Ordered" },
  { id: "po-4", poNumber: "PO-2026-0009", vendor: "Ambuja Cement Suppliers", project: "Lakhapadar (Gram Panchayat) Amreli", material: "Black Sand (Crushed)", qty: 45, unit: "Cum", estValue: 81000, status: "Delivered" },
];

export default function ProcurementPage() {
  const [orders, setOrders] = useState(SEED_POS);
  const [showAdd, setShowAdd] = useState(false);
  const projects = useAppStore((s) => s.projects);
  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);

  const pending = orders.filter((o) => o.status === "Pending Approval").length;
  const inTransit = orders.filter((o) => o.status === "Ordered").length;

  function advance(id: string) {
    setOrders(
      orders.map((o) => {
        if (o.id !== id) return o;
        const next = NEXT_STATUS[o.status];
        return next ? { ...o, status: next } : o;
      })
    );
  }

  return (
    <AppShell title="Procurement">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={ClipboardList} label="Pending Approval" value={String(pending)} tint="bg-amber-100 text-amber-600" />
        <Kpi icon={Truck} label="In Transit" value={String(inTransit)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={ClipboardCheck} label="Total PO Value" value={formatRupee(orders.reduce((s, o) => s + o.estValue, 0))} tint="bg-green-100 text-green-600" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Purchase Orders</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + New Purchase Order
        </button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">PO #</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Est. Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-4 py-3 font-medium text-indigo-600">{o.poNumber}</td>
                <td className="px-4 py-3 text-gray-700">{o.vendor}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">{o.project}</td>
                <td className="px-4 py-3 text-gray-700">{o.material}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                  {o.qty} {o.unit}
                </td>
                <td className="px-4 py-3 text-gray-700">{formatRupee(o.estValue)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${STATUS_CLS[o.status]}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {NEXT_STATUS[o.status] && (
                    <button
                      onClick={() => advance(o.id)}
                      className="text-xs font-medium whitespace-nowrap text-brand-accent hover:underline"
                    >
                      Mark {NEXT_STATUS[o.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <NewPoModal
          projects={projects.map((p) => p.name)}
          vendors={parties.filter((p) => p.type === "Vendor").map((p) => p.name)}
          materials={items.map((i) => ({ name: i.name, unit: i.unit, rate: i.rate }))}
          onClose={() => setShowAdd(false)}
          onSave={(po) => {
            setOrders([po, ...orders]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value, tint }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; tint: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-semibold text-gray-800">{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}

function NewPoModal({
  projects,
  vendors,
  materials,
  onClose,
  onSave,
}: {
  projects: string[];
  vendors: string[];
  materials: { name: string; unit: string; rate: number }[];
  onClose: () => void;
  onSave: (po: PurchaseOrder) => void;
}) {
  const [vendor, setVendor] = useState(vendors[0] ?? "");
  const [project, setProject] = useState(projects[0] ?? "");
  const [materialName, setMaterialName] = useState(materials[0]?.name ?? "");
  const [qty, setQty] = useState("1");

  const material = materials.find((m) => m.name === materialName);
  const estValue = (material?.rate ?? 0) * (Number(qty) || 0);

  return (
    <Modal onClose={onClose}>
      <div className="p-8">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">New Purchase Order</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Vendor</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="input">
              {vendors.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Project</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} className="input">
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Material</span>
              <select value={materialName} onChange={(e) => setMaterialName(e.target.value)} className="input">
                {materials.map((m) => (
                  <option key={m.name}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">Qty ({material?.unit ?? ""})</span>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="input" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm">
            <span className="text-gray-500">Estimated Value</span>
            <span className="font-semibold text-gray-800">{formatRupee(estValue)}</span>
          </div>
          <button
            onClick={() =>
              onSave({
                id: `po-${Date.now()}`,
                poNumber: `PO-2026-${String(Math.floor(Math.random() * 900) + 100).padStart(4, "0")}`,
                vendor,
                project,
                material: materialName,
                qty: Number(qty) || 0,
                unit: material?.unit ?? "",
                estValue,
                status: "Pending Approval",
              })
            }
            className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Create PO
          </button>
        </div>
      </div>
    </Modal>
  );
}
