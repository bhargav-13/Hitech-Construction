"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PayrollShell, StatCard } from "@/components/payroll/PayrollShell";
import { MyPayrollHome } from "@/components/payroll/self/MyPayrollHome";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { usePayrollAccess } from "@/lib/payrollApi";
import { useMuster } from "@/lib/usePayrollLive";
import { getTeam } from "@/lib/api";
import type { AttendanceApiResponse, TeamMemberResponse } from "@/lib/api";
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
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";

// Local calendar date (not UTC) so keys match muster / punch.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** Chart colours per attendance code, matching the pills used everywhere else in Payroll. */
const CODE_COLOR: Record<AttendanceCode, string> = {
  P: "#10b981",
  A: "#f43f5e",
  HD: "#f59e0b",
  PL: "#3b82f6",
  WO: "#94a3b8",
  NM: "#d1d5db",
};

/** The Payroll landing routes by access: HR admins get the full attendance dashboard, everyone
 * else (project managers, team members, workers) gets their own self-service payroll home. */
export default function PayrollLanding() {
  const { isAdmin } = usePayrollAccess();
  return isAdmin ? <AdminAttendanceDashboard /> : <MyPayrollHome />;
}

/**
 * Attendance Dashboard — the day in numbers, and the month behind it.
 *
 * <p>It used to be ten cards over a single day's muster, which answered "who is in today?" and
 * nothing else: no sense of whether attendance is trending down, which department is carrying the
 * absences, or who keeps forgetting to punch out. One month of muster is fetched (the same call the
 * old day view made, over a wider range), the selected day is a filter over it, and the rest of the
 * screen reads the month: a split donut, a daily trend, a department bar chart and three ranked
 * lists that name the people a payroll admin actually has to chase.
 */
function AdminAttendanceDashboard() {
  const [date, setDate] = useState(iso(new Date()));
  const [team, setTeam] = useState<TeamMemberResponse[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  // The whole month around the selected date — one request serves both the day cards and every
  // month-to-date figure below them.
  const [year, monthIdx] = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return [y, (m ?? 1) - 1];
  }, [date]);
  const monthFrom = `${year}-${pad(monthIdx + 1)}-01`;
  const monthTo = `${year}-${pad(monthIdx + 1)}-${pad(new Date(year, monthIdx + 1, 0).getDate())}`;
  const { rows, loading: musterLoading, error } = useMuster(monthFrom, monthTo);

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

  const dayRows = useMemo(() => rows.filter((r) => r.date === date), [rows, date]);

  // Join the day's real attendance rows onto the active roster so unmarked members show as NM.
  const rowByUser = useMemo(() => {
    const m = new Map<number, AttendanceApiResponse>();
    for (const r of dayRows) m.set(r.userId, r);
    return m;
  }, [dayRows]);

  const detailRows = useMemo(
    () => active.map((u) => ({ user: u, att: rowByUser.get(u.id) ?? null })),
    [active, rowByUser]
  );

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, notMarked: 0, weekOff: 0, punchedIn: 0, punchedOut: 0, overtime: 0, fine: 0, missedPunchOut: 0 };
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
      if (att?.inTime && !att.outTime) t.missedPunchOut++;
      t.overtime += Number(att?.overtimeHours ?? 0);
      t.fine += Number(att?.fineHours ?? 0);
    }
    return t;
  }, [detailRows]);

  /** The day's split, as a donut. Codes with nothing in them are dropped so the ring stays legible. */
  const daySplit = useMemo(
    () =>
      ([
        ["P", totals.present],
        ["A", totals.absent],
        ["HD", totals.halfDay],
        ["PL", totals.paidLeave],
        ["WO", totals.weekOff],
        ["NM", totals.notMarked],
      ] as [AttendanceCode, number][])
        .filter(([, v]) => v > 0)
        .map(([code, value]) => ({ code, name: ATTENDANCE_META[code].label, value })),
    [totals]
  );

  /** Every marked day this month, per member, so the ranked lists and month cards can be built. */
  const monthStats = useMemo(() => {
    const s = {
      present: 0, absent: 0, halfDay: 0, paidLeave: 0, weekOff: 0,
      overtime: 0, fine: 0, missedPunchOut: 0, markedDays: 0,
    };
    const byMember = new Map<number, { name: string; present: number; absent: number; halfDay: number; leave: number; overtime: number; fine: number; missedPunchOut: number }>();
    for (const r of rows) {
      const m = byMember.get(r.userId) ?? { name: r.memberName, present: 0, absent: 0, halfDay: 0, leave: 0, overtime: 0, fine: 0, missedPunchOut: 0 };
      switch (r.code) {
        case "P": s.present++; m.present++; break;
        case "A": s.absent++; m.absent++; break;
        case "HD": s.halfDay++; m.halfDay++; break;
        case "PL": s.paidLeave++; m.leave++; break;
        case "WO": s.weekOff++; break;
        default: break;
      }
      if (r.code !== "NM") s.markedDays++;
      const ot = Number(r.overtimeHours ?? 0);
      const fine = Number(r.fineHours ?? 0);
      s.overtime += ot; s.fine += fine;
      m.overtime += ot; m.fine += fine;
      if (r.inTime && !r.outTime) { s.missedPunchOut++; m.missedPunchOut++; }
      byMember.set(r.userId, m);
    }
    const people = Array.from(byMember.values());
    return {
      ...s,
      topAbsent: people.filter((p) => p.absent + p.halfDay > 0).sort((a, b) => b.absent + b.halfDay / 2 - (a.absent + a.halfDay / 2)).slice(0, 5),
      topOvertime: people.filter((p) => p.overtime > 0).sort((a, b) => b.overtime - a.overtime).slice(0, 5),
      topMissed: people.filter((p) => p.missedPunchOut > 0).sort((a, b) => b.missedPunchOut - a.missedPunchOut).slice(0, 5),
    };
  }, [rows]);

  /** Present / absent / half-day per calendar day — the month's shape at a glance. */
  const trend = useMemo(() => {
    const days = new Date(year, monthIdx + 1, 0).getDate();
    const buckets = new Map<string, { day: string; P: number; A: number; HD: number }>();
    for (let d = 1; d <= days; d++) {
      buckets.set(`${year}-${pad(monthIdx + 1)}-${pad(d)}`, { day: String(d), P: 0, A: 0, HD: 0 });
    }
    for (const r of rows) {
      const b = buckets.get(r.date);
      if (!b) continue;
      if (r.code === "P") b.P++;
      else if (r.code === "A") b.A++;
      else if (r.code === "HD") b.HD++;
    }
    return Array.from(buckets.values());
  }, [rows, year, monthIdx]);

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

  const loading = teamLoading || musterLoading;
  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  // A share of the roster, so "42 present" reads as "of 60".
  const attendanceRate = active.length > 0 ? Math.round(((totals.present + totals.halfDay * 0.5) / active.length) * 100) : 0;

  return (
    <PayrollShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Attendance Dashboard</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              The selected day at a glance, with {monthLabel} behind it.
            </p>
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

        {/* ---- The selected day ---- */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="On roll" value={active.length} accent="cyan" icon={Users} hint={deactivated > 0 ? `${deactivated} deactivated` : undefined} />
          <StatCard label="Present" value={totals.present} accent="green" icon={CircleCheck} hint={`${attendanceRate}% of roster`} />
          <StatCard label="Absent" value={totals.absent} accent="rose" icon={CircleX} />
          <StatCard label="Half Day" value={totals.halfDay} accent="amber" icon={Clock} />
          <StatCard label="On Leave" value={totals.paidLeave} accent="blue" icon={Plane} />
          <StatCard label="Not Marked" value={totals.notMarked} accent="gray" icon={TimerReset} hint="Needs marking" />
          <StatCard label="Punched In" value={totals.punchedIn} accent="cyan" icon={LogIn} />
          <StatCard label="Punched Out" value={totals.punchedOut} accent="cyan" icon={LogOut} />
          <StatCard label="Missed Punch-Out" value={totals.missedPunchOut} accent="amber" icon={TriangleAlert} hint="Counts as half a day" />
          <StatCard label="Week Off" value={totals.weekOff} accent="gray" />
          <StatCard label="Overtime Hrs" value={totals.overtime.toFixed(1)} accent="green" icon={TimerReset} />
          <StatCard label="Fine Hrs" value={totals.fine.toFixed(1)} accent="rose" icon={TriangleAlert} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : (
          <>
            {/* ---- Day split + month trend ---- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Panel title={`Split on ${date}`}>
                {daySplit.length === 0 ? (
                  <EmptyChart hint="Nothing marked for this day yet." />
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={daySplit} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="none">
                        {daySplit.map((d) => (
                          <Cell key={d.code} fill={CODE_COLOR[d.code]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Panel>

              <Panel title={`Daily trend · ${monthLabel}`} className="lg:col-span-2">
                {monthStats.markedDays === 0 ? (
                  <EmptyChart hint="No attendance marked this month yet." />
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => `Day ${d}`} />
                      <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="P" name="Present" stroke={CODE_COLOR.P} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="A" name="Absent" stroke={CODE_COLOR.A} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="HD" name="Half day" stroke={CODE_COLOR.HD} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            </div>

            {/* ---- Month to date ---- */}
            <Panel title={`${monthLabel} so far`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Mini label="Present days" value={monthStats.present} tone="text-emerald-600" />
                <Mini label="Absent days" value={monthStats.absent} tone="text-rose-600" />
                <Mini label="Half days" value={monthStats.halfDay} tone="text-amber-600" />
                <Mini label="Leave days" value={monthStats.paidLeave} tone="text-blue-600" />
                <Mini label="Week offs" value={monthStats.weekOff} tone="text-slate-500" />
                <Mini label="Overtime hrs" value={monthStats.overtime.toFixed(1)} tone="text-emerald-600" />
                <Mini label="Missed punch-outs" value={monthStats.missedPunchOut} tone="text-amber-600" />
              </div>
            </Panel>

            {/* ---- Department-wise (chart + table) ---- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title={`Department-wise · ${date}`}>
                {byDept.length === 0 ? (
                  <EmptyChart hint="No members on payroll yet." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, byDept.length * 38)}>
                    <BarChart data={byDept} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="dept" width={110} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f8fafc" }} />
                      <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="P" name="Present" stackId="a" fill={CODE_COLOR.P} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="HD" name="Half day" stackId="a" fill={CODE_COLOR.HD} />
                      <Bar dataKey="A" name="Absent" stackId="a" fill={CODE_COLOR.A} />
                      <Bar dataKey="NM" name="Not marked" stackId="a" fill={CODE_COLOR.NM} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-800">Department-wise Attendance</h3>
                  <Link href="/payroll/attendance" className="text-xs font-medium text-brand-accent hover:underline">
                    Open the muster →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
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
                        <tr key={c.dept} className="border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/40">
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
            </div>

            {/* ---- Who to chase ---- */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <RankList
                title="Most absent this month"
                icon={CircleX}
                empty="Nobody was marked absent."
                rows={monthStats.topAbsent.map((p) => ({
                  name: p.name,
                  value: `${p.absent}A${p.halfDay ? ` · ${p.halfDay}HD` : ""}`,
                  tone: "text-rose-600",
                }))}
              />
              <RankList
                title="Most overtime this month"
                icon={TrendingUp}
                empty="No overtime logged."
                rows={monthStats.topOvertime.map((p) => ({ name: p.name, value: `${p.overtime.toFixed(1)} hrs`, tone: "text-emerald-600" }))}
              />
              <RankList
                title="Missed punch-outs"
                icon={TriangleAlert}
                empty="Every punch pair is complete."
                rows={monthStats.topMissed.map((p) => ({ name: p.name, value: `${p.missedPunchOut} day${p.missedPunchOut === 1 ? "" : "s"}`, tone: "text-amber-600" }))}
              />
            </div>
          </>
        )}
      </div>
    </PayrollShell>
  );
}

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
} as const;

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ hint }: { hint: string }) {
  return <div className="flex h-[230px] items-center justify-center text-sm text-gray-400">{hint}</div>;
}

function Mini({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function RankList({
  title,
  icon: Icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  rows: { name: string; value: string; tone: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Icon size={14} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex items-center gap-2.5 px-4 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{r.name}</span>
              <span className={`shrink-0 text-sm font-semibold ${r.tone}`}>{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-center font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 text-center font-medium ${className}`}>{children}</td>;
}
