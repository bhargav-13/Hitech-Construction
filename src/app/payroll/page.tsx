"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { inr } from "@/lib/format";
import { SimpleTable } from "@/components/SimpleTable";

const TABS = ["People", "Attendance", "Team Leaves", "My Leaves", "Holidays"] as const;
type Tab = (typeof TABS)[number];

interface Person {
  name: string;
  role: string;
  staff: "Office Staff" | "Site Staff";
  selfPunch: boolean;
  wage: number;
}

const PEOPLE: Person[] = [
  { name: "Anil Singh", role: "Store Guard", staff: "Site Staff", selfPunch: true, wage: 387 },
  { name: "Anil Sisodiya", role: "Supervisor", staff: "Site Staff", selfPunch: true, wage: 484 },
  { name: "Ankit Chauhan", role: "Site Engineer", staff: "Site Staff", selfPunch: true, wage: 710 },
  { name: "Dilip Sirondiya", role: "Supervisor", staff: "Site Staff", selfPunch: true, wage: 484 },
  { name: "Juber Supervisor", role: "Supervisor", staff: "Site Staff", selfPunch: true, wage: 645 },
  { name: "Kishor Kumar", role: "Supervisor", staff: "Site Staff", selfPunch: false, wage: 484 },
  { name: "Priya Mehta", role: "Accountant", staff: "Office Staff", selfPunch: false, wage: 1200 },
  { name: "Rakesh Shah", role: "Project Manager", staff: "Office Staff", selfPunch: false, wage: 1600 },
];

const HOLIDAYS = [
  { date: "15-Aug-2026", name: "Independence Day", type: "National Holiday" },
  { date: "02-Oct-2026", name: "Gandhi Jayanti", type: "National Holiday" },
  { date: "20-Oct-2026", name: "Diwali", type: "Festival" },
  { date: "26-Jan-2027", name: "Republic Day", type: "National Holiday" },
];

const LEAVES = [
  { name: "Ankit Chauhan", type: "Casual Leave", from: "10-Jul-2026", to: "11-Jul-2026", status: "Pending" },
  { name: "Dilip Sirondiya", type: "Sick Leave", from: "05-Jul-2026", to: "05-Jul-2026", status: "Approved" },
  { name: "Kishor Kumar", type: "Casual Leave", from: "15-Jul-2026", to: "16-Jul-2026", status: "Pending" },
];

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>("People");
  const [staff, setStaff] = useState<"Office Staff" | "Site Staff">("Site Staff");
  const [people, setPeople] = useState(PEOPLE);
  const filtered = people.filter((p) => p.staff === staff);

  return (
    <AppShell title="Payroll">
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

      {(tab === "People" || tab === "Attendance") && (
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {(["Office Staff", "Site Staff"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStaff(s)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  staff === s ? "bg-brand-accent text-white" : "text-gray-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {tab === "People" && (
            <button className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ New Payroll</button>
          )}
        </div>
      )}

      {tab === "People" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="grid grid-cols-[2fr_1.4fr_auto_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
            <div>Party</div>
            <div>Associated Projects</div>
            <div className="text-center">Self Punch</div>
            <div className="text-right">Payroll Type</div>
          </div>
          {filtered.map((p, i) => (
            <div key={p.name} className="grid grid-cols-[2fr_1.4fr_auto_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-medium text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-400">{p.role}</div>
              </div>
              <button className="text-left text-xs font-medium text-brand-accent">+ Add (1)</button>
              <div className="flex justify-center">
                <button
                  onClick={() => setPeople(people.map((x) => (x.name === p.name ? { ...x, selfPunch: !x.selfPunch } : x)))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${p.selfPunch ? "bg-brand-accent" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${p.selfPunch ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
              <div className="text-right">
                <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">{p.staff}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Attendance" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500"><ChevronLeft size={15} /></button>
              <div className="rounded-lg bg-green-500 px-4 py-2 text-center text-sm font-semibold text-white">2 Thu</div>
              <button className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500"><ChevronRight size={15} /></button>
              <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">Jul 2026</span>
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">{filtered.length} Present</span> · 1 Absent · 0 Paid Leave · 0 Week Off
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[2fr_auto_1.4fr_auto_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              <div>Name</div>
              <div>Wage</div>
              <div>Punch</div>
              <div>Shift</div>
              <div className="text-right">Status</div>
            </div>
            {filtered.map((p, i) => (
              <div key={p.name} className="grid grid-cols-[2fr_auto_1.4fr_auto_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0">
                <div>
                  <div className="text-sm font-medium text-gray-800">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.role}</div>
                </div>
                <div className="text-sm text-gray-700">{formatWage(p.wage)}</div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin size={12} className="text-gray-400" />
                  {8 + (i % 2)}:{(10 + i * 4) % 60 < 10 ? "0" : ""}{(10 + i * 4) % 60} AM
                  {i % 3 === 0 && <span className="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600">LATE</span>}
                </div>
                <div className="text-sm text-gray-500">1 Shift</div>
                <div className="text-right">
                  <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Present</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab === "Team Leaves" || tab === "My Leaves") && (
        <SimpleTable
          columns={[
            { key: "name", label: "Name" },
            { key: "type", label: "Leave Type" },
            { key: "from", label: "From" },
            { key: "to", label: "To" },
            { key: "status", label: "Status" },
          ]}
          rows={tab === "My Leaves" ? LEAVES.slice(0, 1) : LEAVES}
        />
      )}

      {tab === "Holidays" && (
        <SimpleTable
          columns={[
            { key: "date", label: "Date" },
            { key: "name", label: "Holiday" },
            { key: "type", label: "Type" },
          ]}
          rows={HOLIDAYS}
        />
      )}
    </AppShell>
  );
}

function formatWage(n: number) {
  return inr(n);
}
