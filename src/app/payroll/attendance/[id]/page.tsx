"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useMuster } from "@/lib/usePayrollLive";
import { editAttendance, getPayrollProfile, getUsers, ApiError } from "@/lib/api";
import type { AttendanceApiResponse, AttendanceCodeApi, HolidayResponse, UserResponse } from "@/lib/api";
import { useHolidayPolicies } from "@/lib/usePayrollSetup";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, PartyPopper, Plane, Users,
} from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MARK_CODES: AttendanceCodeApi[] = ["P", "A", "HD", "PL", "WO"];
const pad = (n: number) => String(n).padStart(2, "0");

interface Stats {
  present: number; absent: number; halfDay: number; paidLeave: number;
  weekOff: number; unmarked: number; overtime: number; payableDays: number;
}
function summarize(rows: AttendanceApiResponse[]): Stats {
  const s: Stats = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, weekOff: 0, unmarked: 0, overtime: 0, payableDays: 0 };
  for (const r of rows) {
    s.overtime += Number(r.overtimeHours ?? 0);
    switch (r.code) {
      case "P": s.present++; s.payableDays += 1; break;
      case "HD": s.halfDay++; s.payableDays += 0.5; break;
      case "PL": s.paidLeave++; s.payableDays += 1; break;
      case "WO": s.weekOff++; s.payableDays += 1; break;
      case "A": s.absent++; break;
      case "NM": s.unmarked++; break;
    }
  }
  return s;
}

/**
 * One member's attendance for a month — a full calendar (colour-coded by status) plus a small
 * analysis panel. Each date is clickable to mark it; the month can be stepped independently.
 * Admin-only (edits others' attendance). Reached by clicking a member on the Attendance page.
 *
 * The holidays on it are **this person's**, not the firm's. Holiday policies are assigned per member
 * on their payroll profile, and site labour on one policy and office staff on another genuinely have
 * different days off — so marking someone absent on a day their own policy calls a holiday was a
 * mistake nothing on screen prevented.
 */
export default function MemberAttendancePage() {
  const params = useParams();
  const userId = Number(params.id);

  const [member, setMember] = useState<UserResponse | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [holidayPolicyId, setHolidayPolicyId] = useState<number | null>(null);
  const { holidayPolicies } = useHolidayPolicies();
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getUsers(0, 500)
      .then((r) => setMember(r.content.find((u) => u.id === userId) ?? null))
      .catch(() => setMember(null))
      .finally(() => setMemberLoading(false));
  }, [userId]);

  useEffect(() => {
    // Nobody has a payroll profile until one is filled in; no profile simply means no holidays to
    // show, which is the truth rather than an error worth surfacing on an attendance screen.
    getPayrollProfile(userId)
      .then((p) => setHolidayPolicyId(p.holidayPolicyId))
      .catch(() => setHolidayPolicyId(null));
  }, [userId]);

  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const from = `${year}-${pad(monthIdx + 1)}-01`;
  const to = `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`;
  const { rows, loading, refresh } = useMuster(from, to);

  const byDate = useMemo(() => {
    const m = new Map<string, AttendanceApiResponse>();
    for (const r of rows) if (r.userId === userId) m.set(r.date, r);
    return m;
  }, [rows, userId]);

  /**
   * The policy whose holidays apply to the month on screen.
   *
   * A policy covers one year, so stepping from December into January leaves the assigned one behind.
   * When that happens we look for the successor by name ("India Public Holidays 2026" →
   * "…2027") rather than showing last year's dates or nothing at all.
   */
  const policy = useMemo(() => {
    const assigned = holidayPolicies.find((p) => p.id === holidayPolicyId);
    if (!assigned) return null;
    if (assigned.year === year) return assigned;
    return holidayPolicies.find((p) => p.year === year && p.name === assigned.name) ?? null;
  }, [holidayPolicies, holidayPolicyId, year]);

  /** This month's holidays, by date, so a calendar cell can be labelled in one lookup. */
  const holidayByDate = useMemo(() => {
    const m = new Map<string, HolidayResponse>();
    const prefix = `${year}-${pad(monthIdx + 1)}-`;
    for (const h of policy?.holidays ?? []) if (h.date.startsWith(prefix)) m.set(h.date, h);
    return m;
  }, [policy, year, monthIdx]);

  const monthHolidays = useMemo(
    () => [...holidayByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    [holidayByDate],
  );

  const stats = useMemo(() => summarize([...byDate.values()]), [byDate]);
  const workingDays = stats.present + stats.absent + stats.halfDay + stats.paidLeave;
  const rate = workingDays > 0 ? Math.round(((stats.present + stats.halfDay * 0.5 + stats.paidLeave) / workingDays) * 100) : 0;

  const firstWeekday = new Date(year, monthIdx, 1).getDay();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  const step = (dir: 1 | -1) => {
    let m = monthIdx + dir;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIdx(m);
    setYear(y);
    setSelected(null);
  };

  async function markDay(dateIso: string, code: AttendanceCodeApi) {
    setSaving(true);
    setError("");
    try {
      await editAttendance({
        userId,
        date: dateIso,
        code,
        inTime: code === "P" ? "09:00" : null,
        outTime: code === "P" ? "18:00" : null,
        overtimeHours: 0,
        fineHours: 0,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save this change.");
    } finally {
      setSaving(false);
    }
  }

  if (memberLoading) {
    return (
      <PayrollShell requireAdmin>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </PayrollShell>
    );
  }

  if (!member) {
    return (
      <PayrollShell requireAdmin>
        <PayrollEmpty icon={Users} title="Member not found" hint="They may have been removed or taken off payroll." />
        <div className="mt-4">
          <Link href="/payroll/attendance" className="text-sm font-medium text-brand-accent hover:underline">Back to Attendance</Link>
        </div>
      </PayrollShell>
    );
  }

  const initials = member.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-5">
        <Link href="/payroll/attendance" className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-brand-accent">
          <ArrowLeft size={15} /> Back to Attendance
        </Link>

        {/* Member header + month switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-base font-semibold text-brand-accent">{initials}</div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{member.fullName}</h2>
              <p className="text-sm text-gray-500">{member.departmentName ?? "—"} · Attendance</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button onClick={() => step(-1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <span className="min-w-[140px] px-2 text-center text-sm font-semibold text-gray-700">{MONTHS[monthIdx]} {year}</span>
            <button onClick={() => step(1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={16} /></button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Analysis */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Attendance" value={`${rate}%`} accent="cyan" icon={CalendarDays} />
          <StatCard label="Present" value={stats.present} accent="green" icon={CircleCheck} />
          <StatCard label="Absent" value={stats.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={stats.halfDay} accent="amber" icon={Clock} />
          <StatCard label="Paid Leave" value={stats.paidLeave} accent="blue" icon={Plane} />
          <StatCard label="Payable Days" value={stats.payableDays} accent="green" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Calendar */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-gray-400">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className={`mt-1.5 grid grid-cols-7 gap-1.5 ${loading ? "opacity-50" : ""}`}>
              {cells.map((day, i) => {
                if (day === null) return <div key={`b${i}`} />;
                const dateIso = `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
                const att = byDate.get(dateIso);
                const meta = ATTENDANCE_META[att?.code ?? "NM"];
                const isSel = selected === dateIso;
                const holiday = holidayByDate.get(dateIso);
                // A holiday tints only an unmarked day. Once attendance is recorded that is the
                // fact — someone did work the holiday, and hiding it behind a violet cell would be
                // the calendar arguing with the muster.
                const holidayTint = holiday && !att ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200" : "";
                return (
                  <button
                    key={dateIso}
                    onClick={() => setSelected(dateIso)}
                    title={[holiday ? `${holiday.name}${holiday.type === "OPTIONAL" ? " (optional)" : ""}` : null, att ? meta.label : "Not marked"]
                      .filter(Boolean)
                      .join(" · ")}
                    className={`flex min-h-[58px] flex-col items-start justify-between gap-0.5 rounded-xl p-2 text-left transition-all hover:ring-2 hover:ring-brand-accent/40 ${isSel ? "ring-2 ring-brand-accent ring-offset-1" : ""} ${att ? meta.className : holidayTint || "bg-gray-50 text-gray-500"}`}
                  >
                    <span className="flex w-full items-start justify-between gap-1 text-sm leading-none font-semibold">
                      {day}
                      {holiday && <PartyPopper size={11} className="mt-0.5 shrink-0 text-violet-500" />}
                    </span>
                    {att && <span className="text-[10px] leading-none font-medium">{meta.label}</span>}
                    {holiday && (
                      <span className="line-clamp-2 text-[10px] leading-tight font-medium text-violet-600">
                        {holiday.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend + mark panel */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Legend</h3>
              <div className="grid grid-cols-2 gap-2">
                {(["P", "A", "HD", "PL", "WO", "NM"] as const).map((c) => (
                  <div key={c} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className={`inline-block h-4 w-4 rounded ${ATTENDANCE_META[c].className}`} />
                    {ATTENDANCE_META[c].label}
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="inline-block h-4 w-4 rounded bg-violet-50 ring-1 ring-violet-200" />
                  Holiday
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800">Holidays</h3>
              <p className="mt-0.5 mb-3 text-xs text-gray-400">
                {policy ? policy.name : holidayPolicyId ? "No policy covers this year" : "No holiday policy assigned"}
              </p>
              {monthHolidays.length === 0 ? (
                <p className="text-xs text-gray-400">None in {MONTHS[monthIdx]}.</p>
              ) : (
                <ul className="space-y-2">
                  {monthHolidays.map((h) => (
                    <li key={h.date} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-8 shrink-0 items-center justify-center rounded bg-violet-50 text-[10px] font-semibold text-violet-700">
                        {Number(h.date.slice(8, 10))}
                      </span>
                      <span className="min-w-0 text-xs text-gray-700">
                        {h.name}
                        {h.type === "OPTIONAL" && <span className="ml-1 text-gray-400">(optional)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-gray-800">Mark a day</h3>
              {selected ? (
                <>
                  <p className="mb-3 text-xs text-gray-500">{selected}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MARK_CODES.map((c) => (
                      <button
                        key={c}
                        disabled={saving}
                        onClick={() => markDay(selected, c)}
                        className={`rounded-lg px-2 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${ATTENDANCE_META[c].className}`}
                      >
                        {ATTENDANCE_META[c].label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400">Click a date on the calendar to mark it.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}
