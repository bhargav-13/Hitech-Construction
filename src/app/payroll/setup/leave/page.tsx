"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer, DrawerField } from "@/components/Drawer";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Select } from "@/components/Select";
import { useLeavePolicies } from "@/lib/usePayrollSetup";
import { ApiError } from "@/lib/api";
import type { LeavePolicyResponse, LeaveTypeResponse } from "@/lib/api";
import { ArrowLeft, CalendarDays, Pencil, Plus, Trash2, X } from "lucide-react";

const totalLeaves = (types: LeaveTypeResponse[]) => types.reduce((a, t) => a + (Number(t.annualCount) || 0), 0);

/**
 * How many days a cycle is worth, and how many of them land in a month.
 *
 * The counts on a policy are per *cycle*, and the cycle is either a year or a month — so a flat
 * "30 days" said nothing about which, and read as a monthly allowance on a yearly policy. What
 * anyone actually wants to know is the monthly figure, because that is what accrues into a balance
 * and what a part-year joiner is entitled to.
 *
 * A type that accrues MONTHLY contributes its count spread over the cycle; one granted ALL_AT_ONCE
 * arrives whole at the start and contributes nothing per month, which is why the two are added
 * separately rather than dividing the total by twelve.
 */
const CYCLE_MONTHS: Record<LeavePolicyResponse["cycle"], number> = { YEARLY: 12, MONTHLY: 1 };

function leaveTotals(types: LeaveTypeResponse[], cycle: LeavePolicyResponse["cycle"]) {
  const months = CYCLE_MONTHS[cycle];
  const perCycle = totalLeaves(types);
  const perMonth = types.reduce(
    (a, t) => a + (t.accrual === "MONTHLY" ? (Number(t.annualCount) || 0) / months : 0),
    0,
  );
  return { perCycle, perMonth, months, upfront: perCycle - perMonth * months };
}

/** 2.5 → "2.5", 1 → "1" — no trailing ".00" on counts that are whole, which most are. */
const days = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The per-month rate of one leave type, or null when it is granted in one go. */
function monthlyRate(t: LeaveTypeResponse, cycle: LeavePolicyResponse["cycle"]): number | null {
  if (t.accrual !== "MONTHLY") return null;
  return (Number(t.annualCount) || 0) / CYCLE_MONTHS[cycle];
}

export default function LeavePolicyPage() {
  const { leavePolicies, loading, error, create, update, remove } = useLeavePolicies();
  const [editing, setEditing] = useState<LeavePolicyResponse | null>(null);
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
              <h2 className="text-lg font-semibold text-gray-800">Leave Policy</h2>
              <p className="mt-0.5 text-sm text-gray-500">Leave types and counts, assigned to people on their profile.</p>
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
        ) : leavePolicies.length === 0 ? (
          <PayrollEmpty icon={CalendarDays} title="No leave policies yet" hint="Add a policy and define its leave types." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {leavePolicies.map((p) => (
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
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><CalendarDays size={16} /></div>
                    <div>
                      <div className="font-medium text-gray-800">{p.name}</div>
                      <div className="text-xs text-gray-400">
                        {p.cycle === "YEARLY" ? "Yearly" : "Monthly"} · {days(leaveTotals(p.types, p.cycle).perCycle)} days /{" "}
                        {p.cycle === "YEARLY" ? "year" : "month"}
                        {p.cycle === "YEARLY" && leaveTotals(p.types, p.cycle).perMonth > 0 && (
                          <> · {days(leaveTotals(p.types, p.cycle).perMonth)} / month</>
                        )}
                      </div>
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
                  {p.types.map((t) => {
                    const rate = monthlyRate(t, p.cycle);
                    return (
                      <span key={t.name} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                        {t.name}: {t.annualCount}
                        {rate != null && p.cycle === "YEARLY" && <span className="text-gray-400"> ({days(rate)}/mo)</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <LeavePolicyDrawer existing={editing ?? undefined} onClose={() => { setEditing(null); setCreating(false); }} onCreate={create} onUpdate={update} />
      )}
    </PayrollShell>
  );
}

function LeavePolicyDrawer({
  existing,
  onClose,
  onCreate,
  onUpdate,
}: {
  existing?: LeavePolicyResponse;
  onClose: () => void;
  onCreate: ReturnType<typeof useLeavePolicies>["create"];
  onUpdate: ReturnType<typeof useLeavePolicies>["update"];
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [cycle, setCycle] = useState<LeavePolicyResponse["cycle"]>(existing?.cycle ?? "YEARLY");
  const [types, setTypes] = useState<LeaveTypeResponse[]>(existing?.types ?? [{ name: "Casual Leave", annualCount: 12, accrual: "MONTHLY", paid: true }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = leaveTotals(types, cycle);

  const addRow = () => setTypes((t) => [...t, { name: "", annualCount: 0, accrual: "ALL_AT_ONCE", paid: true }]);
  const updateRow = (i: number, patch: Partial<LeaveTypeResponse>) => setTypes((t) => t.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setTypes((t) => t.filter((_, idx) => idx !== i));

  async function save() {
    if (!name.trim()) { setError("Policy name is required."); return; }
    const clean = types.filter((t) => t.name.trim());
    if (clean.length === 0) { setError("Add at least one leave type."); return; }
    setSaving(true);
    setError("");
    const body = { name: name.trim(), cycle, types: clean };
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
    <Drawer title={existing ? "Edit Leave Policy" : "New Leave Policy"} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save Policy"} width="max-w-2xl">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="grid grid-cols-3 gap-3">
          <DrawerField label="Policy Name" required className="col-span-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Standard Leave Policy" autoFocus />
          </DrawerField>
          <DrawerField label="Cycle">
            <Select value={cycle} onChange={(v) => setCycle(v as LeavePolicyResponse["cycle"])} options={[{ value: "YEARLY", label: "Yearly" }, { value: "MONTHLY", label: "Monthly" }]} />
          </DrawerField>
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <span className="text-sm font-semibold text-gray-800">
                Leave Types · {days(totals.perCycle)} days / {cycle === "YEARLY" ? "year" : "month"}
              </span>
              {/* The figure people actually plan against, spelled out rather than left to be worked
                  out from twelve rows of counts and accrual settings. */}
              <p className="mt-0.5 text-xs text-gray-500">
                {totals.perMonth > 0 ? (
                  <>
                    <span className="font-medium text-gray-700">{days(totals.perMonth)} days accrue each month</span>
                    {totals.upfront > 0 && <>, plus {days(totals.upfront)} granted up front</>}
                  </>
                ) : (
                  <>All {days(totals.perCycle)} days are granted up front — nothing accrues monthly.</>
                )}
              </p>
            </div>
            <button type="button" onClick={addRow} className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-brand-accent hover:underline">
              <Plus size={13} /> Add type
            </button>
          </div>
          <div className="space-y-2">
            {types.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={t.name} onChange={(e) => updateRow(i, { name: e.target.value })} className="input flex-1" placeholder="Leave type" />
                <div className="relative w-20 shrink-0">
                  <input
                    type="number"
                    value={t.annualCount}
                    onChange={(e) => updateRow(i, { annualCount: Number(e.target.value) })}
                    className="input w-full"
                    placeholder="Days"
                    title={`Days per ${cycle === "YEARLY" ? "year" : "month"}`}
                  />
                </div>
                <select value={t.accrual} onChange={(e) => updateRow(i, { accrual: e.target.value as LeaveTypeResponse["accrual"] })} className="input w-36 shrink-0">
                  <option value="ALL_AT_ONCE">All at once</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                <span className="w-16 shrink-0 text-right text-[11px] whitespace-nowrap text-gray-400">
                  {monthlyRate(t, cycle) != null ? `${days(monthlyRate(t, cycle)!)} / mo` : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => updateRow(i, { paid: !t.paid })}
                  title={t.paid ? "Paid leave" : "Unpaid leave"}
                  className={`shrink-0 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${t.paid ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                >
                  {t.paid ? "Paid" : "Unpaid"}
                </button>
                <button type="button" onClick={() => removeRow(i)} className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
