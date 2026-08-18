"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, IndianRupee, Search, TimerReset, UserRound, Users } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { DatePicker } from "@/components/DatePicker";
import { getProjectStaff, ApiError } from "@/lib/api";
import type { ProjectStaffRow } from "@/lib/api";
import { inr } from "@/lib/format";

/**
 * Project → Staff tab. Who worked on this site, how much, and what that labour cost.
 *
 * <p>The roster is everyone assigned to the project *plus* anyone who actually punched on it — a
 * contractor lent to the site for a fortnight belongs on this list even though nobody added them as
 * a permanent member.
 *
 * <p>Cost is an ALLOCATION, not a payslip: days worked on this site × the member's daily rate. The
 * payroll run stays the single authority on what anyone is actually paid (it applies deductions,
 * loans and reimbursements, and knows nothing about sites), so these per-project figures will not
 * add up to a month's payroll — that's expected, and the footnote says so.
 *
 * <p>Money columns are omitted entirely by the backend unless the caller holds PAYROLL:VIEW, so a
 * site supervisor sees who worked and for how long but not what anyone earns.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function startOfMonth(): string {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function ProjectStaff({ projectId }: { projectId: number }) {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(() => iso(new Date()));
  const [rows, setRows] = useState<ProjectStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getProjectStaff(projectId, from, to)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Couldn't load the project's staff.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, from, to]);

  // The backend nulls money for callers without PAYROLL:VIEW — one row is enough to tell.
  const showsMoney = rows.some((r) => r.labourCost !== null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.designation ?? "").toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    let manDays = 0;
    let cost = 0;
    let overtime = 0;
    let worked = 0;
    for (const r of rows) {
      manDays += r.manDays;
      overtime += r.overtimeHours;
      cost += r.labourCost ?? 0;
      if (r.manDays > 0) worked++;
    }
    return { manDays, cost, overtime, worked };
  }, [rows]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="mb-1 text-xs text-slate-400">From</div>
          <DatePicker value={from} onChange={setFrom} />
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-400">To</div>
          <DatePicker value={to} onChange={setTo} />
        </div>
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand-accent"
          />
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-4 ${showsMoney ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Tile icon={<Users size={16} />} tint="bg-cyan-50 text-cyan-600" label="Worked on site" value={`${totals.worked} of ${rows.length}`} />
        <Tile icon={<CalendarDays size={16} />} tint="bg-indigo-50 text-indigo-600" label="Man-days" value={totals.manDays.toFixed(1)} />
        <Tile icon={<TimerReset size={16} />} tint="bg-amber-50 text-amber-600" label="Overtime hours" value={totals.overtime.toFixed(1)} />
        {showsMoney && (
          <Tile icon={<IndianRupee size={16} />} tint="bg-emerald-50 text-emerald-600" label="Allocated labour cost" value={inr(totals.cost)} />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {rows.length === 0
              ? "Nobody is assigned to this project and nobody has punched here in this period."
              : "No staff match that search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 text-right font-medium">Present</th>
                  <th className="px-4 py-2.5 text-right font-medium">Absent</th>
                  <th className="px-4 py-2.5 text-right font-medium">Man-days</th>
                  <th className="px-4 py-2.5 text-right font-medium">OT hrs</th>
                  {showsMoney && <th className="px-4 py-2.5 text-right font-medium">Day rate</th>}
                  {showsMoney && <th className="px-4 py-2.5 text-right font-medium">Cost here</th>}
                  <th className="px-4 py-2.5 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.userId} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {r.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <UserRound size={15} />
                          </span>
                        )}
                        <div>
                          <Link
                            href={`/payroll/staff/${r.userId}`}
                            className="font-medium text-slate-800 hover:text-brand-accent"
                          >
                            {r.name}
                          </Link>
                          <div className="text-xs text-slate-400">
                            {[r.designation, r.department].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-600">{r.roleName ?? "—"}</div>
                      <div className="text-xs text-slate-400">
                        {[r.staffType, r.category].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.presentDays}</td>
                    <td className={`px-4 py-2.5 text-right ${r.absentDays > 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {r.absentDays}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{r.manDays.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{r.overtimeHours.toFixed(1)}</td>
                    {showsMoney && (
                      <td className="px-4 py-2.5 text-right text-slate-500">
                        {r.dailyRate === null ? (
                          <span className="text-amber-600" title="No payroll profile on file">not set</span>
                        ) : (
                          inr(r.dailyRate)
                        )}
                      </td>
                    )}
                    {showsMoney && (
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{inr(r.labourCost ?? 0)}</td>
                    )}
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{r.lastSeen ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showsMoney && (
        <p className="flex items-start gap-1.5 text-xs text-slate-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Cost is allocated from attendance — days worked on this site × the member&apos;s day rate. It is a site
          costing figure, not a payslip: the payroll run remains authoritative for what anyone is actually paid.
        </p>
      )}
    </div>
  );
}

function Tile({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <div className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
