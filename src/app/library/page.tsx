"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";

const LIBRARIES = [
  "Asset Type Library",
  "Cost Code Library",
  "Deduction Library",
  "Material Category Library",
  "Material Library",
  "Party Library",
  "Progress Library",
  "Rate Library",
  "Retention Library",
  "Todo Library",
  "Workforce Library",
] as const;
type Lib = (typeof LIBRARIES)[number];

export default function LibraryPage() {
  const [lib, setLib] = useState<Lib>("Party Library");
  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);

  return (
    <AppShell title="Library">
      <div className="flex gap-6">
        <aside className="w-56 shrink-0">
          <ul className="space-y-1">
            {LIBRARIES.map((l) => (
              <li key={l}>
                <button
                  onClick={() => setLib(l)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    lib === l ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {l}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">{lib}</h2>
            <button className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              + Add
            </button>
          </div>

          {lib === "Party Library" && (
            <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{p.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={12} className={i < p.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lib === "Material Library" && (
            <SimpleTable
              columns={[
                { key: "name", label: "Material" },
                { key: "unit", label: "Unit" },
                { key: "rate", label: "Rate" },
                { key: "gst", label: "GST %" },
              ]}
              rows={items.map((i) => ({ name: i.name, unit: i.unit, rate: formatRupee(i.rate), gst: `${i.gstRate}%` }))}
            />
          )}

          {lib === "Cost Code Library" && (
            <SimpleTable
              columns={[{ key: "code", label: "Cost Code" }, { key: "description", label: "Description" }, { key: "category", label: "Category" }]}
              rows={[
                { code: "CC-101", description: "Earthwork & Excavation", category: "Civil" },
                { code: "CC-102", description: "PCC & RCC Work", category: "Civil" },
                { code: "CC-103", description: "Pipe Laying & Jointing", category: "Pipeline" },
                { code: "CC-104", description: "Manhole Construction", category: "Pipeline" },
                { code: "CC-105", description: "Road Restoration", category: "Roads" },
              ]}
            />
          )}

          {lib === "Rate Library" && (
            <SimpleTable
              columns={[{ key: "activity", label: "Activity" }, { key: "unit", label: "Unit" }, { key: "rate", label: "Rate" }]}
              rows={[
                { activity: "Excavation (soft soil)", unit: "Cum", rate: formatRupee(220) },
                { activity: "170 Dia Pipe Laying", unit: "Mtr", rate: formatRupee(450) },
                { activity: "Manhole Construction", unit: "Nos", rate: formatRupee(18500) },
                { activity: "CC Road (M20)", unit: "Sqm", rate: formatRupee(780) },
              ]}
            />
          )}

          {lib === "Deduction Library" && (
            <SimpleTable
              columns={[{ key: "name", label: "Deduction" }, { key: "type", label: "Type" }, { key: "rate", label: "Rate" }]}
              rows={[
                { name: "TDS on Contract", type: "Tax", rate: "2%" },
                { name: "Labour Cess", type: "Statutory", rate: "1%" },
                { name: "Security Deposit", type: "Retention", rate: "5%" },
              ]}
            />
          )}

          {lib === "Retention Library" && (
            <SimpleTable
              columns={[{ key: "name", label: "Retention Policy" }, { key: "rate", label: "Rate" }, { key: "release", label: "Release" }]}
              rows={[
                { name: "Standard Govt Contract", rate: "5%", release: "After DLP" },
                { name: "RMC Works", rate: "10%", release: "50% on completion" },
              ]}
            />
          )}

          {lib === "Material Category Library" && (
            <SimpleTable
              columns={[{ key: "name", label: "Category" }, { key: "items", label: "Items" }]}
              rows={[
                { name: "Cement", items: "OPC 43, OPC 53, PPC" },
                { name: "Steel", items: "TMT 8/10/12/16mm" },
                { name: "Aggregate", items: "Sand, Grit, Kapchi" },
                { name: "Pipes", items: "DI, SFRC, RCC" },
              ]}
            />
          )}

          {lib === "Asset Type Library" && (
            <SimpleTable
              columns={[{ key: "name", label: "Asset Type" }]}
              rows={[{ name: "Vehicle" }, { name: "Machinery" }, { name: "Electronics" }, { name: "Tools" }, { name: "Furniture" }]}
            />
          )}

          {lib === "Workforce Library" && (
            <SimpleTable
              columns={[{ key: "role", label: "Role" }, { key: "skill", label: "Skill Level" }, { key: "rate", label: "Day Rate" }]}
              rows={[
                { role: "Mason", skill: "Skilled", rate: formatRupee(800) },
                { role: "Helper", skill: "Unskilled", rate: formatRupee(550) },
                { role: "Electrician", skill: "Skilled", rate: formatRupee(900) },
                { role: "Site Engineer", skill: "Technical", rate: formatRupee(1200) },
              ]}
            />
          )}

          {lib === "Progress Library" && (
            <SimpleTable
              columns={[{ key: "stage", label: "Progress Stage" }, { key: "weight", label: "Weightage" }]}
              rows={[
                { stage: "Excavation", weight: "15%" },
                { stage: "Foundation", weight: "25%" },
                { stage: "Superstructure", weight: "35%" },
                { stage: "Finishing", weight: "25%" },
              ]}
            />
          )}

          {lib === "Todo Library" && (
            <SimpleTable
              columns={[{ key: "template", label: "Todo Template" }, { key: "category", label: "Category" }]}
              rows={[
                { template: "Site inspection checklist", category: "Quality" },
                { template: "Material request", category: "Procurement" },
                { template: "Safety audit", category: "Safety" },
              ]}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
