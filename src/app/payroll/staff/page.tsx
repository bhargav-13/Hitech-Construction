"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { profileProgress } from "@/lib/payrollApi";
import { usePayrollProfiles, useShifts } from "@/lib/usePayrollSetup";
import { getPayrollPeople, setStaffStatus, ApiError } from "@/lib/api";
import type { UserResponse } from "@/lib/api";
import { DEPARTMENTS, categoryConfig } from "@/lib/payrollConfig";
import { payGroupOf, staffStatusOf, PAY_GROUP_ORDER } from "@/lib/payrollGroups";
import { inr } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { AddPaymentDialog, ReviseSalaryDialog, VariableDialog } from "@/components/payroll/PayrollDialogs";
import { ChevronDown, FileSpreadsheet, FileUp, Filter, Search, Settings2, UserRoundPlus, Users, X } from "lucide-react";
import { StaffImportDialog } from "@/components/payroll/StaffImportDialog";
import { useAuthStore } from "@/lib/authStore";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";
import { useOwnRecordLock } from "@/lib/permissions";
import { useRefreshTick } from "@/lib/autoRefresh";
import { getHomeSites } from "@/lib/api";
import type { HomeSite } from "@/lib/api";

type PostingFilter = "all" | "OFFICE" | "SITE";
type GroupBy = "SALARY" | "SHIFT" | "MANAGER" | "NONE";
type StatusFilter = "ACTIVE" | "DEACTIVATED" | "ALL";
type SetupFilter = "all" | "PENDING" | "DONE";

/**
 * Staff List — PagarBook's staff screen over our Members: search, a filter drawer (staff type,
 * status, posting, department), Group By (salary type / shift / none), select-all with bulk actions
 * (variable pay, revise salary, change status, export) and an Add Payment button on every row.
 * People are still enrolled in Settings → Members ("On payroll").
 */
export default function PayrollPeoplePage() {
  const router = useRouter();
  const [members, setMembers] = useState<UserResponse[]>([]);
  const [allUsers, setAllUsers] = useState<UserResponse[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [posting, setPosting] = useState<PostingFilter>("all");
  const [dept, setDept] = useState("all");
  const [payType, setPayType] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [groupBy, setGroupBy] = useState<GroupBy>("SALARY");
  const [setup, setSetup] = useState<SetupFilter>("all");
  // Role "applies to" scope, lighter: narrow the list to the people reporting to someone.
  const [manager, setManager] = useState("all");
  const [importing, setImporting] = useState(false);
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const ownLock = useOwnRecordLock();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: "PAY"; m: UserResponse } | { kind: "VAR" } | { kind: "REVISE" }>(null);
  const [notice, setNotice] = useState("");

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  // Home office/site per person — its approval rule decides who approves their leave.
  const [homeSites, setHomeSites] = useState<Record<number, HomeSite>>({});
  useEffect(() => {
    if (!memberIds.length) return;
    getHomeSites(memberIds)
      .then((list) => setHomeSites(Object.fromEntries(list.map((h) => [h.userId, h]))))
      .catch(() => setHomeSites({}));
  }, [memberIds]);
  const { profiles, loading: profilesLoading, error: profilesError, refresh: refreshProfiles } = usePayrollProfiles(memberIds.length ? memberIds : undefined);
  const { shifts } = useShifts();

  const openProfile = (id: number) => router.push(`/payroll/staff/${id}`);

  const tick = useRefreshTick(); // silent re-load on the module auto-refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPayrollPeople();
        if (!cancelled) setAllUsers(res.content);
        if (!cancelled) setMembers(res.content.filter((u) => u.onPayroll));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload, tick]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const p = profiles[m.id];
      if (status !== "ALL" && staffStatusOf(p) !== status) return false;
      if (posting !== "all" && m.staffType !== posting) return false;
      if (dept !== "all" && (m.departmentName ?? "") !== dept) return false;
      if (payType !== "all" && payGroupOf(p) !== payType) return false;
      if (manager !== "all" && String(p?.details?.reportingManagerId ?? "") !== (manager === "me" ? String(meId) : manager)) return false;
      if (setup !== "all" && (profileProgress(p).percent === 100) !== (setup === "DONE")) return false;
      if (!q) return true;
      return [m.fullName, m.email ?? "", m.phoneNumber ?? "", p?.details?.staffCode ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [members, profiles, search, posting, dept, payType, status, manager, setup, meId]);

  const userNames = useMemo(() => Object.fromEntries(allUsers.map((u) => [u.id, u.fullName])) as Record<number, string>, [allUsers]);
  const managers = useMemo(() => {
    const ids = new Set<number>();
    for (const m of members) { const id = profiles[m.id]?.details?.reportingManagerId; if (id) ids.add(id); }
    return [...ids].map((id) => ({ value: String(id), label: userNames[id] ?? `#${id}` })).sort((a, b) => a.label.localeCompare(b.label));
  }, [members, profiles, userNames]);

  const staffSort = useMemo(() => ({
    name: (m: UserResponse) => m.fullName,
    code: (m: UserResponse) => profiles[m.id]?.details?.staffCode ?? "",
    posting: (m: UserResponse) => m.staffType ?? "",
    dept: (m: UserResponse) => m.departmentName ?? "",
    home: (m: UserResponse) => homeSites[m.id]?.projectName ?? "",
    pay: (m: UserResponse) => {
      const p = profiles[m.id];
      return p ? Number(p.salary.workType ? p.salary.workRate : p.salary.monthlyCtc) : null;
    },
    setup: (m: UserResponse) => profileProgress(profiles[m.id]).percent,
    status: (m: UserResponse) => staffStatusOf(profiles[m.id]),
  }), [profiles, homeSites]);
  const { sorted: sortedRows, sortKey, sortDir, toggle: sortBy } = useTableSort(rows, staffSort, { key: "name" });

  const groups = useMemo(() => {
    if (groupBy === "NONE") return [{ key: "All staff", list: sortedRows }];
    const map = new Map<string, UserResponse[]>();
    for (const m of sortedRows) {
      const p = profiles[m.id];
      const mgr = p?.details?.reportingManagerId;
      const key = groupBy === "SALARY"
        ? payGroupOf(p)
        : groupBy === "MANAGER"
          ? (mgr ? `Reports to ${userNames[mgr] ?? `#${mgr}`}` : "No reporting manager")
          : shifts.find((s) => s.id === p?.shiftId)?.name ?? "No shift";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    const order = groupBy === "SALARY" ? PAY_GROUP_ORDER as string[] : [...map.keys()].sort();
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, list: map.get(k)! }));
  }, [sortedRows, groupBy, profiles, shifts, userNames]);

  const activeFilters = [posting !== "all", dept !== "all", payType !== "all", status !== "ACTIVE", manager !== "all", setup !== "all"].filter(Boolean).length;
  const allSelected = rows.length > 0 && rows.every((m) => selected.has(m.id));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((m) => m.id)));
  const selectedMembers = members.filter((m) => selected.has(m.id));
  const names = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.fullName])), [members]);

  const completeCount = members.filter((m) => profileProgress(profiles[m.id]).percent === 100).length;
  const pendingCount = members.length - completeCount;

  const payLabel = (m: UserResponse): string => {
    const p = profiles[m.id];
    if (!p) return "—";
    if (p.salary.workType) return `${inr(p.salary.workRate)}/${p.salary.workType === "HOURLY" ? "hr" : p.salary.workType === "PIECE" ? "pc" : "day"}`;
    return `${inr(p.salary.monthlyCtc)}/mo`;
  };

  async function changeStatus(to: "ACTIVE" | "DEACTIVATED") {
    setBulkOpen(false);
    const ids = selectedMembers.filter((m) => profiles[m.id]).map((m) => m.id);
    if (ids.length === 0) { setNotice("Only staff with a payroll profile can be (de)activated."); return; }
    if (to === "DEACTIVATED" && !confirm(`Deactivate ${ids.length} staff? They are left out of new payroll runs until reactivated.`)) return;
    try {
      const r = await setStaffStatus(ids, to);
      setNotice(`${r.updated} staff ${to === "ACTIVE" ? "activated" : "deactivated"}.`);
      setSelected(new Set());
      await refreshProfiles();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to change status.");
    }
  }

  const head = ["Name", "Staff ID", "Email", "Posting", "Department", "Staff Type", "Category", "Monthly / Rate", "Status", "Setup %"];
  const exportRows = (list: UserResponse[]) => list.map((m) => {
    const p = profiles[m.id];
    return [
      m.fullName, p?.details?.staffCode ?? "", m.email,
      m.staffType === "SITE" ? "Site" : m.staffType === "OFFICE" ? "Office" : "—",
      m.departmentName ?? "—", payGroupOf(p), p ? categoryConfig(p.category).title : "Not set",
      payLabel(m), staffStatusOf(p) === "ACTIVE" ? "Active" : "Deactivated", `${profileProgress(p).percent}%`,
    ];
  });

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Staff List</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {members.length} on payroll · {completeCount} fully set up
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportRowsToCsv("payroll-staff", head, exportRows(rows))}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileUp size={14} /> Import
            </button>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              title="People are added in Settings → Members by ticking 'On payroll'"
            >
              <UserRoundPlus size={15} /> Add Staff
            </Link>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-xs text-brand-accent">
          <Settings2 size={14} className="mt-0.5 shrink-0" />
          <span>
            Staff are Members with <span className="font-semibold">On payroll</span> ticked in{" "}
            <Link href="/settings" className="font-semibold underline">Settings → Members</Link>. Open a row for the staff profile —
            attendance, salary, payments, loans, leaves and documents.
          </span>
        </div>

        {!loading && !profilesLoading && pendingCount > 0 && setup !== "PENDING" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>
              <span className="font-semibold">{pendingCount} staff</span>{` ${pendingCount === 1 ? "has" : "have"} an incomplete payroll profile — they can't be paid correctly until salary, shift and policies are set.`}
            </span>
            <button
              onClick={() => { setSetup("PENDING"); setStatus("ALL"); }}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              Show pending setup
            </button>
          </div>
        )}

        {notice && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {notice}
            <button onClick={() => setNotice("")} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
        )}

        {/* Search · Filter · count · Bulk actions */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
              <Search size={15} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff, ID, email, phone…" className="w-full bg-transparent text-sm outline-none" />
            </div>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${filterOpen || activeFilters ? "bg-cyan-50 text-brand-accent" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
            >
              <Filter size={14} /> Filter{activeFilters ? ` (${activeFilters})` : ""}
            </button>
            <span className="text-sm text-gray-500">({rows.length} Staff)</span>
            <div className="relative ml-auto">
              <button
                onClick={() => setBulkOpen((o) => !o)}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-lg border border-brand-accent px-3 py-2 text-sm font-medium text-brand-accent transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
              >
                Bulk Actions <ChevronDown size={14} />
              </button>
              {bulkOpen && (
                <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                  {[
                    { label: "Add Variable Components", on: () => { setBulkOpen(false); setDialog({ kind: "VAR" }); } },
                    { label: "Revise Salary", on: () => { setBulkOpen(false); setDialog({ kind: "REVISE" }); } },
                    { label: "Activate Staff", on: () => changeStatus("ACTIVE") },
                    { label: "Deactivate Staff", on: () => changeStatus("DEACTIVATED") },
                    { label: "Export Selected", on: () => { setBulkOpen(false); exportRowsToCsv("payroll-staff-selected", head, exportRows(selectedMembers)); } },
                  ].map((a) => (
                    <button key={a.label} onClick={a.on} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {filterOpen && (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-3 sm:grid-cols-2 lg:grid-cols-7">
              <label className="block text-xs text-gray-500">Staff Type
                <Select value={payType} onChange={setPayType} options={[{ value: "all", label: "All" }, ...PAY_GROUP_ORDER.map((g) => ({ value: g, label: g }))]} />
              </label>
              <label className="block text-xs text-gray-500">Status
                <Select value={status} onChange={(v) => setStatus(v as StatusFilter)} options={[{ value: "ACTIVE", label: "Active" }, { value: "DEACTIVATED", label: "Deactivated" }, { value: "ALL", label: "All" }]} />
              </label>
              <label className="block text-xs text-gray-500">Profile Setup
                <Select value={setup} onChange={(v) => setSetup(v as SetupFilter)} options={[{ value: "all", label: "All" }, { value: "PENDING", label: "Pending setup" }, { value: "DONE", label: "Fully set up" }]} />
              </label>
              <label className="block text-xs text-gray-500">Posting
                <Select value={posting} onChange={(v) => setPosting(v as PostingFilter)} options={[{ value: "all", label: "All postings" }, { value: "OFFICE", label: "Office" }, { value: "SITE", label: "Site" }]} />
              </label>
              <label className="block text-xs text-gray-500">Department
                <Select value={dept} onChange={setDept} options={[{ value: "all", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]} />
              </label>
              <label className="block text-xs text-gray-500">Group By
                <Select value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} options={[{ value: "SALARY", label: "Salary Type" }, { value: "SHIFT", label: "Shift Template" }, { value: "MANAGER", label: "Reporting Manager" }, { value: "NONE", label: "None" }]} />
              </label>
              <label className="block text-xs text-gray-500">Reporting To
                <Select value={manager} onChange={setManager} options={[{ value: "all", label: "Anyone" }, { value: "me", label: "My team" }, ...managers]} />
              </label>
              <div className="sm:col-span-2 lg:col-span-7">
                <button
                  onClick={() => { setPayType("all"); setStatus("ACTIVE"); setPosting("all"); setDept("all"); setGroupBy("SALARY"); setManager("all"); setSetup("all"); }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  Clear Filter
                </button>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 border-t border-gray-100 px-4 py-2 text-sm text-gray-700">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select All
            {selected.size > 0 && <span className="ml-2 text-xs text-gray-500">{selected.size} out of {rows.length} employees are selected</span>}
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading staff…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : profilesError ? (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{profilesError}</div>
        ) : members.length === 0 ? (
          <PayrollEmpty
            icon={Users}
            title="No one is on payroll yet"
            hint="Add a Member in Settings and tick 'On payroll' to enroll them here."
            action={<Link href="/settings" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Go to Settings</Link>}
          />
        ) : rows.length === 0 ? (
          <PayrollEmpty icon={Users} title="No staff match" hint="Try a different search or filter." />
        ) : (
          <div className="space-y-4">
            {groups.map(({ key, list }) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-600">
                  {key} <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{list.length}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                        <th className="w-10 px-3 py-2" />
                        <SortTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-2" /><SortTh label="Staff ID" sortKey="code" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><SortTh label="Posting" sortKey="posting" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><SortTh label="Department" sortKey="dept" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><SortTh label="Home Site" sortKey="home" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" />
                        <SortTh label="Salary" sortKey="pay" activeKey={sortKey} dir={sortDir} onSort={sortBy} align="right" className="px-3" /><SortTh label="Setup" sortKey="setup" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={sortBy} className="px-3" /><th className="sticky right-0 bg-gray-50" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((m) => {
                        const p = profiles[m.id];
                        const pct = profileProgress(p).percent;
                        const inactive = staffStatusOf(p) === "DEACTIVATED";
                        return (
                          <tr
                            key={m.id}
                            onClick={() => openProfile(m.id)}
                            className={`group cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 hover:bg-cyan-50/40 ${inactive ? "opacity-60" : ""}`}
                          >
                            <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                                  {m.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-800">{m.fullName}</div>
                                  <div className="truncate text-xs text-gray-400">{p?.designation ?? m.email}{m.phoneNumber ? ` · ${m.phoneNumber}` : ""}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">{p?.details?.staffCode ?? `#${m.id}`}</td>
                            <td className="px-3 py-2.5">
                              {m.staffType ? (
                                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${m.staffType === "SITE" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>
                                  {m.staffType === "SITE" ? "Site" : "Office"}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">{m.departmentName ?? "—"}</td>
                            <td className="px-3 py-2.5 text-xs" title="Their leave follows this office/site's approval rule. Set it in the staff profile (Employment).">
                              {homeSites[m.id]?.projectName ? (
                                <span className="text-gray-700">
                                  {homeSites[m.id]!.projectName}
                                  {homeSites[m.id]!.auto && <span className="ml-1 text-gray-400">(auto)</span>}
                                </span>
                              ) : (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Not set</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-gray-800">{payLabel(m)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                                  <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-accent"}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={`text-xs ${pct === 100 ? "text-gray-500" : "font-medium text-amber-700"}`}>{p ? `${pct}%` : "Not set up"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              {inactive && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Deactivated</span>}
                            </td>
                            <td className="sticky right-0 whitespace-nowrap bg-white px-3 py-2.5 text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)] group-hover:bg-cyan-50" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {!profilesLoading && pct < 100 && (
                                  <Link
                                    href={`/payroll/staff/${m.id}/edit`}
                                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${p ? "border border-amber-300 text-amber-700 hover:bg-amber-50" : "bg-brand-accent text-white hover:opacity-90"}`}
                                    title={p ? "Finish the remaining payroll setup steps" : "Create this person's payroll profile"}
                                  >
                                    <Settings2 size={12} /> {p ? "Complete setup" : "Set up profile"}
                                  </Link>
                                )}
                                {p && !ownLock(m.id) && (
                                  <button
                                    onClick={() => setDialog({ kind: "PAY", m })}
                                    className="rounded-lg border border-brand-accent px-3 py-1 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-50"
                                  >
                                    Add Payment
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialog?.kind === "PAY" && (
        <AddPaymentDialog
          userId={dialog.m.id}
          name={dialog.m.fullName}
          onClose={() => setDialog(null)}
          onSaved={() => setNotice(`Payment recorded for ${dialog.m.fullName}.`)}
        />
      )}
      {dialog?.kind === "VAR" && (
        <VariableDialog
          members={selectedMembers.map((m) => ({ id: m.id, name: m.fullName }))}
          onClose={() => setDialog(null)}
          onSaved={() => { setNotice("Variable components added — they apply when the month's payroll is generated."); setSelected(new Set()); }}
        />
      )}
      {dialog?.kind === "REVISE" && (
        <ReviseSalaryDialog
          profiles={selectedMembers.map((m) => profiles[m.id]).filter(Boolean)}
          names={names}
          onClose={() => setDialog(null)}
          onSaved={async () => { setNotice("Salary revised."); setSelected(new Set()); await refreshProfiles(); }}
        />
      )}
      {importing && (
        <StaffImportDialog
          onClose={() => setImporting(false)}
          onImported={async () => { setReload((n) => n + 1); await refreshProfiles(); }}
        />
      )}
    </PayrollShell>
  );
}
