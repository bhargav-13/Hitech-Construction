"use client";

import { useMemo, useState } from "react";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { usePayrollStore, getAttendance } from "@/lib/payrollApi";
import type { AttendanceEntry } from "@/lib/payrollApi";
import { ATTENDANCE_META, DEPARTMENTS } from "@/lib/payrollConfig";
import type { AttendanceCode } from "@/lib/payrollConfig";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import { CheckCheck, CircleCheck, CircleX, Clock, FileText, Plane, Search, Settings } from "lucide-react";
import Link from "next/link";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MARK_CODES: AttendanceCode[] = ["P", "A", "HD", "PL"];

/** Attendance page — mark each employee's status for a day, with in/out, overtime and fine. */
export default function AttendancePage() {
  const employees = usePayrollStore((s) => s.employees);
  const overrides = usePayrollStore((s) => s.attendanceOverrides);
  const setAttendance = usePayrollStore((s) => s.setAttendance);
  const [date, setDate] = useState(iso(new Date()));
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active
      .filter((e) => (dept === "all" || e.department === dept))
      .filter((e) => !q || [e.name, e.staffId].some((f) => f.toLowerCase().includes(q)))
      .map((e) => ({ emp: e, att: getAttendance(overrides, e, date) }));
  }, [active, overrides, date, search, dept]);

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, leave: 0, overtime: 0, fine: 0 };
    for (const { att } of rows) {
      if (att.code === "P") s.present++;
      else if (att.code === "A") s.absent++;
      else if (att.code === "HD") s.halfDay++;
      else if (att.code === "PL") s.leave++;
      s.overtime += att.overtimeHours;
      s.fine += att.fineHours;
    }
    return s;
  }, [rows]);

  const mark = (empId: string, patch: Partial<AttendanceEntry>) => {
    const emp = active.find((e) => e.id === empId)!;
    const cur = getAttendance(overrides, emp, date);
    const next = { ...cur, ...patch };
    // Auto-fill sensible in/out when switching to Present.
    if (patch.code === "P" && !next.inTime) { next.inTime = "09:00"; next.outTime = "18:00"; }
    if (patch.code === "A") { next.inTime = null; next.outTime = null; next.overtimeHours = 0; }
    setAttendance(empId, date, next);
  };

  const bulkMarkPresent = () => rows.forEach(({ emp }) => mark(emp.id, { code: "P" }));

  const head = ["Name", "Staff ID", "Department", "Status", "In", "Out", "OT", "Fine"];
  const data = rows.map(({ emp, att }) => [emp.name, emp.staffId, emp.department, ATTENDANCE_META[att.code].label, att.inTime ?? "", att.outTime ?? "", att.overtimeHours, att.fineHours]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Mark Attendance</h2>
            <p className="mt-0.5 text-sm text-gray-500">{rows.length} staff · {date}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40"><DatePicker value={date} onChange={setDate} placeholder="Date" /></div>
            <button onClick={bulkMarkPresent} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">
              <CheckCheck size={14} /> Mark all present
            </button>
            <button onClick={() => downloadPdf(`Attendance — ${date}`, head, data, { rightAlignFrom: 6 })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">
              <FileText size={14} /> Daily Report
            </button>
            <Link href="/payroll/attendance/settings" className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">
              <Settings size={14} /> Settings
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Staff" value={rows.length} accent="cyan" />
          <StatCard label="Present" value={summary.present} accent="green" icon={CircleCheck} />
          <StatCard label="Absent" value={summary.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={summary.halfDay} accent="amber" icon={Clock} />
          <StatCard label="On Leave" value={summary.leave} accent="blue" icon={Plane} />
          <StatCard label="Overtime Hrs" value={summary.overtime} accent="green" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44"><Select value={dept} onChange={setDept} options={[{ value: "all", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]} /></div>
          <button onClick={() => exportRowsToCsv(`attendance-${date}`, head, data)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95">Export</button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Mark</th>
                <th className="px-4 py-2 font-medium">In</th>
                <th className="px-4 py-2 font-medium">Out</th>
                <th className="px-4 py-2 font-medium">OT (hrs)</th>
                <th className="px-4 py-2 font-medium">Fine (hrs)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, att }) => (
                <tr key={emp.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.staffId} · {emp.department}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-200">
                      {MARK_CODES.map((code) => {
                        const on = att.code === code;
                        const m = ATTENDANCE_META[code];
                        return (
                          <button
                            key={code}
                            onClick={() => mark(emp.id, { code })}
                            title={m.label}
                            className={`px-2.5 py-1 text-xs font-semibold transition-colors ${on ? m.className : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            {m.short}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" value={att.inTime ?? ""} onChange={(e) => mark(emp.id, { inTime: e.target.value || null })} className="rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" value={att.outTime ?? ""} onChange={(e) => mark(emp.id, { outTime: e.target.value || null })} className="rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" value={att.overtimeHours} onChange={(e) => mark(emp.id, { overtimeHours: Number(e.target.value) })} className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" value={att.fineHours} onChange={(e) => mark(emp.id, { fineHours: Number(e.target.value) })} className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-xs outline-none focus:border-cyan-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PayrollShell>
  );
}
