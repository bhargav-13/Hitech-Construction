"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { ApiError, bulkEditAttendance } from "@/lib/api";
import type { AttendanceCodeApi, AttendanceEditRequestBody, UserResponse } from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { exportRowsToXlsx } from "@/lib/vyaparExport";
import { Download, FileUp } from "lucide-react";

const CODES = Object.keys(ATTENDANCE_META) as AttendanceCodeApi[];
const HEAD = ["Staff ID", "Name", "Email", "Date (YYYY-MM-DD)", "Status (P/A/HD/PL/L/OD/WO/H)", "In (HH:MM)", "Out (HH:MM)", "OT hours", "Note"];

interface ParsedRow {
  line: number;
  body?: AttendanceEditRequestBody;
  error?: string;
  label: string;
}

/**
 * PagarBook's "Bulk Add Attendance": 1) download the XLSX template (one row per staff for the day),
 * 2) fill it in, 3) upload. Rows are matched to staff by ID or email, validated, previewed, and
 * written in one call.
 */
export function AttendanceImportDialog({
  members,
  defaultDate,
  onClose,
  onImported,
}: {
  members: UserResponse[];
  defaultDate: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function downloadTemplate() {
    exportRowsToXlsx(
      `attendance-template-${defaultDate}`,
      HEAD,
      members.map((m) => [m.id, m.fullName, m.email ?? "", defaultDate, "P", "", "", "", ""]),
    );
  }

  async function onFile(file: File) {
    setError("");
    if (file.size > 20 * 1024 * 1024) { setError("Maximum upload size is 20 MB."); return; }
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, blankrows: false });
      const headerAt = grid.findIndex((r) => String(r[0] ?? "").toLowerCase().includes("staff id"));
      const body = grid.slice(headerAt + 1);
      const byId = new Map(members.map((m) => [String(m.id), m]));
      const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m]));
      setRows(body.map((r, i) => {
        const line = headerAt + i + 2;
        const member = byId.get(String(r[0] ?? "").trim()) ?? byEmail.get(String(r[2] ?? "").trim().toLowerCase());
        const label = member?.fullName ?? String(r[1] ?? `Row ${line}`);
        if (!member) return { line, label, error: "No staff with this ID / email" };
        const date = String(r[3] ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { line, label, error: `Date "${date}" is not YYYY-MM-DD` };
        const code = String(r[4] ?? "").trim().toUpperCase() as AttendanceCodeApi;
        if (!CODES.includes(code)) return { line, label, error: `Unknown status "${r[4] ?? ""}"` };
        const time = (v: unknown) => {
          const t = String(v ?? "").trim();
          return /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : undefined;
        };
        const b: AttendanceEditRequestBody = { userId: member.id, date, code };
        const inT = time(r[5]); const outT = time(r[6]);
        if (inT) b.inTime = inT;
        if (outT) b.outTime = outT;
        if (r[7] !== undefined && String(r[7]).trim() !== "") b.overtimeHours = Number(r[7]) || 0;
        if (r[8]) b.note = String(r[8]).trim();
        return { line, label, body: b };
      }));
    } catch {
      setError("That file could not be read — use the downloaded .xlsx template.");
    }
  }

  const ok = rows?.filter((r) => r.body) ?? [];
  const bad = rows?.filter((r) => r.error) ?? [];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await bulkEditAttendance(ok.map((r) => r.body!));
      await onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="border-b border-gray-100 px-5 py-4 pr-12">
        <h3 className="text-base font-semibold text-gray-800">Add attendance for multiple employees</h3>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">1</span>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Download Template</div>
            <p className="text-xs text-gray-500">One row per staff member for {defaultDate}. Keep the column order intact.</p>
          </div>
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Download Template
          </button>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-brand-accent">2</span>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Upload your filled sheet</div>
            <p className="text-xs text-gray-500">Supported: xls, xlsx · max 20 MB.</p>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 hover:bg-gray-50">
              <FileUp size={16} /> Choose a file to upload
              <input type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {rows && (
          <div className="rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 text-xs">
              <span className="font-medium text-emerald-700">{ok.length} ready</span>
              {bad.length > 0 && <span className="font-medium text-rose-600">{bad.length} with errors (skipped)</span>}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.line} className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 text-xs last:border-b-0">
                  <span className="text-gray-700">#{r.line} · {r.label}</span>
                  {r.error ? (
                    <span className="text-rose-600">{r.error}</span>
                  ) : (
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${ATTENDANCE_META[r.body!.code!].className}`}>{r.body!.code} · {r.body!.date}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">Cancel</button>
        <button onClick={submit} disabled={busy || ok.length === 0} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <Spinner size={14} />} Import {ok.length || ""} row{ok.length === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}
