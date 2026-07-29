"use client";

import { useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { useAuthStore } from "@/lib/authStore";
import { useMemberAttendance } from "@/lib/usePayrollLive";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, Plane, UserRound } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Summary {
  present: number;
  absent: number;
  halfDay: number;
  paidLeave: number;
  weekOff: number;
  unmarked: number;
  overtime: number;
  fine: number;
  payableDays: number;
}

/** My Attendance — self-service calendar view, reads real backend rows for the signed-in member. */
export default function MyAttendancePage() {
  const user = useAuthStore((s) => s.user);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${year}-${pad(month + 1)}-01`;
  const last = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${pad(month + 1)}-${pad(last)}`;

  const { rows, loading, error } = useMemberAttendance(user?.id ?? null, from, to);

  const step = (dir: 1 | -1) => {
    let m = month + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const byDate = useMemo(() => {
    const m = new Map<string, typeof rows[number]>();
    for (const r of rows) m.set(r.date, r);
    return m;
  }, [rows]);

  const dates = useMemo(() => Array.from({ length: last }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`), [year, month, last]);

  const summary: Summary = useMemo(() => {
    const s: Summary = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, weekOff: 0, unmarked: 0, overtime: 0, fine: 0, payableDays: 0 };
    for (const d of dates) {
      const r = byDate.get(d);
      s.overtime += Number(r?.overtimeHours ?? 0);
      s.fine += Number(r?.fineHours ?? 0);
      const code = r?.code ?? "NM";
      switch (code) {
        case "P": s.present++; s.payableDays += 1; break;
        case "HD": s.halfDay++; s.payableDays += 0.5; break;
        case "PL": s.paidLeave++; s.payableDays += 1; break;
        case "A": s.absent++; break;
        case "WO": s.weekOff++; s.payableDays += 1; break;
        case "NM": s.unmarked++; break;
      }
    }
    return s;
  }, [dates, byDate]);

  const firstDow = new Date(year, month, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDow });

  if (!user) {
    return <PayrollShell><PayrollEmpty icon={UserRound} title="Please sign in" hint="Log in to see your attendance." /></PayrollShell>;
  }

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Attendance</h2>
            <p className="mt-0.5 text-sm text-gray-500">{user.fullName}</p>
          </div>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white">
            <button onClick={() => step(-1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronLeft size={16} /></button>
            <span className="min-w-[96px] px-2 text-center text-sm font-medium text-gray-700">{MONTHS[month]} {year}</span>
            <button onClick={() => step(1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronRight size={16} /></button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Present" value={summary.present} accent="green" icon={CircleCheck} />
          <StatCard label="Absent" value={summary.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={summary.halfDay} accent="amber" icon={Clock} />
          <StatCard label="Paid Leave" value={summary.paidLeave} accent="blue" icon={Plane} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-gray-400">
              {DOW.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {leadingBlanks.map((_, i) => <div key={`b${i}`} />)}
              {dates.map((d) => {
                const day = Number(d.slice(8));
                const r = byDate.get(d);
                const code = r?.code ?? "NM";
                const m = ATTENDANCE_META[code];
                return (
                  <div key={d} className={`flex flex-col items-center rounded-lg border border-gray-100 p-1.5 ${m.className}`}>
                    <span className="text-[11px] font-semibold opacity-80">{day}</span>
                    <span className="text-[10px] font-bold">{m.short}</span>
                    {r?.inTime && <span className="text-[8px] opacity-70">{r.inTime}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3 text-[11px]">
              {(Object.keys(ATTENDANCE_META) as (keyof typeof ATTENDANCE_META)[]).map((k) => (
                <span key={k} className={`rounded px-1.5 py-0.5 font-medium ${ATTENDANCE_META[k].className}`}>{ATTENDANCE_META[k].short} · {ATTENDANCE_META[k].label}</span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-gray-50/70 px-4 py-2.5 text-sm text-gray-500">
          Payable days this month: <span className="font-semibold text-gray-800">{summary.payableDays}</span> · Overtime{" "}
          <span className="font-medium text-emerald-600">{summary.overtime.toFixed(1)} hrs</span> · Fine{" "}
          <span className="font-medium text-rose-600">{summary.fine.toFixed(1)} hrs</span>
        </div>
      </div>
    </PayrollShell>
  );
}
