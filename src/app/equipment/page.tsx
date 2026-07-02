"use client";

import { useState } from "react";
import { Wrench, Activity, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";

type EquipStatus = "In Use" | "Idle" | "Under Maintenance";

interface Equipment {
  id: string;
  name: string;
  code: string;
  site: string;
  operator: string;
  status: EquipStatus;
  nextService: string;
}

const STATUS_CLS: Record<EquipStatus, string> = {
  "In Use": "bg-green-100 text-green-700",
  Idle: "bg-gray-100 text-gray-600",
  "Under Maintenance": "bg-amber-100 text-amber-700",
};

const SEED_EQUIPMENT: Equipment[] = [
  { id: "eq-1", name: "Excavator JCB 3DX", code: "EQ-001", site: "Ishwariya (Gram Panchayat) Amreli", operator: "Mahesh Bhai Chauhan", status: "In Use", nextService: "15-Jul-2026" },
  { id: "eq-2", name: "Concrete Mixer 10/7", code: "EQ-002", site: "Raydi (Animal Husbandary EPI Center)", operator: "Ketan Bhai Vaghela", status: "In Use", nextService: "20-Jul-2026" },
  { id: "eq-3", name: "DG Set 62.5 KVA", code: "EQ-003", site: "Main Warehouse", operator: "—", status: "Idle", nextService: "10-Aug-2026" },
  { id: "eq-4", name: "Vibrator Machine", code: "EQ-004", site: "Pedak Road (D.I. Pipeline)", operator: "Ramesh Patel", status: "Under Maintenance", nextService: "04-Jul-2026" },
  { id: "eq-5", name: "Water Tanker 5000L", code: "EQ-005", site: "Lakhapadar (Gram Panchayat) Amreli", operator: "Suresh Bhai", status: "In Use", nextService: "01-Aug-2026" },
];

const USAGE_LOG = [
  { date: "01-Jul-2026", equipment: "Excavator JCB 3DX", site: "Ishwariya", hours: 8, fuel: "110 L" },
  { date: "01-Jul-2026", equipment: "Concrete Mixer 10/7", site: "Raydi", hours: 6, fuel: "18 L" },
  { date: "30-Jun-2026", equipment: "Excavator JCB 3DX", site: "Ishwariya", hours: 9, fuel: "122 L" },
  { date: "30-Jun-2026", equipment: "Water Tanker 5000L", site: "Lakhapadar", hours: 5, fuel: "35 L" },
  { date: "29-Jun-2026", equipment: "Vibrator Machine", site: "Pedak Road", hours: 4, fuel: "6 L" },
];

export default function EquipmentPage() {
  const [tab, setTab] = useState<"Equipment List" | "Usage Log">("Equipment List");

  const inUse = SEED_EQUIPMENT.filter((e) => e.status === "In Use").length;
  const maintenance = SEED_EQUIPMENT.filter((e) => e.status === "Under Maintenance").length;

  return (
    <AppShell title="Equipment">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Kpi icon={Wrench} label="Total Equipment" value={String(SEED_EQUIPMENT.length)} tint="bg-indigo-100 text-indigo-600" />
        <Kpi icon={Activity} label="In Use" value={String(inUse)} tint="bg-green-100 text-green-600" />
        <Kpi icon={AlertTriangle} label="Under Maintenance" value={String(maintenance)} tint="bg-amber-100 text-amber-600" />
      </div>

      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {(["Equipment List", "Usage Log"] as const).map((t) => (
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

      {tab === "Equipment List" ? (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Current Site</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Next Service</th>
              </tr>
            </thead>
            <tbody>
              {SEED_EQUIPMENT.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-indigo-600">{e.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{e.name}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-gray-600">{e.site}</td>
                  <td className="px-4 py-3 text-gray-600">{e.operator}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${STATUS_CLS[e.status]}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.nextService}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "equipment", label: "Equipment" },
            { key: "site", label: "Site" },
            { key: "hours", label: "Hours Run" },
            { key: "fuel", label: "Fuel Used" },
          ]}
          rows={USAGE_LOG}
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
