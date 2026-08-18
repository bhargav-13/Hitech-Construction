"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { profileProgress } from "@/lib/payrollApi";
import { usePayrollProfiles } from "@/lib/usePayrollSetup";
import { getUsers, ApiError } from "@/lib/api";
import type { UserResponse } from "@/lib/api";
import { DEPARTMENTS, categoryConfig } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { FileSpreadsheet, Search, Settings2, UserRoundPlus, Users } from "lucide-react";

type PostingFilter = "all" | "OFFICE" | "SITE";

/**
 * People — the payroll roster, sourced from real Members (Settings) where "On payroll" is ticked.
 * People aren't created here anymore; they're enrolled in Settings. This screen fills in each
 * person's payroll profile (salary, statutory, bank) via a drawer.
 */
export default function PayrollPeoplePage() {
  const router = useRouter();
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [posting, setPosting] = useState<PostingFilter>("all");
  const [dept, setDept] = useState("all");

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const { profiles, error: profilesError } = usePayrollProfiles(memberIds.length ? memberIds : undefined);

  const openProfile = (id: number) => router.push(`/payroll/staff/${id}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getUsers(0, 200);
        if (!cancelled) setMembers(res.content.filter((u) => u.onPayroll));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (posting !== "all" && m.staffType !== posting) return false;
      if (dept !== "all" && (m.departmentName ?? "") !== dept) return false;
      if (!q) return true;
      return [m.fullName, m.email ?? "", m.phoneNumber ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [members, search, posting, dept]);

  const enrolledCount = members.length;
  const completeCount = members.filter((m) => profileProgress(profiles[m.id]).percent === 100).length;

  const payLabel = (m: UserResponse): string => {
    const p = profiles[m.id];
    if (!p) return "—";
    if (p.salary.workType) return `${inr(p.salary.workRate)}/${p.salary.workType === "HOURLY" ? "hr" : p.salary.workType === "PIECE" ? "pc" : "day"}`;
    return inr(p.salary.monthlyCtc);
  };

  const head = ["Name", "Email", "Posting", "Department", "Category", "Monthly / Rate", "Setup %"];
  const data = rows.map((m) => {
    const p = profiles[m.id];
    return [
      m.fullName,
      m.email,
      m.staffType === "SITE" ? "Site" : m.staffType === "OFFICE" ? "Office" : "—",
      m.departmentName ?? "—",
      p ? categoryConfig(p.category).title : "Not set",
      payLabel(m),
      `${profileProgress(p).percent}%`,
    ];
  });

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">People</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {enrolledCount} on payroll · {completeCount} fully set up
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportRowsToCsv("payroll-people", head, data)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              title="People are added in Settings → Members by ticking 'On payroll'"
            >
              <UserRoundPlus size={15} /> Add in Settings
            </Link>
          </div>
        </div>

        {/* How-to hint — people come from Settings now */}
        <div className="flex items-start gap-2 rounded-lg border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-xs text-brand-accent">
          <Settings2 size={14} className="mt-0.5 shrink-0" />
          <span>
            Payroll people are Members with <span className="font-semibold">On payroll</span> ticked in{" "}
            <Link href="/settings" className="font-semibold underline">Settings → Members</Link>. Click a row here to set up their
            salary, statutory and bank details.
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44">
            <Select
              value={posting}
              onChange={(v) => setPosting(v as PostingFilter)}
              options={[
                { value: "all", label: "All postings" },
                { value: "OFFICE", label: "Office" },
                { value: "SITE", label: "Site" },
              ]}
            />
          </div>
          <div className="w-44">
            <Select
              value={dept}
              onChange={setDept}
              options={[{ value: "all", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading people…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : profilesError ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{profilesError}</div>
        ) : enrolledCount === 0 ? (
          <PayrollEmpty
            icon={Users}
            title="No one is on payroll yet"
            hint="Add a Member in Settings and tick 'On payroll' to enroll them here."
            action={<Link href="/settings" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Go to Settings</Link>}
          />
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={Users} title="No people match" hint="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[840px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-4 py-2 font-medium">Posting</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly / Rate</th>
                  <th className="px-4 py-2 font-medium">Setup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const p = profiles[m.id];
                  return (
                    <tr
                      key={m.id}
                      onClick={() => openProfile(m.id)}
                      className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                            {m.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800">{m.fullName}</div>
                            <div className="truncate text-xs text-gray-400">{m.email}{m.phoneNumber ? ` · ${m.phoneNumber}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {m.staffType ? (
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${m.staffType === "SITE" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>
                            {m.staffType === "SITE" ? "Site" : "Office"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{m.departmentName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {p ? categoryConfig(p.category).title : <span className="text-gray-300">Not set</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">{payLabel(m)}</td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const pct = profileProgress(p).percent;
                          return (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? "bg-emerald-500" : "bg-brand-accent"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${pct === 100 ? "text-emerald-600" : pct === 0 ? "text-gray-400" : "text-gray-600"}`}>
                                {pct}%
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PayrollShell>
  );
}
