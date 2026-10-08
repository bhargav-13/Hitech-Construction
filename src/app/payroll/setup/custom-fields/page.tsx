"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { ApiError } from "@/lib/api";
import { newId, usePayrollSetting } from "@/lib/payrollSettings";
import type { CustomFieldDef, CustomFieldType } from "@/lib/payrollSettings";
import { ArrowLeft, ListPlus, Plus, X } from "lucide-react";

const TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "DROPDOWN", label: "Dropdown" },
];

/** Custom staff fields — extra details the org records on every staff profile (PagarBook "Custom Fields"). */
export default function CustomFieldsPage() {
  const { value, loading, save } = usePayrollSetting("CUSTOM_FIELDS");
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Copy the saved value into the editable draft whenever it (re)loads — during render, not in an effect.
  const [synced, setSynced] = useState<typeof value | null>(null);
  if (!loading && synced !== value) {
    setSynced(value);
    setFields(value);
  }

  const update = (i: number, patch: Partial<CustomFieldDef>) => setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const dirty = JSON.stringify(fields) !== JSON.stringify(value);

  async function onSave() {
    const clean = fields.filter((f) => f.label.trim()).map((f) => ({
      ...f, label: f.label.trim(), options: f.type === "DROPDOWN" ? f.options.map((o) => o.trim()).filter(Boolean) : [],
    }));
    if (clean.some((f) => f.type === "DROPDOWN" && f.options.length === 0)) {
      setMsg({ ok: false, text: "A dropdown needs at least one option." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      setFields(await save(clean));
      setMsg({ ok: true, text: "Saved. Fill these in on each staff profile." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Unable to save." });
    } finally {
      setSaving(false);
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
              <h2 className="text-lg font-semibold text-gray-800">Custom Staff Fields</h2>
              <p className="mt-0.5 text-sm text-gray-500">Extra details recorded on every staff profile.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFields((f) => [...f, { id: newId("cf"), label: "", type: "TEXT", options: [] }])}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Plus size={14} /> Add field
            </button>
            <button onClick={onSave} disabled={saving || !dirty} className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {msg && <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg.text}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : fields.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
            <ListPlus size={28} className="text-gray-300" />
            <div className="text-sm font-medium text-gray-700">No custom fields yet</div>
            <p className="max-w-sm text-xs text-gray-500">e.g. Shoe size, Vehicle number, Licence expiry, Site helmet ID.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {fields.map((f, i) => (
              <div key={f.id} className="flex flex-wrap items-start gap-2 px-4 py-3">
                <input value={f.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Field name" className="input min-w-[180px] flex-1" />
                <select value={f.type} onChange={(e) => update(i, { type: e.target.value as CustomFieldType })} className="input w-36">
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {f.type === "DROPDOWN" && (
                  <input
                    value={f.options.join(", ")}
                    onChange={(e) => update(i, { options: e.target.value.split(",") })}
                    placeholder="Options, comma separated"
                    className="input min-w-[200px] flex-1"
                  />
                )}
                <button onClick={() => setFields((all) => all.filter((_, idx) => idx !== i))} title="Remove" className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PayrollShell>
  );
}
