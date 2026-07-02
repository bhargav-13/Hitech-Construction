"use client";

import { useState } from "react";
import { Building2, Users, Bell, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SimpleTable } from "@/components/SimpleTable";

const USERS = [
  { name: "Bhargav (You)", email: "bhargav@hitech.in", role: "Admin", status: "Active" },
  { name: "Vishwas Bhai Ujjain", email: "vishwas@hitech.in", role: "Site Supervisor", status: "Active" },
  { name: "Shubham Bhai Ujjain", email: "shubham@hitech.in", role: "Site Engineer", status: "Active" },
  { name: "Accounts Desk", email: "accounts@hitech.in", role: "Finance", status: "Invited" },
];

export default function SettingsPage() {
  const [company, setCompany] = useState({
    name: "Hi-Tech Construction",
    gstin: "24AABCH1234M1Z9",
    phone: "0281-2456789",
    address: "Plot 45, Udyognagar, Rajkot, Gujarat",
  });
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState({
    dailyReport: true,
    paymentDue: true,
    lowStock: false,
    taskOverdue: true,
  });

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell title="Setting">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-brand-accent" />
            <h3 className="text-sm font-semibold text-gray-700">Company Profile</h3>
          </div>
          <div className="space-y-4">
            <Field label="Company Name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="GSTIN" value={company.gstin} onChange={(v) => setCompany({ ...company, gstin: v })} />
              <Field label="Phone" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
            </div>
            <Field label="Registered Address" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />
            <button
              onClick={save}
              className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {saved ? "Saved ✓" : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bell size={18} className="text-brand-accent" />
            <h3 className="text-sm font-semibold text-gray-700">Notifications</h3>
          </div>
          <div className="space-y-3">
            {(
              [
                ["dailyReport", "Daily progress report summary"],
                ["paymentDue", "Payment due reminders"],
                ["lowStock", "Low stock alerts"],
                ["taskOverdue", "Overdue task alerts"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-700">{label}</span>
                <input
                  type="checkbox"
                  checked={notifications[key]}
                  onChange={(e) => setNotifications({ ...notifications, [key]: e.target.checked })}
                  className="h-4 w-4 accent-indigo-600"
                />
              </label>
            ))}
          </div>

          <div className="mt-6 mb-4 flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-accent" />
            <h3 className="text-sm font-semibold text-gray-700">Integrations</h3>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
            <span className="text-sm text-gray-700">Tally / Zoho Books sync</span>
            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500">Not Connected</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-3 flex items-center gap-2">
          <Users size={18} className="text-brand-accent" />
          <h3 className="text-sm font-semibold text-gray-700">Users & Roles</h3>
        </div>
        <SimpleTable
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role" },
            { key: "status", label: "Status" },
          ]}
          rows={USERS}
        />
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
