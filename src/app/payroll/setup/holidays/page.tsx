"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer, DrawerField } from "@/components/Drawer";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { DatePicker } from "@/components/DatePicker";
import { useHolidayPolicies } from "@/lib/usePayrollSetup";
import { ApiError } from "@/lib/api";
import type { HolidayPolicyResponse, HolidayResponse } from "@/lib/api";
import { ArrowLeft, Palmtree, Pencil, Plus, Trash2, X } from "lucide-react";

export default function HolidaysPage() {
  const { holidayPolicies, loading, error, create, update, remove } = useHolidayPolicies();
  const [editing, setEditing] = useState<HolidayPolicyResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/payroll/setup" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
              <ArrowLeft size={14} /> Setup
            </Link>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Holiday Policy</h2>
              <p className="mt-0.5 text-sm text-gray-500">Holiday calendars, assigned to people on their profile.</p>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={15} /> New Policy
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : holidayPolicies.length === 0 ? (
          <PayrollEmpty icon={Palmtree} title="No holiday policies yet" hint="Add a policy and list the year's holidays." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {holidayPolicies.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(p)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditing(p); }}
                className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:border-brand-accent hover:shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Palmtree size={16} /></div>
                    <div>
                      <div className="font-medium text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.year} · {p.holidays.length} holiday{p.holidays.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowMenu align="right" buttonLabel={`Actions for ${p.name}`}>
                      {(close) => (
                        <>
                          <RowMenuItem icon={Pencil} label="Edit" onClick={() => { close(); setEditing(p); }} />
                          <RowMenuDivider />
                          <RowMenuItem
                            icon={Trash2}
                            label="Delete"
                            tone="danger"
                            onClick={async () => {
                              close();
                              try {
                                await remove(p.id);
                              } catch (err) {
                                setActionError(err instanceof ApiError ? err.message : "Unable to delete this policy.");
                              }
                            }}
                          />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.holidays.slice(0, 4).map((h) => (
                    <span key={h.date} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{h.name}</span>
                  ))}
                  {p.holidays.length > 4 && <span className="text-[11px] text-gray-400">+{p.holidays.length - 4} more</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <HolidayPolicyDrawer existing={editing ?? undefined} onClose={() => { setEditing(null); setCreating(false); }} onCreate={create} onUpdate={update} />
      )}
    </PayrollShell>
  );
}

function HolidayPolicyDrawer({
  existing,
  onClose,
  onCreate,
  onUpdate,
}: {
  existing?: HolidayPolicyResponse;
  onClose: () => void;
  onCreate: ReturnType<typeof useHolidayPolicies>["create"];
  onUpdate: ReturnType<typeof useHolidayPolicies>["update"];
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [year, setYear] = useState(existing?.year ?? new Date().getFullYear());
  const [holidays, setHolidays] = useState<HolidayResponse[]>(existing?.holidays ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addRow = () => setHolidays((h) => [...h, { date: `${year}-01-01`, name: "", type: "PUBLIC" }]);
  const updateRow = (i: number, patch: Partial<HolidayResponse>) =>
    setHolidays((h) => h.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setHolidays((h) => h.filter((_, idx) => idx !== i));

  async function save() {
    if (!name.trim()) { setError("Policy name is required."); return; }
    const clean = holidays.filter((h) => h.name.trim() && h.date).sort((a, b) => a.date.localeCompare(b.date));
    setSaving(true);
    setError("");
    const body = { name: name.trim(), year: Number(year), holidays: clean };
    try {
      if (existing) await onUpdate(existing.id, body);
      else await onCreate(body);
      onClose();
    } catch {
      setError("Unable to save this policy. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Drawer title={existing ? "Edit Holiday Policy" : "New Holiday Policy"} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save Policy"} width="max-w-2xl">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <DrawerField label="Policy Name" required className="col-span-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. India Public Holidays 2026" autoFocus />
          </DrawerField>
          <DrawerField label="Year"><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input" /></DrawerField>
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">Holidays ({holidays.length})</span>
            <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              <Plus size={13} /> Add holiday
            </button>
          </div>
          {holidays.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">No holidays yet. Add the year&apos;s holidays.</p>
          ) : (
            <div className="space-y-2">
              {holidays.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-40 shrink-0">
                    <DatePicker value={h.date} onChange={(v) => updateRow(i, { date: v })} placeholder="Date" />
                  </div>
                  <input value={h.name} onChange={(e) => updateRow(i, { name: e.target.value })} className="input flex-1" placeholder="Holiday name" />
                  <select value={h.type} onChange={(e) => updateRow(i, { type: e.target.value as HolidayResponse["type"] })} className="input w-32 shrink-0">
                    <option value="PUBLIC">Public</option>
                    <option value="OPTIONAL">Optional</option>
                  </select>
                  <button type="button" onClick={() => removeRow(i)} className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
