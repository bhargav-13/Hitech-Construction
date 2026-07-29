"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { Spinner } from "@/components/Spinner";
import { useProjectAttendance } from "@/lib/usePayrollLive";
import { editAttendance, getTeam, ApiError } from "@/lib/api";
import type { TeamMemberResponse, AttendanceCodeApi } from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { ChevronLeft, ChevronRight, Clock, MapPin, Search, UserPlus, Users } from "lucide-react";

// Local calendar date (not UTC) so keys match the muster / punch / calendar.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MARK_CODES: AttendanceCodeApi[] = ["P", "HD", "PL", "A"];

function hoursWorked(inTime: string | null, outTime: string | null): number {
  if (!inTime || !outTime) return 0;
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  const mins = oh * 60 + om - (ih * 60 + im);
  return mins > 0 ? Math.round((mins / 60) * 10) / 10 : 0;
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Project → Attendance tab. Reads real attendance rows filtered to this project for the selected
 * day (payroll-service), and lets an admin mark P/HD/PL/A per member — each mark persists an
 * attendance row tagged with this project. "Add Staff" pulls from the real team directory.
 */
export function ProjectAttendance({ projectId }: { projectId: string }) {
  const pid = Number(projectId);
  const [date, setDate] = useState(iso(new Date()));
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyUser, setBusyUser] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const { rows, loading, error, refresh } = useProjectAttendance(Number.isFinite(pid) ? pid : null, date, date);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.memberName.toLowerCase().includes(q));
  }, [rows, search]);

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, halfDay: 0, paidLeave: 0, weekOff: 0 };
    for (const r of rows) {
      switch (r.code) {
        case "P": s.present++; break;
        case "A": s.absent++; break;
        case "HD": s.halfDay++; break;
        case "PL": s.paidLeave++; break;
        case "WO": s.weekOff++; break;
      }
    }
    return s;
  }, [rows]);

  const step = (dir: 1 | -1) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + dir);
    setDate(iso(d));
  };

  async function mark(userId: number, code: AttendanceCodeApi) {
    setBusyUser(userId); setActionError("");
    try {
      await editAttendance({ userId, date, code, projectId: pid });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to save attendance.");
    } finally {
      setBusyUser(null);
    }
  }

  if (!Number.isFinite(pid)) {
    return <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">Attendance is unavailable for this project.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Date navigator + search + summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-brand-accent"><ChevronLeft size={16} /></button>
          <div className="w-40"><DatePicker value={date} onChange={setDate} placeholder="Select date" /></div>
          <button onClick={() => step(1)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-brand-accent"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-40 bg-transparent text-sm outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <span className="text-slate-800">{summary.present} <span className="font-normal text-slate-400">Present</span></span>
          <SummaryDot label="Absent" count={summary.absent} className="bg-rose-400" />
          <SummaryDot label="Half Day" count={summary.halfDay} className="bg-amber-400" />
          <SummaryDot label="Paid Leave" count={summary.paidLeave} className="bg-blue-400" />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          <UserPlus size={15} /> Add Staff
        </button>
      </div>

      {actionError && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{actionError}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {/* Attendance table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <Users size={24} className="text-gray-300" />
          <div className="text-sm font-medium text-gray-600">No attendance recorded for this project on {date}</div>
          <p className="max-w-xs text-xs text-gray-400">Use “Add Staff” to mark someone present here, or ask them to punch in from their own dashboard.</p>
          <button onClick={() => setAdding(true)} className="mt-1 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add Staff</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Punch Time</th>
                <th className="px-4 py-2.5 font-medium">Hours</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const hrs = hoursWorked(r.inTime, r.outTime);
                const punchLabel = r.inTime
                  ? r.outTime
                    ? `${formatTime12(r.inTime)} – ${formatTime12(r.outTime)}`
                    : `${formatTime12(r.inTime)} – continue`
                  : null;
                return (
                  <tr key={r.userId} className="border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-xs font-bold text-white">
                          {r.memberName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div className="font-medium text-gray-800">{r.memberName}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {punchLabel ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          <Clock size={13} className="text-emerald-500" />
                          {punchLabel}
                          {r.punchInLat != null && (
                            <span title={`GPS: ${r.punchInLat}, ${r.punchInLng}`}><MapPin size={11} className="text-cyan-500" /></span>
                          )}
                          {r.punchInPhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.punchInPhoto} alt="Punch-in selfie" title="Punch-in selfie (face verified)" className="h-6 w-6 rounded object-cover ring-1 ring-emerald-200" />
                          )}
                          {r.punchOutPhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.punchOutPhoto} alt="Punch-out selfie" title="Punch-out selfie (face verified)" className="h-6 w-6 rounded object-cover ring-1 ring-rose-200" />
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hrs > 0 ? <span className="text-xs text-gray-600">{hrs} hrs</span> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-200">
                        {MARK_CODES.map((c) => {
                          const m = ATTENDANCE_META[c];
                          const on = r.code === c;
                          return (
                            <button
                              key={c}
                              onClick={() => mark(r.userId, c)}
                              disabled={busyUser === r.userId}
                              title={m.label}
                              className={`px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${on ? m.className : "bg-white text-gray-400 hover:bg-gray-50"}`}
                            >
                              {m.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddStaffDrawer
          date={date}
          projectId={pid}
          existing={rows.map((r) => r.userId)}
          onClose={() => setAdding(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function SummaryDot({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      <span className="font-medium text-gray-700">{count}</span>
      <span className="font-normal text-gray-400">{label}</span>
    </span>
  );
}

function AddStaffDrawer({ date, projectId, existing, onClose, onDone }: { date: string; projectId: number; existing: number[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [team, setTeam] = useState<TeamMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeam();
        if (!cancelled) setTeam(res.filter((u) => u.active));
      } catch {
        if (!cancelled) setTeam([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return team
      .filter((u) => !existing.includes(u.id))
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || (u.roleName ?? "").toLowerCase().includes(q));
  }, [team, existing, search]);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true); setError("");
    try {
      for (const userId of picked) {
        await editAttendance({ userId, date, code: "P", projectId });
      }
      await onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add staff.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title="Add Staff" onClose={onClose} onSave={save} saveLabel={saving ? "Adding…" : `Mark Present${picked.size ? ` (${picked.size})` : ""}`} width="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Pick people to mark present on this project for {date}. This writes a real attendance row tagged to this project.</p>
        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" className="w-full bg-transparent text-sm outline-none" autoFocus />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : available.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">{team.length === 0 ? "No staff found." : "Everyone is already marked on this project today."}</div>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {available.map((u) => {
              const on = picked.has(u.id);
              return (
                <button key={u.id} onClick={() => toggle(u.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${on ? "border-brand-accent bg-cyan-50/40" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(u.id)} className="accent-cyan-600" onClick={(ev) => ev.stopPropagation()} />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                    {u.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{u.fullName}</div>
                    <div className="truncate text-xs text-gray-400">{u.roleName}{u.departmentName ? ` · ${u.departmentName}` : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
