"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { usePayrollStore } from "@/lib/payrollApi";
import { DEPARTMENTS, DESIGNATIONS, STAFF_CATEGORIES } from "@/lib/payrollConfig";
import type { StaffCategory } from "@/lib/payrollConfig";
import { Plus, Trash2, Upload, X } from "lucide-react";

interface Draft {
  name: string;
  phone: string;
  department: string;
  designation: string;
  category: StaffCategory;
  monthly: number;
}

const empty = (): Draft => ({ name: "", phone: "", department: DEPARTMENTS[0], designation: DESIGNATIONS[0], category: "REGULAR", monthly: 0 });

/** Bulk Add Staff — enter several employees in a grid and save them together. */
export default function BulkAddStaffPage() {
  const router = useRouter();
  const addEmployee = usePayrollStore((s) => s.addEmployee);
  const [rows, setRows] = useState<Draft[]>([empty(), empty(), empty()]);
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<Draft>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  function saveAll() {
    const valid = rows.filter((r) => r.name.trim() && r.phone.trim());
    if (valid.length === 0) return setError("Add at least one employee with a name and phone.");
    for (const r of valid) {
      const isWork = r.category === "WORK_BASIS";
      const basic = Math.round(r.monthly * 0.5);
      const hra = Math.round(r.monthly * 0.2);
      addEmployee({
        name: r.name.trim(),
        category: r.category,
        department: r.department,
        designation: r.designation,
        phone: r.phone.trim(),
        email: null,
        joiningDate: new Date().toISOString().slice(0, 10),
        active: true,
        salary: {
          monthlyCtc: isWork ? 0 : r.monthly,
          basic: isWork ? 0 : basic,
          hra: isWork ? 0 : hra,
          otherAllowances: isWork ? 0 : r.monthly - basic - hra,
          workType: isWork ? "DAILY" : null,
          workRate: isWork ? r.monthly : 0,
          pf: r.category === "REGULAR",
          esic: false,
          pt: r.category !== "WORK_BASIS",
        },
        bankAccount: null, ifsc: null, bankName: null, pan: null, userId: null,
      });
    }
    router.push("/payroll/staff");
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Bulk Add Staff</h2>
            <p className="mt-0.5 text-sm text-gray-500">Add multiple employees at once, then save them together.</p>
          </div>
          <button onClick={saveAll} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95">
            <Upload size={15} /> Save All
          </button>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Designation</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2 text-right">Monthly / Rate</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5 text-center text-xs text-gray-400">{i + 1}</td>
                  <td className="px-2 py-1.5"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500" /></td>
                  <td className="px-2 py-1.5"><input value={r.phone} onChange={(e) => setRow(i, { phone: e.target.value })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500" /></td>
                  <td className="px-2 py-1.5">
                    <select value={r.department} onChange={(e) => setRow(i, { department: e.target.value })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500">
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.designation} onChange={(e) => setRow(i, { designation: e.target.value })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500">
                      {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={r.category} onChange={(e) => setRow(i, { category: e.target.value as StaffCategory })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500">
                      {STAFF_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" value={r.monthly} onChange={(e) => setRow(i, { monthly: Number(e.target.value) })} className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500" /></td>
                  <td className="px-1 py-1.5">
                    {rows.length > 1 && (
                      <button onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} className="rounded-md p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"><X size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td colSpan={8} className="px-2 py-2">
                  <button onClick={() => setRows((rs) => [...rs, empty()])} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all hover:border-brand-accent hover:text-brand-accent active:scale-95">
                    <Plus size={12} /> Add Row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <Trash2 size={12} /> Blank rows are skipped on save. Full salary structure and statutory setup can be edited per employee afterwards.
        </p>
      </div>
    </PayrollShell>
  );
}
