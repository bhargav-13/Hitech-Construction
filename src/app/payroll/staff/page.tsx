"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { StaffLoginDialog } from "@/components/payroll/StaffLoginDialog";
import { UserPickerDialog } from "@/components/payroll/UserPickerDialog";
import { usePayrollStore } from "@/lib/payrollApi";
import type { Employee } from "@/lib/payrollApi";
import { STAFF_CATEGORIES, DEPARTMENTS, categoryConfig } from "@/lib/payrollConfig";
import type { StaffCategory } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import { exportRowsToCsv, downloadPdf } from "@/lib/vyaparExport";
import { FileSpreadsheet, FileText, KeyRound, Link2, Power, Search, ShieldCheck, Unlink, UserPlus, Users } from "lucide-react";

const CATEGORY_BADGE: Record<StaffCategory, string> = {
  REGULAR: "bg-cyan-50 text-brand-accent",
  CONTRACTOR: "bg-amber-50 text-amber-700",
  WORK_BASIS: "bg-violet-50 text-violet-700",
};

/** Staff List — search, filter, bulk select, and per-employee actions. */
export default function StaffListPage() {
  const employees = usePayrollStore((s) => s.employees);
  const updateEmployee = usePayrollStore((s) => s.updateEmployee);
  const linkUser = usePayrollStore((s) => s.linkUser);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [cat, setCat] = useState<"all" | StaffCategory>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loginFor, setLoginFor] = useState<Employee | null>(null);
  const [pickUser, setPickUser] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (dept !== "all" && e.department !== dept) return false;
      if (cat !== "all" && e.category !== cat) return false;
      if (!q) return true;
      return [e.name, e.staffId, e.designation, e.phone].some((f) => f?.toLowerCase().includes(q));
    });
  }, [employees, search, dept, cat]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const monthlyPay = (e: Employee) =>
    e.category === "WORK_BASIS" ? e.salary.workRate : e.salary.monthlyCtc;

  const head = ["Name", "Staff ID", "Category", "Department", "Designation", "Phone", "Monthly / Rate"];
  const data = rows.map((e) => [e.name, e.staffId, categoryConfig(e.category).title, e.department, e.designation, e.phone, monthlyPay(e)]);

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Staff</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {employees.filter((e) => e.active).length} active · {employees.length} total employees
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportRowsToCsv("staff", head, data)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
            <button
              onClick={() => downloadPdf("Staff List", head, rows.map((e) => [e.name, e.staffId, categoryConfig(e.category).title, e.department, e.designation, e.phone, inr(monthlyPay(e))]), { rightAlignFrom: 6 })}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <FileText size={14} /> PDF
            </button>
            <button
              onClick={() => setPickUser(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
              title="Turn an existing ERP user into a staff member"
            >
              <Link2 size={14} /> From User
            </button>
            <Link
              href="/payroll/staff/add"
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <UserPlus size={15} /> Add Staff
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
            <Search size={15} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, staff ID, phone…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="w-44">
            <Select
              value={cat}
              onChange={(v) => setCat(v as "all" | StaffCategory)}
              options={[{ value: "all", label: "All categories" }, ...STAFF_CATEGORIES.map((c) => ({ value: c.key, label: c.title }))]}
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

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm">
            <span className="font-medium text-brand-accent">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { selected.forEach((id) => updateEmployee(id, { active: false })); setSelected(new Set()); }}
                className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-200 transition-colors hover:bg-rose-50"
              >
                Deactivate
              </button>
              <button
                onClick={() => { selected.forEach((id) => updateEmployee(id, { active: true })); setSelected(new Set()); }}
                className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50"
              >
                Activate
              </button>
              <button onClick={() => setSelected(new Set())} className="rounded-md px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <PayrollEmpty
            icon={Users}
            title="No staff match"
            hint="Try a different search or filter, or add your first employee."
            action={<Link href="/payroll/staff/add" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add Staff</Link>}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                  <th className="w-10 px-4 py-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-cyan-600" aria-label="Select all" />
                  </th>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Designation</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly / Rate</th>
                  <th className="px-4 py-2 font-medium">Login</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-10 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} className="accent-cyan-600" aria-label={`Select ${e.name}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">
                          {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800">{e.name}</div>
                          <div className="text-xs text-gray-400">{e.staffId} · {e.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[e.category]}`}>{categoryConfig(e.category).title}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{e.department}</td>
                    <td className="px-4 py-2.5 text-gray-600">{e.designation}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                      {e.category === "WORK_BASIS" ? `${inr(e.salary.workRate)}/${e.salary.workType === "HOURLY" ? "hr" : "day"}` : inr(e.salary.monthlyCtc)}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.userId != null ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-xs font-medium text-brand-accent" title="This employee can log in">
                          <ShieldCheck size={12} /> Login
                        </span>
                      ) : (
                        <button onClick={() => setLoginFor(e)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 transition-colors hover:border-brand-accent hover:text-brand-accent">
                          <KeyRound size={11} /> Create
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex">
                        <RowMenu align="right" buttonLabel={`Actions for ${e.name}`}>
                          {(close) => (
                            <>
                              {e.userId == null ? (
                                <RowMenuItem icon={KeyRound} label="Create / link login" onClick={() => { close(); setLoginFor(e); }} />
                              ) : (
                                <RowMenuItem icon={Unlink} label="Unlink login" tone="warning" onClick={() => { close(); linkUser(e.id, null); }} />
                              )}
                              <RowMenuItem icon={Power} label={e.active ? "Deactivate" : "Activate"} tone={e.active ? "warning" : "default"} onClick={() => { close(); updateEmployee(e.id, { active: !e.active }); }} />
                              <RowMenuDivider />
                              <RowMenuItem icon={FileText} label="Salary slip (PDF)" onClick={() => { close(); downloadPdf(`${e.name} — Details`, ["Field", "Value"], [["Staff ID", e.staffId], ["Category", categoryConfig(e.category).title], ["Department", e.department], ["Designation", e.designation], ["Monthly CTC", inr(e.salary.monthlyCtc)], ["Basic", inr(e.salary.basic)], ["HRA", inr(e.salary.hra)]]); }} />
                            </>
                          )}
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loginFor && <StaffLoginDialog employee={loginFor} onClose={() => setLoginFor(null)} />}
      {pickUser && <UserPickerDialog onClose={() => setPickUser(false)} />}
    </PayrollShell>
  );
}
