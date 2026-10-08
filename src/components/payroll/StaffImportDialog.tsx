"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { ApiError, createUser, getRoles, savePayrollProfile } from "@/lib/api";
import type { PayrollProfileRequest, RoleResponse } from "@/lib/api";
import { getDepartments } from "@/lib/departmentsApi";
import type { Department } from "@/lib/departmentsApi";
import { defaultStaffRoleId } from "@/lib/payrollUsers";
import { exportRowsToXlsx } from "@/lib/vyaparExport";
import { Download, FileUp } from "lucide-react";

const HEAD = [
  "Name *", "Phone", "Staff ID", "Department", "Posting (OFFICE/SITE)", "Designation", "Joining date (YYYY-MM-DD)",
  "Salary type (MONTHLY/DAILY/HOURLY/PIECE)", "Salary (₹ per month / day / hour / piece)", "PAN", "Bank name", "IFSC", "Account number",
];
const TYPES = ["MONTHLY", "DAILY", "HOURLY", "PIECE"] as const;

interface Row {
  line: number;
  name: string;
  phone: string;
  staffCode: string;
  departmentId: number | null;
  posting: "OFFICE" | "SITE" | null;
  designation: string;
  joiningDate: string | null;
  type: (typeof TYPES)[number];
  salary: number;
  pan: string;
  bankName: string;
  ifsc: string;
  account: string;
  error?: string;
  status?: "done" | "failed";
  message?: string;
}

/**
 * PagarBook's "Add Staff in Bulk": download the XLSX template, fill one row per person, upload.
 * Each row becomes a Member on payroll (no login — one can be given later in Settings) with a
 * payroll profile carrying the salary, joining date and bank details.
 */
export function StaffImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void | Promise<void> }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => setDepartments([]));
    getRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  function downloadTemplate() {
    exportRowsToXlsx("staff-import-template", HEAD, [
      ["Ramesh Kumar", "9876543210", "EMP101", departments[0]?.name ?? "", "SITE", "Mason", "2026-10-01", "DAILY", 800, "", "", "", ""],
    ]);
  }

  async function onFile(file: File) {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, blankrows: false });
      const headerAt = grid.findIndex((r) => String(r[0] ?? "").toLowerCase().startsWith("name"));
      const body = grid.slice(headerAt + 1).filter((r) => r.some((c) => String(c ?? "").trim()));
      const deptByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));
      setRows(body.map((r, i) => {
        const cell = (n: number) => String(r[n] ?? "").trim();
        const type = (cell(7).toUpperCase() || "MONTHLY") as Row["type"];
        const postingRaw = cell(4).toUpperCase();
        const row: Row = {
          line: headerAt + 2 + i,
          name: cell(0), phone: cell(1), staffCode: cell(2),
          departmentId: cell(3) ? deptByName.get(cell(3).toLowerCase()) ?? null : null,
          posting: postingRaw === "SITE" || postingRaw === "OFFICE" ? postingRaw : null,
          designation: cell(5), joiningDate: cell(6) || null, type,
          salary: Number(cell(8).replace(/[,₹\s]/g, "")) || 0,
          pan: cell(9).toUpperCase(), bankName: cell(10), ifsc: cell(11).toUpperCase(), account: cell(12),
        };
        if (!row.name) row.error = "Name is missing";
        else if (!TYPES.includes(type)) row.error = `Salary type must be one of ${TYPES.join(", ")}`;
        else if (row.joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.joiningDate)) row.error = "Joining date must be YYYY-MM-DD";
        else if (cell(3) && row.departmentId == null) row.error = `Unknown department "${cell(3)}"`;
        else if (row.phone && !/^\d{10}$/.test(row.phone.replace(/\D/g, "").slice(-10))) row.error = "Phone should be 10 digits";
        return row;
      }));
    } catch {
      setError("Couldn't read that file — use the template (.xlsx).");
    }
  }

  async function importAll() {
    if (!rows) return;
    const roleId = defaultStaffRoleId(roles);
    if (!roleId) { setError("No role to give new members — create one in Settings first."); return; }
    setBusy(true);
    setError("");
    const out = [...rows];
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (r.error || r.status === "done") continue;
      try {
        const user = await createUser({
          isLoginUser: false, fullName: r.name, phoneNumber: r.phone.replace(/\D/g, "").slice(-10) || undefined,
          roleId, departmentId: r.departmentId, staffType: r.posting, onPayroll: true,
        });
        const monthly = r.type === "MONTHLY";
        const profile: PayrollProfileRequest = {
          userId: user.id,
          category: r.type === "PIECE" ? "WORK_BASIS" : "REGULAR",
          designation: r.designation || null,
          joiningDate: r.joiningDate,
          salary: {
            monthlyCtc: monthly ? r.salary : 0, basic: monthly ? Math.round(r.salary * 0.5) : 0, hra: 0,
            otherAllowances: monthly ? r.salary - Math.round(r.salary * 0.5) : 0,
            workType: r.type === "MONTHLY" ? null : r.type, workRate: monthly ? 0 : r.salary,
            salaryBasis: "SHIFT", pf: false, esic: false, pt: false,
          },
          bankAccount: r.account || null, ifsc: r.ifsc || null, bankName: r.bankName || null, pan: r.pan || null,
          documents: null, components: null, shiftId: null, holidayPolicyId: null, leavePolicyId: null,
          details: r.staffCode ? {
            staffCode: r.staffCode, reportingManagerId: null, probationDays: null, uan: null, pfNumber: null, esiNumber: null,
            upiId: null, accountHolder: null, gender: null, dateOfBirth: null, bloodGroup: null, maritalStatus: null,
            emergencyContact: null, fatherName: null, currentAddress: null, permanentAddress: null, salaryAccess: true,
            staffStatus: "ACTIVE", openingLeave: null,
          } : null,
        };
        await savePayrollProfile(profile);
        out[i] = { ...r, status: "done", message: "Added" };
      } catch (err) {
        out[i] = { ...r, status: "failed", message: err instanceof ApiError ? err.message : "Failed" };
      }
      setRows([...out]);
    }
    setBusy(false);
    await onImported();
  }

  const valid = rows?.filter((r) => !r.error && r.status !== "done").length ?? 0;
  const done = rows?.filter((r) => r.status === "done").length ?? 0;

  return (
    <Modal onClose={onClose} wide>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">Import Staff from Excel</h3>
        <p className="text-xs text-gray-500">One row per person. They are added as members on payroll, without a login.</p>
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> 1. Download template
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <FileUp size={14} /> 2. Upload filled file
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </label>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {rows && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Salary</th><th className="px-3 py-2">Result</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                    <td className="px-3 py-1.5 text-gray-800">{r.name || "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.type}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{r.salary.toLocaleString("en-IN")}</td>
                    <td className={`px-3 py-1.5 text-xs ${r.error || r.status === "failed" ? "text-rose-600" : r.status === "done" ? "text-emerald-700" : "text-gray-500"}`}>
                      {r.error ?? r.message ?? "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
        {done > 0 && <span className="mr-auto text-xs text-emerald-700">{done} added</span>}
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Close</button>
        <button onClick={importAll} disabled={busy || valid === 0} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <Spinner size={14} />} Import {valid || ""} staff
        </button>
      </div>
    </Modal>
  );
}
