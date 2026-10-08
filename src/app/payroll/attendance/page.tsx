"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollShell, PayrollEmpty, StatCard } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { useMuster } from "@/lib/usePayrollLive";
import { bulkEditAttendance, editAttendance, getPayrollPeople, ApiError } from "@/lib/api";
import type { AttendanceApiResponse, AttendanceCodeApi, AttendanceEditRequestBody, PayrollProfileResponse, UserResponse } from "@/lib/api";
import { ATTENDANCE_META, DEPARTMENTS } from "@/lib/payrollConfig";
import { exportRowsToCsv, exportRowsToXlsx, printRows } from "@/lib/vyaparExport";
import { DayActions, hoursLabel } from "@/components/payroll/AttendanceActions";
import type { LeaveChoice } from "@/components/payroll/AttendanceActions";
import { AttendanceImportDialog } from "@/components/payroll/AttendanceImportDialog";
import { PendingPunches } from "@/components/payroll/PendingPunches";
import { useLeavePolicies, usePayrollProfiles } from "@/lib/usePayrollSetup";
import { payGroupOf, PAY_GROUP_ORDER } from "@/lib/payrollGroups";
import { inr } from "@/lib/format";
import { AlertTriangle,
  CalendarDays, CheckCheck, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock, FileSpreadsheet, FileText, LogIn, LogOut, Plane, Printer, Search, Upload, Users,
} from "lucide-react";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";
import { PunchPhotoThumbs, punchShots } from "@/components/payroll/PunchPhotos";
import { useOwnRecordLock } from "@/lib/permissions";

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
  // Deep link from the Payroll dashboard tiles: ?date=2026-10-08.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
  }, []);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [payType, setPayType] = useState("all");
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
    getPayrollPeople().then((r) => { setMembers(r.content.filter((u) => u.onPayroll)); setMembersLoading(false); }).catch(() => setMembersLoading(false));
  }, []);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const { profiles } = usePayrollProfiles(memberIds.length ? memberIds : undefined);
  const { leavePolicies } = useLeavePolicies();
  // Paid leave types offered for a leave mark or the other half of a half day, per member.
  const leaveChoices = useMemo(() => {
    return (userId: number): LeaveChoice[] => {
      const pid = profiles[userId]?.leavePolicyId;
      const policy = leavePolicies.find((lp) => lp.id === pid) ?? leavePolicies[0];
      return (policy?.types ?? []).filter((t) => t.paid).map((t) => ({ value: t.name, label: t.name }));
    };
  }, [profiles, leavePolicies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (dept !== "all" && (m.departmentName ?? "") !== dept) return false;
      if (payType !== "all" && payGroupOf(profiles[m.id]) !== payType) return false;
      if (!q) return true;
      return m.fullName.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, search, dept, payType, profiles]);

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

        <PendingPunches onDecided={refresh} />
        {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {/* Filters row (shared) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44"><Select value={dept} onChange={setDept} options={[{ value: "all", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]} /></div>
          <div className="w-48"><Select value={payType} onChange={setPayType} options={[{ value: "all", label: "All staff types" }, ...PAY_GROUP_ORDER.map((g) => ({ value: g, label: g }))]} /></div>
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
            profiles={profiles}
            leaveChoices={leaveChoices}
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
  profiles,
  leaveChoices,
}: {
  date: string;
  members: UserResponse[];
  rows: AttendanceApiResponse[];
  refresh: () => Promise<void>;
  setActionError: (msg: string) => void;
  onOpenCalendar: (m: UserResponse) => void;
  profiles: Record<number, PayrollProfileResponse>;
  leaveChoices: (userId: number) => LeaveChoice[];
}) {
  const ownLock = useOwnRecordLock();
  const byUser = useMemo(() => {
    const m = new Map<number, AttendanceApiResponse>();
    for (const r of rows) m.set(r.userId, r);
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, leave: 0, overtime: 0, fine: 0, fineAmt: 0, otAmt: 0, punchedIn: 0, punchedOut: 0, unmarked: 0 };
    for (const m of members) {
      const att = byUser.get(m.id);
      if (!att || att.code === "NM") { s.unmarked++; if (!att) continue; }
      if (att.code === "P" || att.code === "OD") s.present++;
      else if (att.code === "A" || att.code === "L") s.absent++;
      else if (att.code === "HD") s.halfDay++;
      else if (att.code === "PL") s.leave++;
      s.overtime += Number(att.overtimeHours ?? 0);
      s.fine += Number(att.fineHours ?? 0);
      s.fineAmt += Number(att.fineAmount ?? 0);
      s.otAmt += Number(att.otAmount ?? 0);
      if (att.inTime) s.punchedIn++;
      if (att.outTime) s.punchedOut++;
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

  /**
   * Build the edit payload.
   *
   * <p>The code is deliberately left off a pure in/out edit. The backend derives P / HD / A and
   * overtime from the punch pair against the member's shift, but treats any code in the request as
   * an explicit admin override that wins over that derivation — so re-sending the row's current
   * code, which is what this used to do, meant typing real in/out times never reclassified the day.
   * Someone marked Present who worked three hours of an eight-hour shift stayed Present.
   *
   * <p>Overtime is likewise omitted on a time edit so the shift's own OT rules apply; typing in the
   * OT box still sends an explicit figure and still wins.
   */
  function buildBody(userId: number, patch: Partial<AttendanceApiResponse>): EditBody {
    const existing = byUser.get(userId);
    const timeEdit = patch.inTime !== undefined || patch.outTime !== undefined;
    const body: EditBody = {
      userId,
      date,
      inTime: patch.inTime !== undefined ? patch.inTime : existing?.inTime ?? null,
      outTime: patch.outTime !== undefined ? patch.outTime : existing?.outTime ?? null,
      fineHours: patch.fineHours !== undefined ? patch.fineHours : Number(existing?.fineHours ?? 0),
    };
    if (patch.code) body.code = patch.code;
    else if (!timeEdit) body.code = existing?.code;

    if (patch.overtimeHours !== undefined) body.overtimeHours = patch.overtimeHours;
    else if (!timeEdit) body.overtimeHours = Number(existing?.overtimeHours ?? 0);

    // Absent means nobody was here — clear the punch pair so no stale hours survive the mark.
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
      // Only members with nothing marked yet — a bulk click must not overwrite a leave or an absence.
      const blank = members.filter((m) => { const a = byUser.get(m.id); return !a || a.code === "NM"; });
      await bulkEditAttendance(blank.map((m) => buildBody(m.id, { code: "P" }) as AttendanceEditRequestBody));
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to mark all present.");
    } finally {
      setBulkBusy(false);
    }
  }

  const [importOpen, setImportOpen] = useState(false);
  const head = ["Name", "Email", "Department", "Status", "In", "Out", "OT hrs", "OT ₹", "Fine hrs", "Fine ₹", "Note"];
  const data = members.map((m) => {
    const a = byUser.get(m.id);
    return [
      m.fullName, m.email, m.departmentName ?? "",
      a ? ATTENDANCE_META[a.code].label : ATTENDANCE_META.NM.label,
      a?.inTime ?? "", a?.outTime ?? "",
      Number(a?.overtimeHours ?? 0), Number(a?.otAmount ?? 0), Number(a?.fineHours ?? 0), Number(a?.fineAmount ?? 0), a?.note ?? "",
    ];
  });
  const [show, setShow] = useState("all");
  // Deep link from the Payroll dashboard tiles: ?show=present (the page reads ?date=).
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("show");
    if (s) setShow(s);
  }, []);
  const shownMembers = useMemo(() => members.filter((m) => {
    const a = byUser.get(m.id);
    const c = a?.code ?? "NM";
    switch (show) {
      case "present": return c === "P" || c === "OD";
      case "absent": return c === "A" || c === "L";
      case "half": return c === "HD";
      case "leave": return c === "PL";
      case "unmarked": return c === "NM";
      case "punched": return !!a?.inTime;
      case "ot": return Number(a?.overtimeHours ?? 0) > 0 || Number(a?.otAmount ?? 0) > 0;
      case "fine": return Number(a?.fineAmount ?? 0) > 0 || Number(a?.fineHours ?? 0) > 0;
      default: return true;
    }
  }), [members, byUser, show]);
  const daySort = useMemo(() => ({
    name: (m: UserResponse) => m.fullName,
    mark: (m: UserResponse) => byUser.get(m.id)?.code ?? "NM",
    in: (m: UserResponse) => byUser.get(m.id)?.inTime ?? "",
    out: (m: UserResponse) => byUser.get(m.id)?.outTime ?? "",
    hours: (m: UserResponse) => (byUser.get(m.id)?.workedHours == null ? null : Number(byUser.get(m.id)!.workedHours)),
  }), [byUser]);
  const { sorted: sortedMembers, sortKey, sortDir, toggle: sortBy } = useTableSort(shownMembers, daySort, { key: "name" });
  // Rows grouped by staff type, as PagarBook's board is ("Monthly Regular 1", "Daily 1", …).
  const groups = useMemo(() => {
    const map = new Map<string, UserResponse[]>();
    for (const m of sortedMembers) {
      const g = payGroupOf(profiles[m.id]);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return PAY_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, list: map.get(g)! }));
  }, [sortedMembers, profiles]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Members" value={members.length} accent="cyan" />
        <StatCard label="Present" value={summary.present} accent="green" icon={CircleCheck} />
        <StatCard label="Absent" value={summary.absent} accent="rose" icon={CircleX} />
        <StatCard label="Half Day" value={summary.halfDay} accent="amber" icon={Clock} />
        <StatCard label="On Leave" value={summary.leave} accent="blue" icon={Plane} />
        <StatCard label="Overtime" value={`${hoursLabel(summary.overtime)} h`} hint={summary.otAmt > 0 ? inr(summary.otAmt) : undefined} accent="green" />
        <StatCard label="Fine" value={`${hoursLabel(summary.fine)} h`} hint={summary.fineAmt > 0 ? inr(summary.fineAmt) : undefined} accent="rose" />
        <StatCard label="Punched In" value={summary.punchedIn} accent="cyan" icon={LogIn} />
        <StatCard label="Punched Out" value={summary.punchedOut} accent="cyan" icon={LogOut} />
        <StatCard label="Not Marked" value={summary.unmarked} accent="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={bulkMarkPresent} disabled={bulkBusy} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60">
          {bulkBusy ? <Spinner size={14} className="text-brand-accent" /> : <CheckCheck size={14} />} {bulkBusy ? "Marking…" : "Mark all present"}
        </button>
        <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <Upload size={14} /> Bulk Add Attendance
        </button>
        <div className="w-40">
          <Select value={show} onChange={setShow} options={[
            { value: "all", label: "Show: Everyone" }, { value: "present", label: "Present" }, { value: "absent", label: "Absent" },
            { value: "half", label: "Half day" }, { value: "leave", label: "On leave" }, { value: "unmarked", label: "Not marked" },
            { value: "punched", label: "Punched in" }, { value: "ot", label: "With overtime" }, { value: "fine", label: "With fine" },
          ]} />
        </div>
        {show !== "all" && <span className="text-xs text-gray-500">{shownMembers.length} of {members.length}</span>}
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <span className="text-xs text-gray-400">Daily report</span>
        <button onClick={() => exportRowsToXlsx(`attendance-${date}`, head, data, [], { title: `Daily Attendance — ${date}` })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button onClick={() => printRows(`Daily Attendance — ${date}`, head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <Printer size={14} /> PDF
        </button>
        <button onClick={() => exportRowsToCsv(`attendance-${date}`, head, data)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <FileText size={14} /> CSV
        </button>
      </div>
      {importOpen && (
        <AttendanceImportDialog
          members={members}
          defaultDate={date}
          onClose={() => setImportOpen(false)}
          onImported={async () => { setImportOpen(false); await refresh(); }}
        />
      )}

      <p className="text-xs text-gray-400">
        Enter an <strong>In</strong> and <strong>Out</strong> time and the day is graded against that member&apos;s shift
        (Setup → Shifts) — including any late / early-exit fines and overtime pay the shift automates.
        <strong> P / HD / A</strong> mark the day by hand (HD asks which session and what the other half is),
        <strong> F</strong> and <strong>OT</strong> add fines and overtime, <strong>L</strong> marks leave, on duty or a holiday.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <SortTh label="Member" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
              <SortTh label="Mark" sortKey="mark" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
              <SortTh label="In" sortKey="in" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
              <SortTh label="Out" sortKey="out" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
              <th className="px-4 py-2 font-medium">Photos</th>
              <SortTh label="Hours" sortKey="hours" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
            </tr>
          </thead>
          <tbody>
            {groups.map(({ group, list }) => [
              <tr key={`g-${group}`} className="bg-gray-50/80">
                <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-gray-600">
                  {group} <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-gray-200">{list.length}</span>
                </td>
              </tr>,
              ...list.map((m) => {
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
                    <DayActions
                      target={{ userId: m.id, name: m.fullName, date, row: att }}
                      leaveTypes={leaveChoices(m.id)}
                      onSaved={refresh}
                      onError={setActionError}
                    />
                    {att?.note && <div className="mt-1 max-w-[260px] truncate text-[11px] text-gray-500" title={att.note}>📝 {att.note}</div>}
                    <span className="sr-only">{ATTENDANCE_META[code as AttendanceCodeApi]?.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" disabled={ownLock(m.id)} value={att?.inTime ?? ""} onChange={(e) => mark(m.id, { inTime: e.target.value || null })} className="disabled:opacity-50 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input type="time" disabled={ownLock(m.id)} value={att?.outTime ?? ""} onChange={(e) => mark(m.id, { outTime: e.target.value || null })} className="disabled:opacity-50 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    {punchShots(att).length > 0 ? <PunchPhotoThumbs row={att} name={m.fullName} size={30} /> : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Hours actually worked, derived from the punch pair against the member's shift.
                      A present day with no punch-out is flagged so someone adds the time out; the run
                      pays it as the Present day the calendar shows. A short day (under the half-day
                      mark) is paid for its hours — that is what "short day" says here. */}
                  <td className="px-4 py-2.5">
                    {att?.workedHours != null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-medium text-gray-700">{Number(att.workedHours).toFixed(2)}</span>
                        {att.code === "A" && Number(att.workedHours) > 0 && (
                          <span
                            title={`Under the half-day mark — paid for ${Number(att.workedHours)} hours${att.payableDays != null ? ` (${Number(att.payableDays)} day)` : ""}`}
                            className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                          >
                            short day{att.payableDays != null ? ` · ${Number(att.payableDays)}d` : ""}
                          </span>
                        )}
                      </span>
                    ) : att?.inTime && !att?.outTime ? (
                      <span title="Punched in but never out — add the time out so the hours are on record" className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={12} /> no punch-out
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })])}
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

  const { sorted: musterRows, sortKey, sortDir, toggle: sortBy } = useTableSort(byMember, MUSTER_SORT, { key: "name" });
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
              <SortTh label="Member" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={sortBy} />
              <SortTh label="P" sortKey="present" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="A" sortKey="absent" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="HD" sortKey="halfDay" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="PL" sortKey="paidLeave" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="WO" sortKey="weekOff" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="NM" sortKey="unmarked" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="OT (hrs)" sortKey="overtime" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="Fine" sortKey="fine" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
              <SortTh label="Payable Days" sortKey="payableDays" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" />
            </tr>
          </thead>
          <tbody>
            {musterRows.map(({ member, s }) => (
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

type MusterRow = { member: UserResponse; s: ReturnType<typeof summarize> };
const MUSTER_SORT = {
  name: (r: MusterRow) => r.member.fullName,
  present: (r: MusterRow) => r.s.present,
  absent: (r: MusterRow) => r.s.absent,
  halfDay: (r: MusterRow) => r.s.halfDay,
  paidLeave: (r: MusterRow) => r.s.paidLeave,
  weekOff: (r: MusterRow) => r.s.weekOff,
  unmarked: (r: MusterRow) => r.s.unmarked,
  overtime: (r: MusterRow) => r.s.overtime,
  fine: (r: MusterRow) => r.s.fine,
  payableDays: (r: MusterRow) => Number(r.s.payableDays),
};

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
