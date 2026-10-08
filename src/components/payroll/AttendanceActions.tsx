"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import {
  ApiError, editAttendance, getAttendanceLogs, getHourlyRate,
} from "@/lib/api";
import type { AttendanceApiResponse, AttendanceCodeApi, AttendanceEditRequestBody, AttendanceLogApi } from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { formatDateTimeIST } from "@/lib/datetime";
import { History, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { useOwnRecordLock } from "@/lib/permissions";

/**
 * PagarBook's per-day attendance actions: P · HD · A · F · OT · L (+ OD), a note and the day's
 * audit log. Used on the daily attendance board, a member's calendar and the staff profile.
 *
 * Fine and overtime lines are stored as "kind|hours|rateType|value|amount;…" on the day so the
 * dialog can reopen exactly what was entered; their rupee totals feed the payroll run.
 */

type ActionKind = "HD" | "F" | "OT" | "L" | "NOTE" | "LOGS";

export interface DayActionTarget {
  userId: number;
  name: string;
  date: string;
  row: AttendanceApiResponse | undefined;
}

/** Paid leave types offered for the other half of a half day / a leave mark. */
export type LeaveChoice = { value: string; label: string };

export function DayActions({
  target,
  leaveTypes = [],
  onSaved,
  onError,
  compact = false,
}: {
  target: DayActionTarget;
  leaveTypes?: LeaveChoice[];
  onSaved: () => void | Promise<void>;
  onError?: (msg: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const code = target.row?.code ?? "NM";
  const locked = useOwnRecordLock()(target.userId);

  async function quick(c: AttendanceCodeApi) {
    setBusy(c);
    try {
      const body: AttendanceEditRequestBody = { userId: target.userId, date: target.date, code: c };
      // Absent means nobody was here — clear the punch pair so no stale hours survive the mark.
      if (c === "A") Object.assign(body, { inTime: null, outTime: null, overtimeHours: 0, otAmount: 0, otDetail: "" });
      await editAttendance(body);
      await onSaved();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : "Unable to save this change.");
    } finally {
      setBusy(null);
    }
  }

  const fine = Number(target.row?.fineAmount ?? 0);
  const ot = Number(target.row?.otAmount ?? 0);
  const otHours = Number(target.row?.overtimeHours ?? 0);
  const btn = (on: boolean, cls: string) =>
    `px-2 ${compact ? "py-0.5" : "py-1"} text-xs font-semibold transition-colors ${on ? cls : "bg-white text-gray-400 hover:bg-gray-50"}`;

  if (locked) {
    // Your own attendance is marked by someone else (the server refuses it too).
    return (
      <span
        title="Your own attendance is marked by another HR / admin user."
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ring-1 ring-gray-200 ${ATTENDANCE_META[code as AttendanceCodeApi]?.className ?? ""}`}
      >
        {ATTENDANCE_META[code as AttendanceCodeApi]?.label ?? code} · yours
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-200">
        {(["P", "HD", "A"] as const).map((c) => (
          <button
            key={c}
            onClick={() => (c === "HD" ? setOpen("HD") : quick(c))}
            disabled={busy !== null}
            title={ATTENDANCE_META[c].label}
            className={btn(code === c, ATTENDANCE_META[c].className)}
          >
            {busy === c ? "…" : c === "HD" && code === "HD" && target.row?.halfDaySession ? `HD${target.row.halfDaySession}` : c}
          </button>
        ))}
        <button onClick={() => setOpen("F")} title="Fine" className={btn(fine > 0, "bg-rose-50 text-rose-700")}>
          {fine > 0 ? `F ${inr(fine)}` : "F"}
        </button>
        <button onClick={() => setOpen("OT")} title="Overtime" className={btn(otHours > 0 || ot > 0, "bg-emerald-50 text-emerald-700")}>
          {otHours > 0 ? `OT +${hoursLabel(otHours)}` : "OT"}
        </button>
        <button
          onClick={() => setOpen("L")}
          title="Leave / on duty / holiday"
          className={btn(["PL", "L", "OD", "H", "OH", "WO"].includes(code), ATTENDANCE_META[code as AttendanceCodeApi]?.className ?? "")}
        >
          {["PL", "L", "OD", "H", "OH", "WO"].includes(code) ? code : "L"}
        </button>
      </div>
      <button
        onClick={() => setOpen("NOTE")}
        title={target.row?.note ? `Note: ${target.row.note}` : "Add note"}
        className={`rounded-md p-1 transition-colors hover:bg-gray-100 ${target.row?.note ? "text-brand-accent" : "text-gray-400"}`}
      >
        <MessageSquarePlus size={14} />
      </button>
      <button onClick={() => setOpen("LOGS")} title="Logs" className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
        <History size={14} />
      </button>

      {open === "HD" && <HalfDayDialog target={target} leaveTypes={leaveTypes} onClose={() => setOpen(null)} onSaved={onSaved} />}
      {open === "F" && <MoneyLinesDialog mode="FINE" target={target} onClose={() => setOpen(null)} onSaved={onSaved} />}
      {open === "OT" && <MoneyLinesDialog mode="OT" target={target} onClose={() => setOpen(null)} onSaved={onSaved} />}
      {open === "L" && <LeaveDialog target={target} leaveTypes={leaveTypes} onClose={() => setOpen(null)} onSaved={onSaved} />}
      {open === "NOTE" && <NoteDialog target={target} onClose={() => setOpen(null)} onSaved={onSaved} />}
      {open === "LOGS" && <LogsDialog target={target} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A duration as two small fields, hh : mm — a clock-time input fights typed durations. */
export function HoursInput({ value, onChange }: { value: number; onChange: (hours: number) => void }) {
  const hh = Math.floor(value);
  const mm = Math.round((value - hh) * 60);
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={23}
        value={hh}
        onChange={(e) => onChange(Math.max(0, Math.min(23, Number(e.target.value) || 0)) + mm / 60)}
        className="input w-14 text-center"
        aria-label="Hours"
      />
      <span className="text-gray-400">:</span>
      <input
        type="number"
        min={0}
        max={59}
        step={5}
        value={String(mm).padStart(2, "0")}
        onChange={(e) => onChange(hh + Math.max(0, Math.min(59, Number(e.target.value) || 0)) / 60)}
        className="input w-14 text-center"
        aria-label="Minutes"
      />
      <span className="text-xs text-gray-400">hrs</span>
    </div>
  );
}

export function hoursLabel(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function Header({ title, target }: { title: string; target: DayActionTarget }) {
  return (
    <div className="border-b border-gray-100 px-5 py-4 pr-12">
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-500">
        {target.name} · {new Date(`${target.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", weekday: "short" })}
      </p>
    </div>
  );
}

function Footer({ saving, onCancel, onSave, label = "Save", error }: {
  saving: boolean; onCancel: () => void; onSave: () => void; label?: string; error?: string;
}) {
  return (
    <div className="border-t border-gray-100 px-5 py-3">
      {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={onSave} disabled={saving} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

function useSave(target: DayActionTarget, onSaved: () => void | Promise<void>, onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(patch: Partial<AttendanceEditRequestBody>) {
    setSaving(true);
    setError("");
    try {
      await editAttendance({ userId: target.userId, date: target.date, ...patch });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
      setSaving(false);
    }
  }
  return { saving, error, save };
}

/** Half day: which session was worked, and what the other half counts as. */
function HalfDayDialog({ target, leaveTypes, onClose, onSaved }: {
  target: DayActionTarget; leaveTypes: LeaveChoice[]; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const [session, setSession] = useState<number>(target.row?.halfDaySession ?? 1);
  const [other, setOther] = useState<string>(target.row?.halfDayLeave ?? "UNPAID");
  const { saving, error, save } = useSave(target, onSaved, onClose);
  const options = [
    { value: "UNPAID", label: "Unpaid (loss of pay)" },
    ...leaveTypes.map((l) => ({ value: l.value, label: `${l.label} (paid)` })),
    { value: "OTHER", label: "Other" },
  ];
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <Header title="Half Day Option" target={target} />
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-gray-600">Choose the session worked and whether the remaining half is a paid or unpaid leave.</p>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-500">Choose session</span>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSession(s)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${session === s ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                Session {s} {s === 1 ? "(first half)" : "(second half)"}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-gray-500">Remaining half counts as</span>
          <Select value={other} onChange={setOther} options={options} />
        </label>
        <p className="text-[11px] text-gray-400">A paid leave for the other half makes the day fully payable; unpaid or other pays half.</p>
      </div>
      <Footer saving={saving} error={error} onCancel={onClose} onSave={() => save({ code: "HD", halfDaySession: session, halfDayLeave: other })} />
    </Modal>
  );
}

/** Leave, on duty, holiday or weekly off for the whole day. */
function LeaveDialog({ target, leaveTypes, onClose, onSaved }: {
  target: DayActionTarget; leaveTypes: LeaveChoice[]; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const current = target.row?.code ?? "NM";
  const [code, setCode] = useState<AttendanceCodeApi>(["PL", "L", "OD", "H", "OH", "WO"].includes(current) ? current : "PL");
  const [leaveName, setLeaveName] = useState(leaveTypes[0]?.value ?? "");
  const { saving, error, save } = useSave(target, onSaved, onClose);
  const choices: { code: AttendanceCodeApi; hint: string }[] = [
    { code: "PL", hint: "Paid — counts as a payable day" },
    { code: "L", hint: "Unpaid — loss of pay" },
    { code: "OD", hint: "Working off-site — counts as present" },
    { code: "H", hint: "Paid holiday" },
    { code: "OH", hint: "Optional holiday taken (unpaid unless your policy pays it)" },
    { code: "WO", hint: "Weekly off — payable" },
  ];
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <Header title="Leave / Other" target={target} />
      <div className="space-y-2 px-5 py-4">
        {choices.map((c) => (
          <button
            key={c.code}
            onClick={() => setCode(c.code)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${code === c.code ? "border-brand-accent bg-cyan-50" : "border-gray-200 hover:bg-gray-50"}`}
          >
            <span className={`inline-flex min-w-[34px] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${ATTENDANCE_META[c.code].className}`}>{c.code}</span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-800">{ATTENDANCE_META[c.code].label}</span>
              <span className="block text-[11px] text-gray-500">{c.hint}</span>
            </span>
          </button>
        ))}
        {code === "PL" && leaveTypes.length > 0 && (
          <label className="block pt-2">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">Leave category</span>
            <Select value={leaveName} onChange={setLeaveName} options={leaveTypes} />
          </label>
        )}
      </div>
      <Footer
        saving={saving}
        error={error}
        onCancel={onClose}
        onSave={() => save({
          code,
          inTime: null,
          outTime: null,
          note: code === "PL" && leaveName ? `Leave: ${leaveName}` : undefined,
        })}
      />
    </Modal>
  );
}

type RateType = "X1" | "X1_5" | "X2" | "FIXED" | "PER_HOUR" | "HALF_DAY" | "FULL_DAY";
interface MoneyLine {
  kind: string;
  hours: number;
  rateType: RateType;
  value: number;
}

const FINE_KINDS = [
  { kind: "LATE", label: "Late Entry" },
  { kind: "EARLY", label: "Early Out" },
  { kind: "BREAK", label: "Excess Breaks" },
];
const OT_KINDS = [
  { kind: "AFTER", label: "Overtime · after the shift ends" },
  { kind: "BEFORE", label: "Early Overtime · before the shift begins" },
  { kind: "WEEKLY_OFF", label: "Weekly Off Overtime" },
];
const RATE_OPTIONS: { value: RateType; label: string; ot?: boolean }[] = [
  { value: "X1", label: "1x Salary" },
  { value: "X1_5", label: "1.5x Salary" },
  { value: "X2", label: "2x Salary" },
  { value: "FIXED", label: "Fixed Amount" },
  { value: "PER_HOUR", label: "Fixed Amount Per Hour" },
  { value: "HALF_DAY", label: "Half Day", ot: true },
  { value: "FULL_DAY", label: "Full Day", ot: true },
];

function lineAmount(l: MoneyLine, hourly: number): number {
  switch (l.rateType) {
    case "X1": return l.hours * hourly;
    case "X1_5": return l.hours * hourly * 1.5;
    case "X2": return l.hours * hourly * 2;
    case "FIXED": return l.value;
    case "PER_HOUR": return l.hours * l.value;
    case "HALF_DAY": return hourly * 8 * 0.5;
    case "FULL_DAY": return hourly * 8;
  }
}

/** Parse "kind|hours|rateType|value|amount;…" written by this dialog (AUTO lines come from shift rules). */
function parseLines(detail: string | null | undefined): MoneyLine[] {
  if (!detail) return [];
  return detail.split(";").map((part) => {
    const [kind, hours, rateType, value] = part.split("|");
    const rt = (rateType === "AUTO" ? "X1" : rateType) as RateType;
    return { kind, hours: Number(hours) || 0, rateType: RATE_OPTIONS.some((o) => o.value === rt) ? rt : "X1", value: Number(value) || 0 };
  }).filter((l) => l.kind);
}

/** Fine (late / early / breaks) or Overtime (after / before / weekly off) for one day. */
function MoneyLinesDialog({ mode, target, onClose, onSaved }: {
  mode: "FINE" | "OT"; target: DayActionTarget; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const kinds = mode === "FINE" ? FINE_KINDS : OT_KINDS;
  const [hourly, setHourly] = useState<number | null>(null);
  const [lines, setLines] = useState<MoneyLine[]>(() => {
    const parsed = parseLines(mode === "FINE" ? target.row?.fineDetail : target.row?.otDetail);
    if (parsed.length) return parsed;
    if (mode === "OT" && Number(target.row?.overtimeHours ?? 0) > 0) {
      return [{ kind: "AFTER", hours: Number(target.row?.overtimeHours), rateType: "X1", value: 0 }];
    }
    return kinds.map((k) => ({ kind: k.kind, hours: 0, rateType: "X1" as RateType, value: 0 }));
  });
  const [alerts, setAlerts] = useState(false);
  const { saving, error, save } = useSave(target, onSaved, onClose);

  useEffect(() => {
    let cancelled = false;
    getHourlyRate(target.userId, target.date)
      .then((r) => { if (!cancelled) setHourly(Number(r.hourlyRate) || 0); })
      .catch(() => { if (!cancelled) setHourly(0); });
    return () => { cancelled = true; };
  }, [target.userId, target.date]);

  const amounts = useMemo(() => lines.map((l) => Math.round(lineAmount(l, hourly ?? 0) * 100) / 100), [lines, hourly]);
  const total = amounts.reduce((a, b) => a + b, 0);
  const totalHours = lines.reduce((a, l) => a + l.hours, 0);
  const unused = kinds.filter((k) => !lines.some((l) => l.kind === k.kind));

  function update(i: number, patch: Partial<MoneyLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    const kept = lines.map((l, i) => ({ l, amt: amounts[i] })).filter(({ l, amt }) => l.hours > 0 || amt > 0);
    const detail = kept.map(({ l, amt }) => `${l.kind}|${l.hours}|${l.rateType}|${l.value}|${amt}`).join(";");
    if (mode === "FINE") {
      save({ fineAmount: total, fineHours: Math.round(totalHours * 100) / 100, fineDetail: detail });
    } else {
      save({ overtimeHours: Math.round(totalHours * 100) / 100, otAmount: total, otDetail: detail });
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <Header title={mode === "FINE" ? "Fine" : "Overtime"} target={target} />
      <div className="space-y-3 px-5 py-4">
        {hourly === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Spinner size={14} /> Working out the hourly rate…</div>
        ) : (
          <p className="text-xs text-gray-500">
            Hourly rate {inr(hourly)} / hr (monthly salary ÷ days in month ÷ shift hours).
          </p>
        )}
        {lines.map((l, i) => {
          const label = kinds.find((k) => k.kind === l.kind)?.label ?? l.kind;
          const options = RATE_OPTIONS.filter((o) => mode === "OT" || !o.ot);
          return (
            <div key={`${l.kind}-${i}`} className="rounded-xl bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} title="Remove" className="rounded p-1 text-gray-400 hover:bg-white hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">Hours</span>
                  <HoursInput value={l.hours} onChange={(h) => update(i, { hours: h })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">{mode === "FINE" ? "Fine amount" : "Overtime amount"}</span>
                  <Select value={l.rateType} onChange={(v) => update(i, { rateType: v as RateType })} options={options} />
                </label>
                {(l.rateType === "FIXED" || l.rateType === "PER_HOUR") ? (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-gray-500">{l.rateType === "FIXED" ? "₹ amount" : "₹ per hour"}</span>
                    <input type="number" min={0} value={l.value} onChange={(e) => update(i, { value: Number(e.target.value) })} className="input w-full" />
                  </label>
                ) : (
                  <div className="flex items-end pb-2 text-xs text-gray-500">{inr(hourly ?? 0)} / HR</div>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500">Amount: <span className="font-medium text-gray-800">{inr(amounts[i])}</span></div>
            </div>
          );
        })}
        {unused.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {unused.map((k) => (
              <button
                key={k.kind}
                onClick={() => setLines((ls) => [...ls, { kind: k.kind, hours: 0, rateType: "X1", value: 0 }])}
                className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                <Plus size={12} /> {k.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg bg-white px-1 pt-1">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
            Notify staff (in-app)
          </label>
          <div className="text-sm">
            Total Amount <span className="ml-1 text-base font-semibold text-gray-900">{inr(total)}</span>
          </div>
        </div>
      </div>
      <Footer saving={saving} error={error} onCancel={onClose} onSave={submit} label={mode === "FINE" ? "Apply Fine" : "Apply Overtime"} />
    </Modal>
  );
}

function NoteDialog({ target, onClose, onSaved }: { target: DayActionTarget; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [text, setText] = useState(target.row?.note ?? "");
  const { saving, error, save } = useSave(target, onSaved, onClose);
  return (
    <Modal onClose={onClose}>
      <Header title="Note" target={target} />
      <div className="px-5 py-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={500} placeholder="e.g. came late — bus strike" className="input w-full resize-none" />
        <div className="mt-1 text-right text-[11px] text-gray-400">{text.length} / 500</div>
      </div>
      <Footer saving={saving} error={error} onCancel={onClose} onSave={() => save({ note: text.trim() })} />
    </Modal>
  );
}

function LogsDialog({ target, onClose }: { target: DayActionTarget; onClose: () => void }) {
  const [logs, setLogs] = useState<AttendanceLogApi[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getAttendanceLogs(target.userId, target.date)
      .then(setLogs)
      .catch((err) => { setError(err instanceof ApiError ? err.message : "Unable to load logs."); setLogs([]); });
  }, [target.userId, target.date]);
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <Header title="Logs" target={target} />
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {logs === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Spinner size={14} /> Loading…</div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">No changes recorded for this day.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-gray-200 pl-4">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-accent" />
                <div className="text-sm font-medium text-gray-800">{l.action}</div>
                <div className="text-[11px] text-gray-500">
                  By {l.actorName ?? "system"}{l.at ? ` on ${formatDateTimeIST(l.at)}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex justify-end border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Done</button>
      </div>
    </Modal>
  );
}
