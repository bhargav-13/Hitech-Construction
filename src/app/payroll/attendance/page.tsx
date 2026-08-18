"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { useMuster } from "@/lib/usePayrollLive";
import { editAttendance, getUsers, ApiError } from "@/lib/api";
import type { AttendanceApiResponse, AttendanceCodeApi, UserResponse } from "@/lib/api";
import { ATTENDANCE_META, DEPARTMENTS } from "@/lib/payrollConfig";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { AlertTriangle,
  CalendarDays, CheckCheck, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, FileSpreadsheet, Plane, Search, Users,
} from "lucide-react";

const MARK_CODES: AttendanceCodeApi[] = ["P", "A", "HD", "PL"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type View = "DAY" | "MONTH";
const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Shift an ISO date (yyyy-MM-dd) by whole days — powers the day-view ‹ › arrows. */
const shiftIso = (iso: string, deltaDays: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + deltaDays);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/**
 * Attendance — one page, two views.
 *   • Day view: mark each on-payroll member for a single date (P/A/HD/PL, in/out, OT, fine).
 *   • Month view: muster roll — per-member totals for the picked month.
 * Both read from the same backend attendance table (payroll_attendance). Day-view edits go
 * through POST /attendance/edit. Muster is read-only.
 */
export default function AttendancePage() {
  const [view, setView] = useState<View>("DAY");
  const [date, setDate] = useState(todayIso());
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const router = useRouter();
  // Clicking a member opens their dedicated attendance calendar page.
  const openCalendar = (m: UserResponse) => router.push(`/payroll/attendance/${m.id}`);

  const range = useMemo(() => {
    if (view === "DAY") return { from: date, to: date, totalDays: 1 };
    const last = new Date(year, monthIdx + 1, 0).getDate();
    return { from: `${year}-${pad(monthIdx + 1)}-01`, to: `${year}-${pad(monthIdx + 1)}-${pad(last)}`, totalDays: last };
  }, [view, date, year, monthIdx]);

  // `ready` stays true through post-edit revalidations, so marking attendance keeps the table on
  // screen instead of flashing the full-page loader — that flicker is what made "Mark all present"
  // feel laggy. A genuine date/month switch flips it false and shows the loader again.
  const { rows, loading, ready: musterReady, error, refresh } = useMuster(range.from, range.to);

  useEffect(() => {
    getUsers(0, 200).then((r) => { setMembers(r.content.filter((u) => u.onPayroll)); setMembersLoading(false); }).catch(() => setMembersLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (dept !== "all" && (m.departmentName ?? "") !== dept) return false;
      if (!q) return true;
      return m.fullName.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, search, dept]);

  const stepMonth = (dir: 1 | -1) => {
    let m = monthIdx + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIdx(m); setYear(y);
  };

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Attendance</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {view === "DAY" ? `Mark ${filtered.length} member${filtered.length === 1 ? "" : "s"} for ${date}` : `Monthly muster for ${MONTHS[monthIdx]} ${year}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setView("DAY")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${view === "DAY" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <CalendarDays size={14} /> Day
              </button>
              <button
                onClick={() => setView("MONTH")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${view === "MONTH" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <Users size={14} /> Muster
              </button>
            </div>

            {view === "DAY" ? (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button onClick={() => setDate(shiftIso(date, -1))} title="Previous day" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
                <div className="w-36"><DatePicker value={date} onChange={setDate} placeholder="Date" /></div>
                <button onClick={() => setDate(shiftIso(date, 1))} title="Next day" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button onClick={() => stepMonth(-1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
                <span className="min-w-[110px] px-2 text-center text-sm font-semibold text-gray-700">{MONTHS[monthIdx]} {year}</span>
                <button onClick={() => stepMonth(1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
        </div>

        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Filters row (shared) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44"><Select value={dept} onChange={setDept} options={[{ value: "all", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]} /></div>
        </div>

        {(loading && !musterReady) || membersLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <PayrollEmpty icon={Users} title="No members on payroll match" hint="Add members in Settings and tick 'On payroll' to see them here." />
        ) : view === "DAY" ? (
          <DayView
            date={date}
            members={filtered}
            rows={rows}
            refresh={refresh}
            setActionError={setActionError}
            onOpenCalendar={openCalendar}
          />
        ) : (
          <MonthView
            members={filtered}
            rows={rows}
            totalDays={range.totalDays}
            monthKey={`${year}-${pad(monthIdx + 1)}`}
            onOpenCalendar={openCalendar}
          />
        )}
      </div>
    </PayrollShell>
  );
}

/** Day view — editable per member per row. */
function DayView({
  date,
  members,
  rows,
  refresh,
  setActionError,
  onOpenCalendar,
}: {
  date: string;
  members: UserResponse[];
  rows: AttendanceApiResponse[];
  refresh: () => Promise<void>;
  setActionError: (msg: string) => void;
  onOpenCalendar: (m: UserResponse) => void;
}) {
  const byUser = useMemo(() => {
    const m = new Map<number, AttendanceApiResponse>();
    for (const r of rows) m.set(r.userId, r);
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, leave: 0, overtime: 0, fine: 0 };
    for (const m of members) {
      const att = byUser.get(m.id);
      if (!att) continue;
      if (att.code === "P") s.present++;
      else if (att.code === "A") s.absent++;
      else if (att.code === "HD") s.halfDay++;
      else if (att.code === "PL") s.leave++;
      s.overtime += Number(att.overtimeHours ?? 0);
      s.fine += Number(att.fineHours ?? 0);
    }
    return s;
  }, [members, byUser]);

  type EditBody = {
    userId: number;
    date: string;
    code?: AttendanceCodeApi;
    inTime?: string | null;
    outTime?: string | null;
    overtimeHours?: number;
    fineHours?: number;
  };

  function buildBody(userId: number, patch: Partial<AttendanceApiResponse>): EditBody {
    const existing = byUser.get(userId);
    const body: EditBody = {
      userId,
      date,
      code: patch.code ?? existing?.code,
      inTime: patch.inTime !== undefined ? patch.inTime : existing?.inTime ?? null,
      outTime: patch.outTime !== undefined ? patch.outTime : existing?.outTime ?? null,
      overtimeHours: patch.overtimeHours !== undefined ? patch.overtimeHours : Number(existing?.overtimeHours ?? 0),
      fineHours: patch.fineHours !== undefined ? patch.fineHours : Number(existing?.fineHours ?? 0),
    };
    if (patch.code === "P" && !body.inTime) { body.inTime = "09:00"; body.outTime = "18:00"; }
    if (patch.code === "A") { body.inTime = null; body.outTime = null; body.overtimeHours = 0; }
    return body;
  }

  async function mark(userId: number, patch: Partial<AttendanceApiResponse>) {
    try {
      await editAttendance(buildBody(userId, patch));
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to save this change.");
    }
  }

  const [bulkBusy, setBulkBusy] = useState(false);

  // Fire every edit, then refresh once at the end — the old version refreshed after each member,
  // which re-rendered the whole table N times and made the button feel laggy.
  async function bulkMarkPresent() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setActionError("");
    try {
      await Promise.all(members.map((m) => editAttendance(buildBody(m.id, { code: "P" }))));
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to mark all present.");
    } finally {
      setBulkBusy(false);
    }
  }

  const head = ["Name", "Email", "Department", "Status", "In", "Out", "OT", "Fine"];
  const data = members.map((m) => {
    const a = byUser.get(m.id);
    return [
      m.fullName, m.email, m.departmentName ?? "",
      a ? ATTENDANCE_META[a.code].label : ATTENDANCE_META.NM.label,
      a?.inTime ?? "", a?.outTime ?? "",
      a?.overtimeHours ?? 0, a?.fineHours ?? 0,
    ];
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Members" value={members.length} accent="cyan" />
        <StatCard label="Present" value={summary.present} accent="green" icon={CircleCheck} />
        <StatCard label="Absent" value={summary.absent} accent="rose" icon={CircleX} />
        <StatCard label="Half Day" value={summary.halfDay} accent="amber" icon={Clock} />
        <StatCard label="On Leave" value={summary.leave} accent="blue" icon={Plane} />
        <StatCard label="Overtime Hrs" value={summary.overtime.toFixed(1)} accent="green" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={bulkMarkPresent} disabled={bulkBusy} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60">
          {bulkBusy ? <Spinner size={14} className="text-brand-accent" /> : <CheckCheck size={14} />} {bulkBusy ? "Marking…" : "Mark all present"}
        </button>
        <button onClick={() => exportRowsToCsv(`attendance-${date}`, head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <FileSpreadsheet size={14} /> CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Mark</th>
              <th className="px-4 py-2 font-medium">In</th>
              <th className="px-4 py-2 font-medium">Out</th>
              <th className="px-4 py-2 font-medium">Hours</th>
              <th className="px-4 py-2 font-medium">OT (hrs)</th>
              <th className="px-4 py-2 font-medium">Fine (hrs)</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const att = byUser.get(m.id);
              const code = att?.code ?? "NM";
              return (
                <tr key={m.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {(att?.punchInPhoto || att?.punchOutPhoto) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(att.punchInPhoto ?? att.punchOutPhoto)!}
                          alt="Punch selfie"
                          title="Punch selfie (face verified)"
                          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-emerald-200"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[10px] font-semibold text-brand-accent">
                          {m.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <button
                          onClick={() => onOpenCalendar(m)}
                          className="text-left font-medium text-gray-800 transition-colors hover:text-brand-accent hover:underline"
                        >
                          {m.fullName}
                        </button>
                        <div className="text-xs text-gray-400">{m.departmentName ?? "—"}</div>
                      </div>
                      <button
                        onClick={() => onOpenCalendar(m)}
                        title="View attendance calendar"
                        className="ml-auto shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-cyan-50 hover:text-brand-accent"
                      >
                        <CalendarDays size={15} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-200">
                      {MARK_CODES.map((c) => {
                        const on = code === c;
                        const meta = ATTENDANCE_META[c];
                        return (
                          <button
                            key={c}
                            onClick={() => mark(m.id, { code: c })}
                            title={meta.label}
                            className={`px-2.5 py-1 text-xs font-semibold transition-colors ${on ? meta.className : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            {meta.short}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" value={att?.inTime ?? ""} onChange={(e) => mark(m.id, { inTime: e.target.value || null })} className="rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" value={att?.outTime ?? ""} onChange={(e) => mark(m.id, { outTime: e.target.value || null })} className="rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  {/* Hours actually worked, derived from the punch pair against the member's shift.
                      A present day with no punch-out never had its length established, so it is
                      flagged here rather than quietly counting as a full day in the payroll run. */}
                  <td className="px-4 py-2.5">
                    {att?.workedHours != null ? (
                      <span className="font-medium text-gray-700">{Number(att.workedHours).toFixed(2)}</span>
                    ) : att?.inTime && !att?.outTime ? (
                      <span title="Punched in but never out — counts as half a day until corrected" className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={12} /> no punch-out
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" value={Number(att?.overtimeHours ?? 0)} onChange={(e) => mark(m.id, { overtimeHours: Number(e.target.value) })} className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="number" value={Number(att?.fineHours ?? 0)} onChange={(e) => mark(m.id, { fineHours: Number(e.target.value) })} className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-xs outline-none focus:border-cyan-500" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface MusterSummary {
  present: number; absent: number; halfDay: number; paidLeave: number;
  weekOff: number; unmarked: number; overtime: number; fine: number; payableDays: number;
}
function summarize(rows: AttendanceApiResponse[]): MusterSummary {
  const s: MusterSummary = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, weekOff: 0, unmarked: 0, overtime: 0, fine: 0, payableDays: 0 };
  for (const r of rows) {
    s.overtime += Number(r.overtimeHours ?? 0);
    s.fine += Number(r.fineHours ?? 0);
    switch (r.code) {
      case "P": s.present++; s.payableDays += 1; break;
      case "HD": s.halfDay++; s.payableDays += 0.5; break;
      case "PL": s.paidLeave++; s.payableDays += 1; break;
      case "A": s.absent++; break;
      case "WO": s.weekOff++; s.payableDays += 1; break;
      case "NM": s.unmarked++; break;
    }
  }
  return s;
}

/** Muster view — per-member monthly totals, read-only. */
function MonthView({
  members,
  rows,
  totalDays,
  monthKey,
  onOpenCalendar,
}: {
  members: UserResponse[];
  rows: AttendanceApiResponse[];
  totalDays: number;
  monthKey: string;
  onOpenCalendar: (m: UserResponse) => void;
}) {
  const byMember = useMemo(() => {
    const map = new Map<number, AttendanceApiResponse[]>();
    for (const r of rows) {
      if (!map.has(r.userId)) map.set(r.userId, []);
      map.get(r.userId)!.push(r);
    }
    return members.map((m) => ({ member: m, s: summarize(map.get(m.id) ?? []) }));
  }, [rows, members]);

  const exportHead = ["Member", "Present", "Absent", "Half Day", "Paid Leave", "Week Off", "Unmarked", "Overtime", "Fine", "Payable Days"];
  const exportRows = byMember.map(({ member, s }) => [member.fullName, s.present, s.absent, s.halfDay, s.paidLeave, s.weekOff, s.unmarked, s.overtime, s.fine, s.payableDays]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={() => exportRowsToCsv(`muster-${monthKey}`, exportHead, exportRows)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <FileSpreadsheet size={14} /> CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-3 py-2 text-center font-medium">P</th>
              <th className="px-3 py-2 text-center font-medium">A</th>
              <th className="px-3 py-2 text-center font-medium">HD</th>
              <th className="px-3 py-2 text-center font-medium">PL</th>
              <th className="px-3 py-2 text-center font-medium">WO</th>
              <th className="px-3 py-2 text-center font-medium">NM</th>
              <th className="px-3 py-2 text-right font-medium">OT (hrs)</th>
              <th className="px-3 py-2 text-right font-medium">Fine</th>
              <th className="px-3 py-2 text-right font-medium">Payable Days</th>
            </tr>
          </thead>
          <tbody>
            {byMember.map(({ member, s }) => (
              <tr
                key={member.id}
                onClick={() => onOpenCalendar(member)}
                title="View attendance calendar"
                className="cursor-pointer border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                      {member.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{member.fullName}</div>
                      <div className="text-[11px] text-gray-400">{member.departmentName ?? "—"}</div>
                    </div>
                    <CalendarDays size={14} className="ml-auto shrink-0 text-gray-300" />
                  </div>
                </td>
                <MusterCell code="P" value={s.present} />
                <MusterCell code="A" value={s.absent} />
                <MusterCell code="HD" value={s.halfDay} />
                <MusterCell code="PL" value={s.paidLeave} />
                <MusterCell code="WO" value={s.weekOff} />
                <MusterCell code="NM" value={s.unmarked} />
                <td className="px-3 py-2.5 text-right text-gray-700">{s.overtime.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{s.fine.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{s.payableDays} / {totalDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MusterCell({ code, value }: { code: keyof typeof ATTENDANCE_META; value: number }) {
  const meta = ATTENDANCE_META[code];
  return (
    <td className="px-3 py-2.5 text-center">
      <span className={`inline-flex min-w-[26px] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-medium ${meta.className}`} title={meta.label}>
        {value}
      </span>
    </td>
  );
}
