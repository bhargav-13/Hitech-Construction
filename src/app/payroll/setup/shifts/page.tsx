"use client";

import { useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Drawer, DrawerField } from "@/components/Drawer";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useShifts } from "@/lib/usePayrollSetup";
import { ApiError } from "@/lib/api";
import type { ShiftResponse } from "@/lib/api";
import { ArrowLeft, Clock, Pencil, Plus, Trash2 } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKS = [1, 2, 3, 4, 5];
type FineMode = "NONE" | "FIXED" | "MULTIPLIER";

/** "6:2,4;0:1" → {6: [2,4], 0: [1]} — alternate weekly offs by week of the month. */
function parseAlt(text: string | undefined): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const part of (text ?? "").split(";")) {
    const [d, w] = part.split(":");
    if (d === undefined || !w) continue;
    out[Number(d)] = w.split(",").map(Number).filter((x) => x >= 1 && x <= 5);
  }
  return out;
}
function encodeAlt(map: Record<number, number[]>): string {
  return Object.entries(map).filter(([, w]) => w.length).map(([d, w]) => `${d}:${[...w].sort().join(",")}`).join(";");
}
const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th", "5th"][n];

export default function ShiftsPage() {
  const { shifts, loading, error, create, update, remove } = useShifts();
  const [editing, setEditing] = useState<ShiftResponse | null>(null);
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
              <h2 className="text-lg font-semibold text-gray-800">Shifts</h2>
              <p className="mt-0.5 text-sm text-gray-500">Work timings and attendance rules, assigned to people on their profile.</p>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={15} /> New Shift
          </button>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : shifts.length === 0 ? (
          <PayrollEmpty icon={Clock} title="No shifts yet" hint="Add a shift to define work timings and weekly-offs." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shifts.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(s)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditing(s); }}
                className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:border-brand-accent hover:shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><Clock size={16} /></div>
                    <div>
                      <div className="font-medium text-gray-800">{s.name}</div>
                      <div className="text-xs text-gray-400">{s.startTime} – {s.endTime} · {s.fullDayHours}h full day</div>
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowMenu align="right" buttonLabel={`Actions for ${s.name}`}>
                      {(close) => (
                        <>
                          <RowMenuItem icon={Pencil} label="Edit" onClick={() => { close(); setEditing(s); }} />
                          <RowMenuDivider />
                          <RowMenuItem
                            icon={Trash2}
                            label="Delete"
                            tone="danger"
                            onClick={async () => {
                              close();
                              try {
                                await remove(s.id);
                              } catch (err) {
                                setActionError(err instanceof ApiError ? err.message : "Unable to delete this shift.");
                              }
                            }}
                          />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {s.weeklyOffs.length > 0 ? (
                    s.weeklyOffs.map((d) => (
                      <span key={d} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">{DAYS[d]} off</span>
                    ))
                  ) : (
                    <span className="text-[11px] text-gray-400">No weekly-off</span>
                  )}
                  {Object.entries(parseAlt(s.alternateOffs)).map(([d, w]) => (
                    <span key={`alt-${d}`} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">{w.map(ordinal).join(" & ")} {DAYS[Number(d)]} off</span>
                  ))}
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{s.graceMinutes}m grace</span>
                  {s.lateFineMode && s.lateFineMode !== "NONE" && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Late fine</span>}
                  {s.earlyFineMode && s.earlyFineMode !== "NONE" && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Early-exit fine</span>}
                  {Number(s.otMultiplier ?? 0) > 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">OT {Number(s.otMultiplier)}x</span>}
                  {s.overtimeEnabled && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">OT on</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <ShiftDrawer
          existing={editing ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onCreate={create}
          onUpdate={update}
        />
      )}
    </PayrollShell>
  );
}

function FineRule({ label, mode, value, onMode, onValue }: {
  label: string; mode: FineMode; value: number; onMode: (m: FineMode) => void; onValue: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-2.5">
      <div className="mb-1.5 text-xs font-medium text-gray-700">{label}</div>
      <div className="flex gap-2">
        <select value={mode} onChange={(e) => onMode(e.target.value as FineMode)} className="input flex-1">
          <option value="NONE">No fine</option>
          <option value="FIXED">Fixed amount per day (₹)</option>
          <option value="MULTIPLIER">Hours × hourly salary × multiplier</option>
        </select>
        {mode !== "NONE" && (
          <input type="number" min={0} step={mode === "MULTIPLIER" ? 0.5 : 10} value={value} onChange={(e) => onValue(Number(e.target.value))} className="input w-24" placeholder={mode === "FIXED" ? "₹" : "1"} />
        )}
      </div>
    </div>
  );
}

function ShiftDrawer({
  existing,
  onClose,
  onCreate,
  onUpdate,
}: {
  existing?: ShiftResponse;
  onClose: () => void;
  onCreate: ReturnType<typeof useShifts>["create"];
  onUpdate: ReturnType<typeof useShifts>["update"];
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "18:00");
  const [weeklyOffs, setWeeklyOffs] = useState<number[]>(existing?.weeklyOffs ?? [0]);
  const [graceMinutes, setGraceMinutes] = useState(existing?.graceMinutes ?? 30);
  const [halfDayHours, setHalfDayHours] = useState(existing?.halfDayHours ?? 4);
  const [fullDayHours, setFullDayHours] = useState(existing?.fullDayHours ?? 8);
  const [overtimeEnabled, setOvertimeEnabled] = useState(existing?.overtimeEnabled ?? true);
  const [alt, setAlt] = useState<Record<number, number[]>>(() => parseAlt(existing?.alternateOffs));
  const [lateMode, setLateMode] = useState<FineMode>(existing?.lateFineMode ?? "NONE");
  const [lateValue, setLateValue] = useState(Number(existing?.lateFineValue ?? 0));
  const [earlyMode, setEarlyMode] = useState<FineMode>(existing?.earlyFineMode ?? "NONE");
  const [earlyValue, setEarlyValue] = useState(Number(existing?.earlyFineValue ?? 0));
  const [otMultiplier, setOtMultiplier] = useState(Number(existing?.otMultiplier ?? 0));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) =>
    setWeeklyOffs((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  async function save() {
    if (!name.trim()) { setError("Shift name is required."); return; }
    setSaving(true);
    setError("");
    const body = {
      name: name.trim(),
      startTime,
      endTime,
      weeklyOffs,
      graceMinutes: Number(graceMinutes) || 0,
      halfDayHours: Number(halfDayHours) || 0,
      fullDayHours: Number(fullDayHours) || 0,
      overtimeEnabled,
      alternateOffs: encodeAlt(alt),
      lateFineMode: lateMode,
      lateFineValue: Number(lateValue) || 0,
      earlyFineMode: earlyMode,
      earlyFineValue: Number(earlyValue) || 0,
      otMultiplier: overtimeEnabled ? Number(otMultiplier) || 0 : 0,
    };
    try {
      if (existing) await onUpdate(existing.id, body);
      else await onCreate(body);
      onClose();
    } catch {
      setError("Unable to save this shift. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Drawer title={existing ? "Edit Shift" : "New Shift"} onClose={onClose} onSave={save} saveLabel={saving ? "Saving…" : "Save Shift"}>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <DrawerField label="Shift Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. General (9 AM – 6 PM)" autoFocus />
        </DrawerField>
        <div className="grid grid-cols-2 gap-3">
          <DrawerField label="Start Time"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" /></DrawerField>
          <DrawerField label="End Time"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" /></DrawerField>
        </div>

        <DrawerField group label="Weekly Offs">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = weeklyOffs.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`h-9 w-11 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    on ? "bg-brand-accent text-white" : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </DrawerField>

        <div className="grid grid-cols-3 gap-3">
          <DrawerField label="Grace (min)"><input type="number" value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} className="input" /></DrawerField>
          <DrawerField label="Half-day (hrs)"><input type="number" value={halfDayHours} onChange={(e) => setHalfDayHours(Number(e.target.value))} className="input" /></DrawerField>
          <DrawerField label="Full-day (hrs)"><input type="number" value={fullDayHours} onChange={(e) => setFullDayHours(Number(e.target.value))} className="input" /></DrawerField>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <button
            type="button"
            role="switch"
            aria-checked={overtimeEnabled}
            onClick={() => setOvertimeEnabled((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${overtimeEnabled ? "bg-brand-accent" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${overtimeEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
          Pay hours beyond full-day as overtime
        </label>
        {overtimeEnabled && (
          <DrawerField label="Overtime pay">
            <select value={otMultiplier} onChange={(e) => setOtMultiplier(Number(e.target.value))} className="input">
              <option value={0}>Count overtime as extra days (current)</option>
              <option value={1}>1x hourly salary</option>
              <option value={1.5}>1.5x hourly salary</option>
              <option value={2}>2x hourly salary</option>
            </select>
          </DrawerField>
        )}

        <DrawerField group label="Alternate weekly offs (by week of the month)">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-gray-500"><th className="px-2 py-1.5 text-left font-medium">Day</th>{WEEKS.map((w) => <th key={w} className="px-1 py-1.5 font-medium">{ordinal(w)}</th>)}</tr></thead>
              <tbody>
                {DAYS.map((d, i) => (
                  <tr key={d} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-gray-700">{d}{weeklyOffs.includes(i) && <span className="ml-1 text-[10px] text-gray-400">(every week)</span>}</td>
                    {WEEKS.map((w) => (
                      <td key={w} className="px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          disabled={weeklyOffs.includes(i)}
                          checked={(alt[i] ?? []).includes(w)}
                          onChange={() => setAlt((a) => {
                            const cur = a[i] ?? [];
                            return { ...a, [i]: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w] };
                          })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">e.g. tick Sat · 2nd and 4th for &ldquo;2nd &amp; 4th Saturday off&rdquo;.</p>
        </DrawerField>

        <DrawerField group label="Automation rules (fines)">
          <div className="space-y-2">
            <FineRule label="Late entry (after shift start + grace)" mode={lateMode} value={lateValue} onMode={setLateMode} onValue={setLateValue} />
            <FineRule label="Early exit (before shift end)" mode={earlyMode} value={earlyValue} onMode={setEarlyMode} onValue={setEarlyValue} />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Fines are raised automatically from punch times and show on the attendance board; an admin can edit them per day.</p>
        </DrawerField>
      </div>
    </Drawer>
  );
}
