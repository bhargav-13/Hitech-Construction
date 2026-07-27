"use client";

import { useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { usePayrollStore } from "@/lib/payrollApi";
import type { DeductorType } from "@/lib/payrollApi";
import { Plus, ReceiptText } from "lucide-react";

/** Tax Profiles — TDS deductor profiles used for statutory filings and Form 16. */
export default function TaxProfilesPage() {
  const profiles = usePayrollStore((s) => s.taxProfiles);
  const [creating, setCreating] = useState(false);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Tax Profiles</h2>
            <p className="mt-0.5 text-sm text-gray-500">Deductor profiles for TDS reports, filings and statutory compliance.</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">
            <Plus size={15} /> Add Tax Profile
          </button>
        </div>

        {profiles.length === 0 ? (
          <PayrollEmpty icon={ReceiptText} title="No tax profiles" hint="Add a deductor profile to generate TDS reports and Form 16." action={<button onClick={() => setCreating(true)} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add Tax Profile</button>} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">{p.profileName}</h3>
                    {p.description && <p className="mt-0.5 text-xs text-gray-400">{p.description}</p>}
                  </div>
                  <span className="rounded-md bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-brand-accent">{p.deductorType === "EMPLOYEE" ? "Employee" : "Non-Employee"}</span>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="PAN" value={p.pan} mono />
                  <Row label="TAN" value={p.tan} mono />
                  <Row label="TDS Circle" value={p.tdsCircle} mono />
                  <Row label="Deductor" value={p.deductorName} />
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && <TaxProfileDialog onClose={() => setCreating(false)} />}
    </PayrollShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className={`text-gray-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function TaxProfileDialog({ onClose }: { onClose: () => void }) {
  const addTaxProfile = usePayrollStore((s) => s.addTaxProfile);
  const [profileName, setProfileName] = useState("");
  const [description, setDescription] = useState("");
  const [pan, setPan] = useState("");
  const [tan, setTan] = useState("");
  const [tdsCircle, setTdsCircle] = useState("");
  const [deductorType, setDeductorType] = useState<DeductorType>("EMPLOYEE");
  const [deductorName, setDeductorName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [error, setError] = useState("");

  function save() {
    if (!profileName.trim()) return setError("Profile name is required.");
    if (pan.length !== 10) return setError("PAN must be 10 characters.");
    if (tan.length !== 10) return setError("TAN must be 10 characters.");
    if (!deductorName.trim()) return setError("Deductor name is required.");
    addTaxProfile({ profileName: profileName.trim(), description: description.trim() || null, pan, tan, tdsCircle: tdsCircle.trim(), deductorType, deductorName: deductorName.trim(), fatherName: fatherName.trim() });
    onClose();
  }

  return (
    <Drawer title="Add Tax Profile" onClose={onClose} onSave={save} saveLabel="Save Tax Profile" width="max-w-lg">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <Field label="Profile Name" required><input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="input" placeholder="Head Office Tax Profile" autoFocus /></Field>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="optional" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PAN" required><input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))} className="input font-mono" placeholder="AAAAA0000A" /></Field>
          <Field label="TAN" required><input value={tan} onChange={(e) => setTan(e.target.value.toUpperCase().slice(0, 10))} className="input font-mono" placeholder="AHMH00000H" /></Field>
        </div>
        <Field label="TDS Circle / AO Code"><input value={tdsCircle} onChange={(e) => setTdsCircle(e.target.value)} className="input font-mono" placeholder="AAA/AA/000/00" /></Field>
        <Field label="Deductor Type">
          <Select value={deductorType} onChange={(v) => setDeductorType(v as DeductorType)} options={[{ value: "EMPLOYEE", label: "Employee" }, { value: "NON_EMPLOYEE", label: "Non-Employee" }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deductor Name" required><input value={deductorName} onChange={(e) => setDeductorName(e.target.value)} className="input" /></Field>
          <Field label="Father's Name"><input value={fatherName} onChange={(e) => setFatherName(e.target.value)} className="input" /></Field>
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  );
}
