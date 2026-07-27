"use client";

import { useMemo, useState } from "react";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { usePayrollStore, useMyEmployee, getAttendance, daysInMonth, monthlySummary } from "@/lib/payrollApi";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, Plane, UserRound } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** My Attendance — the signed-in employee's own monthly attendance calendar and totals. */
export default function MyAttendancePage() {
  const me = useMyEmployee();
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const dates = useMemo(() => daysInMonth(year, month), [year, month]);

  const step = (dir: 1 | -1) => {
    let m = month + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const summary = useMemo(() => (me ? monthlySummary(overrides, me, dates) : null), [me, overrides, dates]);

  if (!me || !summary) {
    return <PayrollShell><PayrollEmpty icon={UserRound} title="Your staff profile isn't linked yet" hint="Ask HR to add you as a staff member so your attendance shows here." /></PayrollShell>;
  }

  const firstDow = new Date(year, month, 1).getDay();
  const leadingBlanks = Array.from({ length: firstDow });

  return (
    <PayrollShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Attendance</h2>
            <p className="mt-0.5 text-sm text-gray-500">{me.name} · {me.staffId}</p>
          </div>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white">
            <button onClick={() => step(-1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronLeft size={16} /></button>
            <span className="min-w-[96px] px-2 text-center text-sm font-medium text-gray-700">{MONTHS[month]} {year}</span>
            <button onClick={() => step(1)} className="p-2 text-gray-500 hover:text-brand-accent"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Present" value={summary.present} accent="green" icon={CircleCheck} />
          <StatCard label="Absent" value={summary.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={summary.halfDay} accent="amber" icon={Clock} />
          <StatCard label="Paid Leave" value={summary.paidLeave} accent="blue" icon={Plane} />
        </div>

        {/* Calendar */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-gray-400">
            {DOW.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {leadingBlanks.map((_, i) => <div key={`b${i}`} />)}
            {dates.map((d) => {
              const day = Number(d.slice(8));
              const e = getAttendance(overrides, me, d);
              const m = ATTENDANCE_META[e.code];
              return (
                <div key={d} className={`flex flex-col items-center rounded-lg border border-gray-100 p-1.5 ${m.className}`}>
                  <span className="text-[11px] font-semibold opacity-80">{day}</span>
                  <span className="text-[10px] font-bold">{m.short}</span>
                  {e.inTime && <span className="text-[8px] opacity-70">{e.inTime}</span>}
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

        <div className="rounded-lg bg-gray-50/70 px-4 py-2.5 text-sm text-gray-500">
          Payable days this month: <span className="font-semibold text-gray-800">{summary.payableDays}</span> · Overtime{" "}
          <span className="font-medium text-emerald-600">{summary.overtime} hrs</span> · Fine{" "}
          <span className="font-medium text-rose-600">{summary.fine} hrs</span>
        </div>
      </div>
    </PayrollShell>
  );
}
