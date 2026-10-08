"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { ApiError } from "@/lib/api";
import { newId, usePayrollSetting } from "@/lib/payrollSettings";
import type { TaxProfileDef } from "@/lib/payrollSettings";
import { ArrowLeft, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";

const EMPTY: TaxProfileDef = {
  id: "", profileName: "", description: "", pan: "", tan: "", tdsCircle: "",
  deductorType: "EMPLOYEE", deductorName: "", fatherName: "",
};

/**
 * Tax Profiles — TDS deductor details (PAN, TAN, circle, responsible person) used for statutory
 * filing. Staff are linked to a profile, with their regime and monthly TDS, on their profile.
 */
export default function TaxProfilesPage() {
  const { value: profiles, loading, save } = usePayrollSetting("TAX_PROFILES");
  const [editing, setEditing] = useState<TaxProfileDef | null>(null);
  const [error, setError] = useState("");

  async function persist(next: TaxProfileDef[]) {
    setError("");
    try {
      await save(next);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
      return false;
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/payroll/setup" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft size={14} /> Setup
            </Link>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Tax Profiles</h2>
              <p className="mt-0.5 text-sm text-gray-500">TDS deductor details for statutory filing.</p>
            </div>
          </div>
          <button onClick={() => setEditing({ ...EMPTY })} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Plus size={15} /> New Tax Profile
          </button>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : profiles.length === 0 ? (
          <PayrollEmpty icon={ReceiptText} title="No tax profiles yet" hint="Add the deductor's PAN, TAN and TDS circle, then link staff to it on their profile." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-800">{p.profileName}</div>
                    {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(p)} title="Edit" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={14} /></button>
                    <button
                      onClick={() => { if (confirm(`Delete ${p.profileName}?`)) void persist(profiles.filter((x) => x.id !== p.id)); }}
                      title="Delete"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-gray-500">PAN</dt><dd className="font-medium text-gray-800">{p.pan || "—"}</dd>
                  <dt className="text-gray-500">TAN</dt><dd className="font-medium text-gray-800">{p.tan || "—"}</dd>
                  <dt className="text-gray-500">TDS circle</dt><dd className="font-medium text-gray-800">{p.tdsCircle || "—"}</dd>
                  <dt className="text-gray-500">Deductor</dt><dd className="font-medium text-gray-800">{p.deductorName || "—"} · {p.deductorType === "EMPLOYEE" ? "Employee" : "Non-employee"}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <TaxProfileDrawer
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            const next = p.id ? profiles.map((x) => (x.id === p.id ? p : x)) : [...profiles, { ...p, id: newId("tax") }];
            if (await persist(next)) setEditing(null);
          }}
        />
      )}
    </PayrollShell>
  );
}

function TaxProfileDrawer({ initial, onClose, onSave }: { initial: TaxProfileDef; onClose: () => void; onSave: (p: TaxProfileDef) => Promise<void> }) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState("");
  const set = (k: keyof TaxProfileDef, v: string) => setP((x) => ({ ...x, [k]: v }));

  function submit() {
    if (!p.profileName.trim()) return setError("Profile name is required.");
    if (p.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p.pan.trim().toUpperCase())) return setError("PAN looks wrong — 5 letters, 4 digits, 1 letter.");
    if (p.tan && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(p.tan.trim().toUpperCase())) return setError("TAN looks wrong — 4 letters, 5 digits, 1 letter.");
    void onSave({ ...p, profileName: p.profileName.trim(), pan: p.pan.trim().toUpperCase(), tan: p.tan.trim().toUpperCase() });
  }

  return (
    <Drawer title={initial.id ? "Edit Tax Profile" : "New Tax Profile"} onClose={onClose} onSave={submit} saveLabel="Save">
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label="Profile name" required><input value={p.profileName} onChange={(e) => set("profileName", e.target.value)} className="input" autoFocus /></DrawerField>
        <DrawerField label="Description"><input value={p.description} onChange={(e) => set("description", e.target.value)} className="input" /></DrawerField>
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Deductor PAN"><input value={p.pan} onChange={(e) => set("pan", e.target.value)} className="input uppercase" placeholder="AAAAA0000A" /></DrawerField>
          <DrawerField label="TAN"><input value={p.tan} onChange={(e) => set("tan", e.target.value)} className="input uppercase" placeholder="AAAA00000A" /></DrawerField>
          <DrawerField label="TDS circle"><input value={p.tdsCircle} onChange={(e) => set("tdsCircle", e.target.value)} className="input" /></DrawerField>
          <DrawerField label="Deductor type">
            <Select value={p.deductorType} onChange={(v) => set("deductorType", v)} options={[{ value: "EMPLOYEE", label: "Employee" }, { value: "NON_EMPLOYEE", label: "Non-employee" }]} />
          </DrawerField>
          <DrawerField label="Responsible person"><input value={p.deductorName} onChange={(e) => set("deductorName", e.target.value)} className="input" /></DrawerField>
          <DrawerField label="Father's name"><input value={p.fatherName} onChange={(e) => set("fatherName", e.target.value)} className="input" /></DrawerField>
        </div>
      </div>
    </Drawer>
  );
}
