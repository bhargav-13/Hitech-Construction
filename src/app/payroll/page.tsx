"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { MyPayrollHome } from "@/components/payroll/self/MyPayrollHome";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { usePayrollAccess } from "@/lib/payrollApi";
import { useMuster } from "@/lib/usePayrollLive";
import { getTeam } from "@/lib/api";
import type { TeamMemberResponse } from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
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

// Local calendar date (not UTC) so keys match muster / punch.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Payroll landing routes by access: HR admins get the full attendance dashboard, everyone
 * else (project managers, team members, workers) gets their own self-service payroll home. */
export default function PayrollLanding() {
  const { isAdmin } = usePayrollAccess();
  return isAdmin ? <AdminAttendanceDashboard /> : <MyPayrollHome />;
}

/** Attendance Dashboard — the day's staff attendance at a glance, by department and per member. Real backend data. */
function AdminAttendanceDashboard() {
  const [date, setDate] = useState(iso(new Date()));
  const [team, setTeam] = useState<TeamMemberResponse[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const { rows, loading: musterLoading, error } = useMuster(date, date);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeam();
        if (!cancelled) setTeam(res);
      } catch {
        if (!cancelled) setTeam([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = useMemo(() => team.filter((u) => u.active), [team]);
  const deactivated = team.length - active.length;

  // Join the day's real attendance rows onto the active roster so unmarked members show as NM.
  const rowByUser = useMemo(() => {
    const m = new Map<number, typeof rows[number]>();
    for (const r of rows) m.set(r.userId, r);
    return m;
  }, [rows]);

  const detailRows = useMemo(
    () => active.map((u) => ({ user: u, att: rowByUser.get(u.id) ?? null })),
    [active, rowByUser]
  );

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, notMarked: 0, weekOff: 0, punchedIn: 0, punchedOut: 0, overtime: 0, fine: 0 };
    for (const { att } of detailRows) {
      const code = att?.code ?? "NM";
      if (code === "P") t.present++;
      else if (code === "A") t.absent++;
      else if (code === "HD") t.halfDay++;
      else if (code === "PL") t.paidLeave++;
      else if (code === "WO") t.weekOff++;
      else t.notMarked++;
      if (att?.inTime) t.punchedIn++;
      if (att?.outTime) t.punchedOut++;
      t.overtime += Number(att?.overtimeHours ?? 0);
      t.fine += Number(att?.fineHours ?? 0);
    }
    return t;
  }, [detailRows]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const u of active) set.add(u.departmentName ?? "Unassigned");
    return Array.from(set).sort();
  }, [active]);

  const byDept = useMemo(() => {
    return departments.map((dept) => {
      const deptRows = detailRows.filter((r) => (r.user.departmentName ?? "Unassigned") === dept);
      const c = { dept, count: deptRows.length, P: 0, A: 0, NM: 0, HD: 0, OT: 0, F: 0, L: 0 };
      for (const { att } of deptRows) {
        const code = att?.code ?? "NM";
        if (code === "P") c.P++;
        else if (code === "A") c.A++;
        else if (code === "HD") c.HD++;
        else if (code === "PL") c.L++;
        else if (code !== "WO") c.NM++;
        c.OT += Number(att?.overtimeHours ?? 0);
        c.F += Number(att?.fineHours ?? 0);
      }
      return c;
    }).filter((c) => c.count > 0);
  }, [departments, detailRows]);

  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const shownRows = deptFilter ? detailRows.filter((r) => (r.user.departmentName ?? "Unassigned") === deptFilter) : detailRows;

  const loading = teamLoading || musterLoading;

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

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

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

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <>
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
                    {byDept.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">No members on payroll yet.</td></tr>
                    ) : byDept.map((c) => (
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
                    {shownRows.map(({ user, att }) => (
                      <tr key={user.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800">{user.fullName}</div>
                          <div className="text-xs text-gray-400">{user.roleName}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{user.departmentName ?? "—"}</td>
                        <td className="px-4 py-2.5"><AttBadge code={(att?.code ?? "NM") as AttendanceCode} /></td>
                        <td className="px-4 py-2.5 text-gray-600">{att?.inTime ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{att?.outTime ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
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
