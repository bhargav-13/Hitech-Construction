"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";

const SECTIONS = [
  "Company",
  "Roles & Access",
  "Payroll",
  "Holiday & Weekoff",
  "Workflow Controls",
  "Document & Fields",
  "Multi Level Approval",
  "Inspection Forms",
  "Notifications",
  "Integrations",
  "Subscription",
] as const;
type Section = (typeof SECTIONS)[number];

const USERS = [
  { name: "Bhargav (You)", email: "bhargav@hitech.in", role: "Admin", status: "Active" },
  { name: "Rakesh Shah", email: "rakesh@hitech.in", role: "Project Manager", status: "Active" },
  { name: "Priya Mehta", email: "priya@hitech.in", role: "Finance", status: "Active" },
  { name: "Site Desk", email: "site@hitech.in", role: "Site Supervisor", status: "Invited" },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("Company");
  const [company, setCompany] = useState({ name: "Hi-Tech Construction", phone: "0281-2456789", address: "Office No. 420, Level 6, Imperial Heights, 150ft Ring Road, Rajkot", gstin: "24AABCH1234M1Z9" });
  const [saved, setSaved] = useState(false);

  return (
    <AppShell title="Setting">
      <div className="flex gap-6">
        <aside className="w-56 shrink-0">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s}>
                <button
                  onClick={() => setSection(s)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    section === s ? "bg-teal-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1">
          {section === "Company" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Company Details</h3>
              <div className="grid max-w-2xl gap-4">
                <Field label="Company Name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="GSTIN" value={company.gstin} onChange={(v) => setCompany({ ...company, gstin: v })} />
                  <Field label="Phone" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
                </div>
                <Field label="Registered Address" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />
                <div>
                  <button
                    onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }}
                    className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    {saved ? "Saved ✓" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === "Roles & Access" && (
            <SimpleTable
              columns={[{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "status", label: "Status" }]}
              rows={USERS}
            />
          )}

          {section === "Notifications" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Notifications</h3>
              <div className="max-w-lg space-y-3">
                {["Daily progress report", "Payment due reminders", "Low stock alerts", "Overdue task alerts", "Approval requests"].map((n, i) => (
                  <label key={n} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                    <span className="text-sm text-gray-700">{n}</span>
                    <input type="checkbox" defaultChecked={i < 3} className="h-4 w-4 accent-teal-600" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {section === "Integrations" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">Integrations</h3>
              <div className="max-w-lg space-y-3">
                {[["Tally", "Not Connected"], ["Zoho Books", "Not Connected"], ["WhatsApp Business", "Connected"]].map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                    <span className="text-sm text-gray-700">{name}</span>
                    <span className={`rounded-md px-2 py-1 text-xs ${status === "Connected" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === "Subscription" && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="mb-1 text-sm font-semibold text-gray-700">Current Plan</h3>
              <p className="mb-4 text-2xl font-semibold text-brand-accent">Business Pro</p>
              <div className="grid max-w-md grid-cols-2 gap-4 text-sm">
                <div><div className="text-gray-400">Users</div><div className="font-medium text-gray-800">15 / 20</div></div>
                <div><div className="text-gray-400">Renews</div><div className="font-medium text-gray-800">31 Mar 2027</div></div>
              </div>
            </div>
          )}

          {["Payroll", "Holiday & Weekoff", "Workflow Controls", "Document & Fields", "Multi Level Approval", "Inspection Forms"].includes(section) && (
            <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
              <div className="text-center">
                <div className="text-base font-medium text-gray-700">{section}</div>
                <div className="mt-1 text-sm text-gray-400">Configuration panel coming soon.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
