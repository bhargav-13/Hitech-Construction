"use client";

import { useMemo, useState } from "react";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { usePayrollStore, getAttendance, daysInMonth, monthlySummary } from "@/lib/payrollApi";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Attendance Muster Roll — a monthly attendance register with per-day cells and monthly totals. */
export default function MusterRollPage() {
  const employees = usePayrollStore((s) => s.employees);
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);
  const dates = useMemo(() => daysInMonth(year, month), [year, month]);

  const step = (dir: 1 | -1) => {
    let m = month + dir;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };

  const summaries = useMemo(
    () => active.map((emp) => ({ emp, s: monthlySummary(overrides, emp, dates) })),
    [active, overrides, dates]
  );

  const exportHead = ["Staff", "Staff ID", "Present", "Absent", "Half Day", "Paid Leave", "Unmarked", "Overtime", "Fine", "Payable Days"];
  const exportRows = summaries.map(({ emp, s }) => [
    emp.name, emp.staffId, s.present, s.absent, s.halfDay, s.paidLeave, s.unmarked, s.overtime, s.fine, s.payableDays,
  ]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Attendance Muster Roll</h2>
            <p className="mt-0.5 text-sm text-gray-500">Monthly attendance register for {MONTHS[month]} {year}.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 bg-white">
              <button onClick={() => step(-1)} className="p-2 text-gray-500 transition-colors hover:text-brand-accent"><ChevronLeft size={16} /></button>
              <span className="min-w-[96px] px-2 text-center text-sm font-medium text-gray-700">{MONTHS[month]} {year}</span>
              <button onClick={() => step(1)} className="p-2 text-gray-500 transition-colors hover:text-brand-accent"><ChevronRight size={16} /></button>
            </div>
            <button
              onClick={() => exportRowsToCsv(`muster-${MONTHS[month]}-${year}`, exportHead, exportRows)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <button
              onClick={() => downloadPdf(`Muster Roll — ${MONTHS[month]} ${year}`, exportHead, exportRows, { landscape: true, rightAlignFrom: 2 })}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {(Object.keys(ATTENDANCE_META) as (keyof typeof ATTENDANCE_META)[]).map((k) => (
            <span key={k} className={`rounded px-1.5 py-0.5 font-medium ${ATTENDANCE_META[k].className}`}>
              {ATTENDANCE_META[k].short} · {ATTENDANCE_META[k].label}
            </span>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                <th className="sticky left-0 z-10 min-w-[180px] bg-gray-50 px-3 py-2 text-left font-medium">Staff Name</th>
                {dates.map((d) => {
                  const day = Number(d.slice(8));
                  const dow = new Date(d + "T00:00:00").getDay();
                  return (
                    <th key={d} className={`w-8 px-0 py-2 text-center font-medium ${dow === 0 ? "text-rose-400" : ""}`}>{day}</th>
                  );
                })}
                <th className="px-3 py-2 text-center font-medium">P</th>
                <th className="px-3 py-2 text-center font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ emp, s }) => (
                <tr key={emp.id} className="border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/30">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 hover:bg-cyan-50/30">
                    <div className="font-medium text-gray-800">{emp.name}</div>
                    <div className="text-[10px] text-gray-400">{emp.staffId}</div>
                  </td>
                  {dates.map((d) => {
                    const e = getAttendance(overrides, emp, d);
                    const m = ATTENDANCE_META[e.code];
                    return (
                      <td key={d} className="px-0 py-1.5 text-center">
                        <span className={`inline-block w-6 rounded text-[9px] font-semibold ${m.className}`}>{m.short}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center font-semibold text-emerald-600">{s.present}</td>
                  <td className="px-3 py-1.5 text-center font-semibold text-gray-800">{s.payableDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Monthly totals */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Staff Name</th>
                <th className="px-4 py-2 text-center font-medium">Present</th>
                <th className="px-4 py-2 text-center font-medium">Absent</th>
                <th className="px-4 py-2 text-center font-medium">Half Day</th>
                <th className="px-4 py-2 text-center font-medium">Paid Leave</th>
                <th className="px-4 py-2 text-center font-medium">Unmarked</th>
                <th className="px-4 py-2 text-center font-medium">Overtime</th>
                <th className="px-4 py-2 text-center font-medium">Fine</th>
                <th className="px-4 py-2 text-center font-medium">Payable</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ emp, s }) => (
                <tr key={emp.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{emp.name}</td>
                  <td className="px-4 py-2.5 text-center text-emerald-600">{s.present}</td>
                  <td className="px-4 py-2.5 text-center text-rose-600">{s.absent}</td>
                  <td className="px-4 py-2.5 text-center text-amber-600">{s.halfDay}</td>
                  <td className="px-4 py-2.5 text-center text-blue-600">{s.paidLeave}</td>
                  <td className="px-4 py-2.5 text-center text-gray-400">{s.unmarked}</td>
                  <td className="px-4 py-2.5 text-center">{s.overtime}</td>
                  <td className="px-4 py-2.5 text-center text-rose-500">{s.fine}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-gray-800">{s.payableDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PayrollShell>
  );
}
