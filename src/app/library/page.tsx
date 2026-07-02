"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";

const TABS = ["Material Library", "Rate Card", "Cost Codes", "Party Library"] as const;
type Tab = (typeof TABS)[number];

const COST_CODES = [
  { code: "CC-101", description: "Earthwork & Excavation", category: "Civil" },
  { code: "CC-102", description: "PCC & RCC Work", category: "Civil" },
  { code: "CC-103", description: "Pipe Laying & Jointing", category: "Pipeline" },
  { code: "CC-104", description: "Manhole Construction", category: "Pipeline" },
  { code: "CC-105", description: "Road Restoration", category: "Roads" },
  { code: "CC-106", description: "Electrical & Instrumentation", category: "MEP" },
];

const RATE_CARD = [
  { activity: "Excavation (soft soil)", unit: "Cum", rate: 220 },
  { activity: "170 Dia Pipe Laying", unit: "Mtr", rate: 450 },
  { activity: "250 Dia Pipe Laying", unit: "Mtr", rate: 640 },
  { activity: "Manhole Construction (1.5m)", unit: "Nos", rate: 18500 },
  { activity: "CC Road (M20, 150mm)", unit: "Sqm", rate: 780 },
  { activity: "House Service Connection", unit: "Nos", rate: 2200 },
];

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("Material Library");
  const items = useAppStore((s) => s.items);
  const parties = useAppStore((s) => s.parties);

  return (
    <AppShell title="Library">
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium whitespace-nowrap ${
              tab === t ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Material Library" && (
        <SimpleTable
          columns={[
            { key: "name", label: "Material" },
            { key: "unit", label: "Unit" },
            { key: "rate", label: "Rate" },
            { key: "gstRate", label: "GST %" },
          ]}
          rows={items.map((i) => ({
            name: i.name,
            unit: i.unit,
            rate: formatRupee(i.rate),
            gstRate: `${i.gstRate}%`,
          }))}
        />
      )}

      {tab === "Rate Card" && (
        <SimpleTable
          columns={[
            { key: "activity", label: "Activity" },
            { key: "unit", label: "Unit" },
            { key: "rate", label: "Rate" },
          ]}
          rows={RATE_CARD.map((r) => ({ ...r, rate: formatRupee(r.rate) }))}
        />
      )}

      {tab === "Cost Codes" && (
        <SimpleTable
          columns={[
            { key: "code", label: "Cost Code" },
            { key: "description", label: "Description" },
            { key: "category", label: "Category" },
          ]}
          rows={COST_CODES}
        />
      )}

      {tab === "Party Library" && (
        <SimpleTable
          columns={[
            { key: "name", label: "Party" },
            { key: "type", label: "Type" },
            { key: "phone", label: "Phone" },
            { key: "gstin", label: "GSTIN" },
          ]}
          rows={parties.map((p) => ({ ...p, gstin: p.gstin || "—" }))}
        />
      )}
    </AppShell>
  );
}
