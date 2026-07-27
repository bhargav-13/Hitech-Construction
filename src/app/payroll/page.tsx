"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { MyPayrollHome } from "@/components/payroll/self/MyPayrollHome";
import { DatePicker } from "@/components/DatePicker";
import { usePayrollStore, getAttendance, usePayrollAccess } from "@/lib/payrollApi";
import { ATTENDANCE_META, DEPARTMENTS } from "@/lib/payrollConfig";
import type { AttendanceCode } from "@/lib/payrollConfig";
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock,
  LogIn,
  LogOut,
  Plane,
  TimerReset,
  TriangleAlert,
  UserMinus,
} from "lucide-react";

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Most recent working day (skip Sundays) so the dashboard lands on a populated day, not a week-off. */
function latestWorkingDay(): string {
  const d = new Date();
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return iso(d);
}

/** The Payroll landing routes by access: HR admins get the full attendance dashboard, everyone
 * else (project managers, team members, workers) gets their own self-service payroll home. */
export default function PayrollLanding() {
  const { isAdmin } = usePayrollAccess();
  return isAdmin ? <AdminAttendanceDashboard /> : <MyPayrollHome />;
}

/** Attendance Dashboard — the day's staff attendance at a glance, by department and per employee. */
function AdminAttendanceDashboard() {
  const employees = usePayrollStore((s) => s.employees);
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const [date, setDate] = useState(latestWorkingDay);

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);

  const rows = useMemo(
    () => active.map((e) => ({ emp: e, att: getAttendance(overrides, e, date) })),
    [active, overrides, date]
  );

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, notMarked: 0, weekOff: 0, punchedIn: 0, punchedOut: 0, overtime: 0, fine: 0 };
    for (const { att } of rows) {
      if (att.code === "P") t.present++;
      else if (att.code === "A") t.absent++;
      else if (att.code === "HD") t.halfDay++;
      else if (att.code === "PL") t.paidLeave++;
      else if (att.code === "NM") t.notMarked++;
      else if (att.code === "WO") t.weekOff++;
      if (att.inTime) t.punchedIn++;
      if (att.outTime) t.punchedOut++;
      t.overtime += att.overtimeHours;
      t.fine += att.fineHours;
    }
    return t;
  }, [rows]);

  const deactivated = employees.length - active.length;

  const byDept = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
      const deptRows = rows.filter((r) => r.emp.department === dept);
      const c = { dept, count: deptRows.length, P: 0, A: 0, NM: 0, HD: 0, OT: 0, F: 0, L: 0 };
      for (const { att } of deptRows) {
        if (att.code === "P") c.P++;
        else if (att.code === "A") c.A++;
        else if (att.code === "NM") c.NM++;
        else if (att.code === "HD") c.HD++;
        else if (att.code === "PL") c.L++;
        c.OT += att.overtimeHours;
        c.F += att.fineHours;
      }
      return c;
    }).filter((c) => c.count > 0);
  }, [rows]);

  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const detailRows = deptFilter ? rows.filter((r) => r.emp.department === deptFilter) : rows;

  return (
    <PayrollShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Attendance Dashboard</h2>
            <p className="mt-0.5 text-sm text-gray-500">Daily attendance overview for the selected date.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <DatePicker value={date} onChange={setDate} placeholder="Select date" />
            </div>
            <Link
              href="/payroll/attendance"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <CalendarDays size={15} /> Mark Attendance
            </Link>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Present" value={totals.present} accent="green" icon={CircleCheck} />
          <StatCard label="Absent" value={totals.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={totals.halfDay} accent="amber" icon={Clock} />
          <StatCard label="On Leave" value={totals.paidLeave} accent="blue" icon={Plane} />
          <StatCard label="Not Marked" value={totals.notMarked} accent="gray" icon={TimerReset} />
          <StatCard label="Punched In" value={totals.punchedIn} accent="cyan" icon={LogIn} />
          <StatCard label="Punched Out" value={totals.punchedOut} accent="cyan" icon={LogOut} />
          <StatCard label="Overtime Hrs" value={totals.overtime} accent="green" icon={TimerReset} />
          <StatCard label="Fine Hrs" value={totals.fine} accent="rose" icon={TriangleAlert} />
          <StatCard label="Deactivated" value={deactivated} accent="gray" icon={UserMinus} />
        </div>

        {/* Department-wise attendance */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">Department-wise Attendance</h3>
            {deptFilter && (
              <button onClick={() => setDeptFilter(null)} className="text-xs font-medium text-brand-accent hover:underline">
                Clear filter · {deptFilter}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <Th>P</Th>
                  <Th>A</Th>
                  <Th>NM</Th>
                  <Th>HD</Th>
                  <Th>OT</Th>
                  <Th>F</Th>
                  <Th>L</Th>
                </tr>
              </thead>
              <tbody>
                {byDept.map((c) => (
                  <tr
                    key={c.dept}
                    onClick={() => setDeptFilter(c.dept === deptFilter ? null : c.dept)}
                    className={`cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 hover:bg-cyan-50/40 ${
                      deptFilter === c.dept ? "bg-cyan-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-700">{c.dept}</td>
                    <Td className="text-emerald-600">{c.P}</Td>
                    <Td className="text-rose-600">{c.A}</Td>
                    <Td className="text-gray-400">{c.NM}</Td>
                    <Td className="text-amber-600">{c.HD}</Td>
                    <Td>{c.OT}</Td>
                    <Td className="text-rose-500">{c.F}</Td>
                    <Td className="text-blue-600">{c.L}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily attendance view */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Daily Attendance {deptFilter && <span className="text-gray-400">· {deptFilter}</span>}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Attendance</th>
                  <th className="px-4 py-2 font-medium">In Time</th>
                  <th className="px-4 py-2 font-medium">Out Time</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map(({ emp, att }) => (
                  <tr key={emp.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{emp.name}</div>
                      <div className="text-xs text-gray-400">{emp.staffId} · {emp.designation}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{emp.department}</td>
                    <td className="px-4 py-2.5"><AttBadge code={att.code} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{att.inTime ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{att.outTime ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-center font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-center font-medium ${className}`}>{children}</td>;
}

export function AttBadge({ code }: { code: AttendanceCode }) {
  const m = ATTENDANCE_META[code];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${m.className}`}>{m.label}</span>;
}
