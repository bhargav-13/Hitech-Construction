"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useMuster } from "@/lib/usePayrollLive";
import { editAttendance, getUsers, ApiError } from "@/lib/api";
import type { AttendanceApiResponse, AttendanceCodeApi, UserResponse } from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, Plane, Users,
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
 */
export default function MemberAttendancePage() {
  const params = useParams();
  const userId = Number(params.id);

  const [member, setMember] = useState<UserResponse | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
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

  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const from = `${year}-${pad(monthIdx + 1)}-01`;
  const to = `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`;
  const { rows, loading, refresh } = useMuster(from, to);

  const byDate = useMemo(() => {
    const m = new Map<string, AttendanceApiResponse>();
    for (const r of rows) if (r.userId === userId) m.set(r.date, r);
    return m;
  }, [rows, userId]);

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
                return (
                  <button
                    key={dateIso}
                    onClick={() => setSelected(dateIso)}
                    title={att ? meta.label : "Not marked"}
                    className={`flex min-h-[58px] flex-col items-start justify-between rounded-xl p-2 text-left transition-all hover:ring-2 hover:ring-brand-accent/40 ${isSel ? "ring-2 ring-brand-accent ring-offset-1" : ""} ${att ? meta.className : "bg-gray-50 text-gray-500"}`}
                  >
                    <span className="text-sm font-semibold leading-none">{day}</span>
                    {att && <span className="text-[10px] font-medium leading-none">{meta.label}</span>}
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
              </div>
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
