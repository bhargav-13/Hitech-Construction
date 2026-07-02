"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Boxes, Warehouse as WarehouseIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";

const WAREHOUSES = ["All", "Main Warehouse", "Site Store - Amreli", "Site Store - Rajkot"];

interface StockRow {
  material: string;
  warehouse: string;
  unit: string;
  opening: number;
  received: number;
  issued: number;
}

const STOCK: StockRow[] = [
  { material: "Diesel (litre)", warehouse: "Main Warehouse", unit: "Litre", opening: 1200, received: 850, issued: 940 },
  { material: "Diesel (litre)", warehouse: "Site Store - Amreli", unit: "Litre", opening: 300, received: 180, issued: 210 },
  { material: "Black Sand (Crushed)", warehouse: "Site Store - Amreli", unit: "Cum", opening: 80, received: 420, issued: 260 },
  { material: "SFRC Rectangular Pipe", warehouse: "Site Store - Rajkot", unit: "Nos", opening: 40, received: 240, issued: 190 },
  { material: "Cement OPC 53", warehouse: "Main Warehouse", unit: "Bag", opening: 150, received: 400, issued: 380 },
  { material: "TMT Bar 12mm", warehouse: "Site Store - Rajkot", unit: "Kg", opening: 500, received: 2000, issued: 1750 },
];

const MOVEMENTS = [
  { date: "01-Jul-2026", material: "Diesel (litre)", warehouse: "Main Warehouse", type: "Issued", qty: 120, ref: "Raydi site - JCB refuel" },
  { date: "30-Jun-2026", material: "Cement OPC 53", warehouse: "Main Warehouse", type: "Received", qty: 200, ref: "PO-2026-0009" },
  { date: "30-Jun-2026", material: "TMT Bar 12mm", warehouse: "Site Store - Rajkot", type: "Issued", qty: 350, ref: "Pedak Road reinforcement" },
  { date: "29-Jun-2026", material: "Black Sand (Crushed)", warehouse: "Site Store - Amreli", type: "Received", qty: 45, ref: "Vendor delivery" },
  { date: "28-Jun-2026", material: "SFRC Rectangular Pipe", warehouse: "Site Store - Rajkot", type: "Issued", qty: 24, ref: "RMC Pipeline Phase 2" },
];

export default function WarehousePage() {
  const [warehouse, setWarehouse] = useState("All");
  const [tab, setTab] = useState<"Current Stock" | "Stock Movement">("Current Stock");

  const visibleStock = warehouse === "All" ? STOCK : STOCK.filter((s) => s.warehouse === warehouse);
  const totalReceived = visibleStock.reduce((s, r) => s + r.received, 0);
  const totalIssued = visibleStock.reduce((s, r) => s + r.issued, 0);

  return (
    <AppShell title="Warehouse">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={Boxes} label="Stock Lines" value={String(visibleStock.length)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={ArrowDownLeft} label="Received (30 days)" value={String(totalReceived)} tint="bg-green-100 text-green-600" />
        <Kpi icon={ArrowUpRight} label="Issued (30 days)" value={String(totalIssued)} tint="bg-rose-100 text-rose-600" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-6 border-b border-gray-200">
          {(["Current Stock", "Stock Movement"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <WarehouseIcon size={15} className="text-gray-400" />
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="input w-52">
            {WAREHOUSES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === "Current Stock" ? (
        <SimpleTable
          columns={[
            { key: "material", label: "Material" },
            { key: "warehouse", label: "Warehouse" },
            { key: "opening", label: "Opening" },
            { key: "received", label: "Received" },
            { key: "issued", label: "Issued" },
            { key: "closing", label: "Closing Stock" },
          ]}
          rows={visibleStock.map((s) => ({
            material: s.material,
            warehouse: s.warehouse,
            opening: `${s.opening} ${s.unit}`,
            received: `${s.received} ${s.unit}`,
            issued: `${s.issued} ${s.unit}`,
            closing: `${s.opening + s.received - s.issued} ${s.unit}`,
          }))}
        />
      ) : (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "material", label: "Material" },
            { key: "warehouse", label: "Warehouse" },
            { key: "type", label: "Movement" },
            { key: "qty", label: "Qty" },
            { key: "ref", label: "Reference" },
          ]}
          rows={(warehouse === "All" ? MOVEMENTS : MOVEMENTS.filter((m) => m.warehouse === warehouse)).map((m) => ({
            ...m,
          }))}
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
