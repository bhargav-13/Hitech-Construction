"use client";

import { Landmark, TrendingDown, Tag } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { formatLakh } from "@/lib/format";

interface Asset {
  name: string;
  category: string;
  location: string;
  purchaseDate: string;
  purchaseValue: number;
  currentValue: number;
}

const ASSETS: Asset[] = [
  { name: "Office Building - Rajkot", category: "Real Estate", location: "Rajkot HQ", purchaseDate: "12-Apr-2019", purchaseValue: 8500000, currentValue: 11200000 },
  { name: "Excavator JCB 3DX", category: "Heavy Machinery", location: "Ishwariya Site", purchaseDate: "03-Jun-2022", purchaseValue: 2900000, currentValue: 1750000 },
  { name: "Tata Pickup 407", category: "Vehicle", location: "Main Warehouse", purchaseDate: "18-Jan-2023", purchaseValue: 1150000, currentValue: 820000 },
  { name: "Bolero Camper", category: "Vehicle", location: "Site Rotation", purchaseDate: "22-Aug-2021", purchaseValue: 950000, currentValue: 540000 },
  { name: "DG Set 62.5 KVA", category: "Equipment", location: "Main Warehouse", purchaseDate: "10-Nov-2023", purchaseValue: 480000, currentValue: 385000 },
  { name: "Total Station (Survey)", category: "Instrument", location: "Office Store", purchaseDate: "05-Feb-2024", purchaseValue: 320000, currentValue: 265000 },
];

export default function AssetPage() {
  const totalPurchase = ASSETS.reduce((s, a) => s + a.purchaseValue, 0);
  const totalCurrent = ASSETS.reduce((s, a) => s + a.currentValue, 0);

  return (
    <AppShell title="Asset">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={Tag} label="Total Assets" value={String(ASSETS.length)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={Landmark} label="Book Value" value={formatLakh(totalCurrent)} tint="bg-green-100 text-green-600" />
        <Kpi icon={TrendingDown} label="Net Depreciation" value={formatLakh(totalPurchase - totalCurrent)} tint="bg-rose-100 text-rose-600" />
      </div>

      <h2 className="mb-4 text-lg font-semibold text-gray-800">Asset Register</h2>

      <SimpleTable
        columns={[
          { key: "name", label: "Asset" },
          { key: "category", label: "Category" },
          { key: "location", label: "Location" },
          { key: "purchaseDate", label: "Purchase Date" },
          { key: "purchaseValue", label: "Purchase Value" },
          { key: "currentValue", label: "Current Value" },
          { key: "change", label: "Change" },
        ]}
        rows={ASSETS.map((a) => ({
          name: a.name,
          category: a.category,
          location: a.location,
          purchaseDate: a.purchaseDate,
          purchaseValue: formatLakh(a.purchaseValue),
          currentValue: formatLakh(a.currentValue),
          change: `${a.currentValue >= a.purchaseValue ? "+" : "-"}${formatLakh(Math.abs(a.currentValue - a.purchaseValue))}`,
        }))}
      />
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
