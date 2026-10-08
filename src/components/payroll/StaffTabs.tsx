"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { StatCard } from "@/components/payroll/PayrollShell";
import { DayActions } from "@/components/payroll/AttendanceActions";
import type { LeaveChoice } from "@/components/payroll/AttendanceActions";
import { AddPaymentDialog, ReviseSalaryDialog, cycleOptions } from "@/components/payroll/PayrollDialogs";
import {
  ApiError, addWorkLogApi, deletePaymentApi, deleteWorkLogApi, getLoansApi, getMemberAttendance,
  getMemberPayslips, getPaymentsApi, getWorkItemsApi, getWorkLogsApi, loanActionApi, memberLeave, savePayrollProfile,
} from "@/lib/api";
import type {
  AttendanceApiResponse, LeaveRequestApi, LoanApi, PaymentApi, PayrollProfileResponse, PayslipApi,
  StaffDetailsApi, UserResponse, WorkItemApi, WorkLogApi,
} from "@/lib/api";
import { ATTENDANCE_META } from "@/lib/payrollConfig";
import { decodeComponents, componentAmount, basicAmount, CALC_LABEL } from "@/lib/salaryComponents";
import { downloadPayslip, leaveSummary } from "@/lib/payslipExport";
import { parseCustomValues, usePayrollSetting } from "@/lib/payrollSettings";
import { formatDateIST, todayIST } from "@/lib/datetime";
import { inr } from "@/lib/format";
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/vyapar/SortTh";
import { PunchPhotoThumbs } from "@/components/payroll/PunchPhotos";
import { previewFile } from "@/lib/filePreview";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

function useMonth() {
  const [key, setKey] = useState(todayIST().slice(0, 7));
  const step = (d: number) => {
    const [y, m] = key.split("-").map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    setKey(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`);
  };
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { key, step, from: `${key}-01`, to: `${key}-${pad(last)}`, last };
}

function MonthSwitch({ label, step }: { label: string; step: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
      <button onClick={() => step(-1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
      <span className="min-w-[120px] px-2 text-center text-sm font-semibold text-gray-700">{label}</span>
      <button onClick={() => step(1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">{text}</div>;
}

function ErrorLine({ text }: { text: string }) {
  return text ? <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{text}</div> : null;
}

// Stable empty lists and sort accessors for the tab tables.
const NONE_PAY: PaymentApi[] = [];
const NONE_LEAVE: LeaveRequestApi[] = [];
const NONE_WORK: WorkLogApi[] = [];
const PAY_SORT = {
  date: (p: PaymentApi) => p.recordDate,
  cycle: (p: PaymentApi) => p.month,
  category: (p: PaymentApi) => p.category,
  mode: (p: PaymentApi) => p.mode,
  description: (p: PaymentApi) => p.description ?? "",
  amount: (p: PaymentApi) => Number(p.amount),
};
const LEAVE_SORT = {
  type: (r: LeaveRequestApi) => r.leaveTypeName,
  from: (r: LeaveRequestApi) => r.fromDate,
  to: (r: LeaveRequestApi) => r.toDate,
  days: (r: LeaveRequestApi) => Number(r.days),
  status: (r: LeaveRequestApi) => r.status,
};
const WORK_SORT = {
  date: (r: WorkLogApi) => r.date,
  item: (r: WorkLogApi) => r.itemName,
  units: (r: WorkLogApi) => Number(r.units),
  rate: (r: WorkLogApi) => Number(r.rate),
  amount: (r: WorkLogApi) => Number(r.amount),
};

// ======================= Profile =======================

const EMPTY_DETAILS: StaffDetailsApi = {
  staffCode: null, reportingManagerId: null, probationDays: null, uan: null, pfNumber: null, esiNumber: null,
  upiId: null, accountHolder: null, gender: null, dateOfBirth: null, bloodGroup: null, maritalStatus: null,
  emergencyContact: null, fatherName: null, currentAddress: null, permanentAddress: null, salaryAccess: true,
  staffStatus: "ACTIVE", openingLeave: null,
};

type FieldDef = { key: keyof StaffDetailsApi | "designation" | "joiningDate" | "bankName" | "ifsc" | "bankAccount" | "pan"; label: string; type?: "date" | "number" | "select" | "textarea"; options?: string[] };

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Profile Information",
    fields: [
      { key: "staffCode", label: "Staff ID" },
      { key: "designation", label: "Designation" },
      { key: "reportingManagerId", label: "Reporting Manager", type: "select" },
    ],
  },
  {
    title: "Personal Information",
    fields: [
      { key: "gender", label: "Gender", type: "select", options: ["MALE", "FEMALE", "OTHER"] },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "bloodGroup", label: "Blood Group", type: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { key: "maritalStatus", label: "Marital Status", type: "select", options: ["SINGLE", "MARRIED", "OTHER"] },
      { key: "emergencyContact", label: "Emergency Contact" },
      { key: "fatherName", label: "Father's Name" },
      { key: "currentAddress", label: "Current Address", type: "textarea" },
      { key: "permanentAddress", label: "Permanent Address", type: "textarea" },
    ],
  },
  {
    title: "Employment Information",
    fields: [
      { key: "joiningDate", label: "Date of Joining", type: "date" },
      { key: "probationDays", label: "Probation Period (Days)", type: "number" },
      { key: "uan", label: "UAN" },
      { key: "pan", label: "PAN Number" },
      { key: "pfNumber", label: "PF Number" },
      { key: "esiNumber", label: "ESI Number" },
    ],
  },
  {
    title: "Bank Details",
    fields: [
      { key: "bankName", label: "Name of Bank" },
      { key: "ifsc", label: "IFSC Code" },
      { key: "bankAccount", label: "Account Number" },
      { key: "accountHolder", label: "Name of Account Holder" },
      { key: "upiId", label: "UPI ID" },
    ],
  },
];

const TOP_LEVEL = new Set(["designation", "joiningDate", "bankName", "ifsc", "bankAccount", "pan"]);

export function ProfileTab({
  member, profile, people, onSaved,
}: {
  member: UserResponse; profile: PayrollProfileResponse | undefined; people: UserResponse[]; onSaved: (p: PayrollProfileResponse) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const details = { ...EMPTY_DETAILS, ...(profile?.details ?? {}) };

  const valueOf = (key: string): string => {
    if (!profile) return "";
    const raw = TOP_LEVEL.has(key) ? (profile as unknown as Record<string, unknown>)[key] : (details as unknown as Record<string, unknown>)[key];
    return raw == null ? "" : String(raw);
  };
  const display = (f: FieldDef): string => {
    const v = valueOf(f.key);
    if (!v) return "—";
    if (f.key === "reportingManagerId") return people.find((p) => String(p.id) === v)?.fullName ?? `#${v}`;
    if (f.type === "date") return formatDateIST(v);
    return v;
  };
  const probationEnd = (() => {
    const j = profile?.joiningDate; const d = details.probationDays;
    if (!j || !d) return null;
    const dt = new Date(`${j}T00:00:00`); dt.setDate(dt.getDate() + d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  })();

  function start(title: string, fields: FieldDef[]) {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, valueOf(f.key)])));
    setEditing(title);
    setError("");
  }

  async function save(fields: FieldDef[]) {
    if (!profile) return;
    setBusy(true); setError("");
    try {
      const next: PayrollProfileResponse = { ...profile, details: { ...details } };
      for (const f of fields) {
        const v = (draft[f.key] ?? "").trim();
        if (TOP_LEVEL.has(f.key)) (next as unknown as Record<string, unknown>)[f.key] = v || null;
        else (next.details as unknown as Record<string, unknown>)[f.key] =
          f.type === "number" || f.key === "reportingManagerId" ? (v ? Number(v) : null) : v || null;
      }
      onSaved(await savePayrollProfile(next));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccess() {
    if (!profile) return;
    onSaved(await savePayrollProfile({ ...profile, details: { ...details, salaryAccess: !details.salaryAccess } }));
  }

  if (!profile) {
    return (
      <Empty text="No payroll profile yet — use “Edit Salary & Policies” to set one up." />
    );
  }

  return (
    <div className="space-y-4">
      <ErrorLine text={error} />
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-800">General Information</div>
            <p className="text-xs text-gray-500">Shift, holiday and leave policies, staff type and salary are set in the payroll profile.</p>
          </div>
          <Link href={`/payroll/staff/${member.id}/edit`} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            <Pencil size={13} /> Edit Salary & Policies
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="Email" value={member.email ?? "—"} />
          <Info label="Contact Number" value={member.phoneNumber ?? "—"} />
          <Info label="Department" value={member.departmentName ?? "—"} />
          <Info label="Posting" value={member.staffType === "SITE" ? "Site" : member.staffType === "OFFICE" ? "Office" : "—"} />
          <Info label="Probation End Date" value={probationEnd ? formatDateIST(probationEnd) : "—"} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">Salary Access (self-service payslips)</span>
            <button
              role="switch"
              aria-checked={!!details.salaryAccess}
              onClick={toggleAccess}
              className={`relative h-5 w-9 rounded-full transition-colors ${details.salaryAccess ? "bg-brand-accent" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${details.salaryAccess ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.title} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{sec.title}</span>
            {editing === sec.title ? (
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-800">Cancel</button>
                <button onClick={() => save(sec.fields)} disabled={busy} className="rounded-lg bg-brand-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
              </div>
            ) : (
              <button onClick={() => start(sec.title, sec.fields)} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"><Pencil size={12} /> Edit</button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            {sec.fields.map((f) => editing === sec.title ? (
              <label key={f.key} className={`block ${f.type === "textarea" ? "sm:col-span-3" : ""}`}>
                <span className="mb-1 block text-xs text-gray-500">{f.label}</span>
                {f.type === "date" ? (
                  <DatePicker value={draft[f.key] ?? ""} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                ) : f.type === "textarea" ? (
                  <textarea rows={2} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className="input w-full resize-none" />
                ) : f.type === "select" ? (
                  <Select
                    value={draft[f.key] ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    options={[
                      { value: "", label: "—" },
                      ...(f.key === "reportingManagerId"
                        ? people.filter((p) => p.id !== member.id).map((p) => ({ value: String(p.id), label: p.fullName }))
                        : (f.options ?? []).map((o) => ({ value: o, label: o }))),
                    ]}
                  />
                ) : (
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="input w-full"
                  />
                )}
              </label>
            ) : (
              <Info key={f.key} label={f.label} value={display(f)} wide={f.type === "textarea"} />
            ))}
          </div>
        </div>
      ))}
      <TaxCard profile={profile} onSaved={onSaved} />
      <CustomFieldsCard profile={profile} onSaved={onSaved} />
    </div>
  );
}

/** Income tax: the deductor profile, regime and the TDS deducted every month in the run. */
function TaxCard({ profile, onSaved }: { profile: PayrollProfileResponse; onSaved: (p: PayrollProfileResponse) => void }) {
  const { value: taxProfiles } = usePayrollSetting("TAX_PROFILES");
  const d = { ...EMPTY_DETAILS, ...(profile.details ?? {}) };
  const [editing, setEditing] = useState(false);
  const [taxProfileId, setTaxProfileId] = useState(d.taxProfileId ?? "");
  const [regime, setRegime] = useState<string>(d.taxRegime ?? "NEW");
  const [tds, setTds] = useState(d.monthlyTds != null ? String(d.monthlyTds) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      onSaved(await savePayrollProfile({
        ...profile,
        details: { ...d, taxProfileId: taxProfileId || "", taxRegime: (regime as "OLD" | "NEW") || null, monthlyTds: Number(tds) || 0 },
      }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  const tp = taxProfiles.find((t) => t.id === d.taxProfileId);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Income Tax (TDS)</span>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-800">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-brand-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"><Pencil size={12} /> Edit</button>
        )}
      </div>
      <ErrorLine text={error} />
      {editing ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Tax profile</span>
            <Select value={taxProfileId} onChange={setTaxProfileId} options={[{ value: "", label: "—" }, ...taxProfiles.map((t) => ({ value: t.id, label: t.profileName }))]} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Tax regime</span>
            <Select value={regime} onChange={setRegime} options={[{ value: "NEW", label: "New regime" }, { value: "OLD", label: "Old regime" }]} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Monthly TDS (₹)</span>
            <input type="number" min={0} value={tds} onChange={(e) => setTds(e.target.value)} className="input w-full" placeholder="0" />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Info label="Tax profile" value={tp?.profileName ?? "—"} />
          <Info label="Tax regime" value={d.taxRegime === "OLD" ? "Old regime" : d.taxRegime === "NEW" ? "New regime" : "—"} />
          <Info label="Monthly TDS" value={d.monthlyTds ? `${inr(Number(d.monthlyTds))} — deducted in every payroll` : "—"} />
        </div>
      )}
    </div>
  );
}

/** The org's custom staff fields (Setup → Custom Staff Fields). Hidden until some are defined. */
function CustomFieldsCard({ profile, onSaved }: { profile: PayrollProfileResponse; onSaved: (p: PayrollProfileResponse) => void }) {
  const { value: defs } = usePayrollSetting("CUSTOM_FIELDS");
  const d = { ...EMPTY_DETAILS, ...(profile.details ?? {}) };
  const values = parseCustomValues(d.customFields);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (defs.length === 0) return null;

  async function save() {
    setBusy(true); setError("");
    try {
      const clean = Object.fromEntries(Object.entries({ ...values, ...draft }).filter(([, v]) => v.trim()));
      onSaved(await savePayrollProfile({ ...profile, details: { ...d, customFields: JSON.stringify(clean) } }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Other Details</span>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-800">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-brand-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(values); setEditing(true); }} className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"><Pencil size={12} /> Edit</button>
        )}
      </div>
      <ErrorLine text={error} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
        {defs.map((f) => editing ? (
          <label key={f.id} className="block">
            <span className="mb-1 block text-xs text-gray-500">{f.label}</span>
            {f.type === "DATE" ? (
              <DatePicker value={draft[f.id] ?? ""} onChange={(v) => setDraft((x) => ({ ...x, [f.id]: v }))} />
            ) : f.type === "DROPDOWN" ? (
              <Select value={draft[f.id] ?? ""} onChange={(v) => setDraft((x) => ({ ...x, [f.id]: v }))} options={[{ value: "", label: "—" }, ...f.options.map((o) => ({ value: o, label: o }))]} />
            ) : (
              <input type={f.type === "NUMBER" ? "number" : "text"} value={draft[f.id] ?? ""} onChange={(e) => setDraft((x) => ({ ...x, [f.id]: e.target.value }))} className="input w-full" />
            )}
          </label>
        ) : (
          <Info key={f.id} label={f.label} value={values[f.id] ? (f.type === "DATE" ? formatDateIST(values[f.id]) : values[f.id]) : "—"} />
        ))}
      </div>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-3" : ""}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="whitespace-pre-line text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}

// ======================= Attendance =======================

export function AttendanceTab({ member, leaveTypes }: { member: UserResponse; leaveTypes: LeaveChoice[] }) {
  const mon = useMonth();
  const [rows, setRows] = useState<AttendanceApiResponse[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setRows(await getMemberAttendance(member.id, mon.from, mon.to)); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load attendance."); setRows([]); }
  }, [member.id, mon.from, mon.to]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const byDate = useMemo(() => new Map((rows ?? []).map((r) => [r.date, r])), [rows]);
  const today = todayIST();
  // Days of the month up to today, newest first — PagarBook's daily attendance view.
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = mon.last; d >= 1; d--) {
      const key = `${mon.key}-${pad(d)}`;
      if (key <= today) out.push(key);
    }
    return out;
  }, [mon.key, mon.last, today]);

  const s = useMemo(() => {
    const t = { present: 0, absent: 0, half: 0, leave: 0, in: 0, out: 0, ot: 0, fine: 0 };
    for (const r of rows ?? []) {
      if (r.code === "P" || r.code === "OD") t.present++;
      else if (r.code === "A" || r.code === "L") t.absent++;
      else if (r.code === "HD") t.half++;
      else if (r.code === "PL") t.leave++;
      if (r.inTime) t.in++;
      if (r.outTime) t.out++;
      t.ot += Number(r.otAmount ?? 0);
      t.fine += Number(r.fineAmount ?? 0);
    }
    return t;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitch label={monthLabel(mon.key)} step={mon.step} />
        <Link href={`/payroll/attendance/${member.id}`} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <CalendarDays size={14} /> Calendar View
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Days" value={days.length} />
        <StatCard label="Present" value={s.present} accent="green" />
        <StatCard label="Absent" value={s.absent} accent="rose" />
        <StatCard label="Half Day" value={s.half} accent="amber" />
        <StatCard label="Leave" value={s.leave} accent="blue" />
        <StatCard label="Punched In" value={s.in} accent="cyan" />
        <StatCard label="Overtime ₹" value={inr(s.ot)} accent="green" />
        <StatCard label="Fine ₹" value={inr(s.fine)} accent="rose" />
      </div>
      <ErrorLine text={error} />
      {rows === null ? <Loading /> : days.length === 0 ? <Empty text="Nothing to show for a future month." /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <tbody>
              {days.map((d) => {
                const r = byDate.get(d);
                const dt = new Date(`${d}T00:00:00`);
                return (
                  <tr key={d} className="border-b border-gray-50 last:border-b-0">
                    <td className="w-32 px-4 py-2.5">
                      <div className="font-medium text-gray-800">{pad(dt.getDate())} {MONTHS[dt.getMonth()].slice(0, 3)}</div>
                      <div className="text-xs text-gray-400">{dt.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                    </td>
                    <td className="w-40 px-3 py-2.5 text-xs text-gray-600">
                      {r && r.code !== "NM" ? (
                        <span className={`rounded px-1.5 py-0.5 font-medium ${ATTENDANCE_META[r.code].className}`}>{ATTENDANCE_META[r.code].label}</span>
                      ) : <span className="text-gray-400">Not Marked</span>}
                      {r?.inTime && <div className="mt-1 text-gray-500">{r.inTime} – {r.outTime ?? "--"}{r.workedHours != null ? ` · ${Number(r.workedHours).toFixed(2)} h` : ""}</div>}
                      {r && <div className="mt-1"><PunchPhotoThumbs row={r} name={member.fullName} size={22} /></div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <DayActions target={{ userId: member.id, name: member.fullName, date: d, row: r }} leaveTypes={leaveTypes} onSaved={load} onError={setError} compact />
                      {r?.note && <div className="mt-1 text-[11px] text-gray-500">📝 {r.note}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ======================= Salary Overview =======================

export function SalaryOverviewTab({ member, profile }: { member: UserResponse; profile: PayrollProfileResponse | undefined }) {
  const [slips, setSlips] = useState<PayslipApi[] | null>(null);
  const [payments, setPayments] = useState<PaymentApi[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([getMemberPayslips(member.id), getPaymentsApi({ userId: member.id })])
      .then(([s, p]) => { setSlips(s); setPayments(p); })
      .catch((err) => { setError(err instanceof ApiError ? err.message : "Unable to load salary."); setSlips([]); });
  }, [member.id]);

  const paidFor = (month: string | null) => payments
    .filter((p) => p.month === month && p.category === "SALARY")
    .reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div className="space-y-3">
      <ErrorLine text={error} />
      {slips === null ? <Loading /> : slips.length === 0 ? <Empty text="No payroll has been generated for this staff member yet." /> : slips.map((s) => {
        const paid = paidFor(s.month);
        const due = Math.max(0, Number(s.net) - paid);
        const ded = Number(s.gross) - Number(s.net) + Number(s.reimbursements);
        return (
          <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  {s.month ? monthLabel(s.month) : "—"}
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${s.payStatus === "PAID" ? "bg-emerald-50 text-emerald-700" : s.holdStatus ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {s.payStatus === "PAID" ? "Paid" : s.holdStatus === "HOLD" ? "On hold" : s.holdStatus === "STOP" ? "Stopped" : "Pending"}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{Number(s.payableDays)} payable days of {s.totalDays}{Number(s.lopDays ?? 0) > 0 ? ` · LOP ${Number(s.lopOverride ?? s.lopDays)}` : ""}</div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right"><div className="text-xs text-gray-500">Gross</div><div className="font-medium">{inr(s.gross)}</div></div>
                <div className="text-right"><div className="text-xs text-gray-500">Deductions</div><div className="font-medium text-rose-600">−{inr(ded)}</div></div>
                <div className="text-right"><div className="text-xs text-gray-500">Net Payable</div><div className="font-semibold">{inr(s.net)}</div></div>
                <div className="text-right"><div className="text-xs text-gray-500">Due Amount</div><div className={`font-semibold ${due > 0 ? "text-amber-600" : "text-emerald-600"}`}>{inr(due)}</div></div>
                <button onClick={() => downloadPayslip(s, member.fullName, { member, profile })} title="Download salary slip" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-brand-accent">
                  <Download size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4 lg:grid-cols-6">
              {Number(s.otAmount ?? 0) > 0 && <span>Overtime +{inr(Number(s.otAmount))}</span>}
              {Number(s.workAmount ?? 0) > 0 && <span>Piece work +{inr(Number(s.workAmount))}</span>}
              {Number(s.variableEarnings ?? 0) > 0 && <span>One-off earnings +{inr(Number(s.variableEarnings))}</span>}
              {Number(s.pf) > 0 && <span>PF −{inr(s.pf)}</span>}
              {Number(s.esic) > 0 && <span>ESIC −{inr(s.esic)}</span>}
              {Number(s.pt) > 0 && <span>PT −{inr(s.pt)}</span>}
              {Number(s.fineAmount ?? 0) > 0 && <span>Fines −{inr(Number(s.fineAmount))}</span>}
              {Number(s.advanceDeduction ?? 0) > 0 && <span>Advance −{inr(Number(s.advanceDeduction))}</span>}
              {Number(s.tds ?? 0) > 0 && <span>TDS −{inr(Number(s.tds))}</span>}
              {Number(s.loanEmi) > 0 && <span>Loan EMI −{inr(s.loanEmi)}</span>}
              {Number(s.reimbursements) > 0 && <span>Reimbursements +{inr(s.reimbursements)}</span>}
              <span>Less: salary payment {inr(paid)}</span>
            </div>
            {(leaveSummary(s) || s.claimDetail) && (
              <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs">
                {leaveSummary(s) && <div><span className="text-gray-400">Leave:</span> <span className="text-gray-700">{leaveSummary(s)}</span></div>}
                {s.claimDetail && <div><span className="text-gray-400">Claims reimbursed:</span> <span className="text-gray-700">{s.claimDetail}</span></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ======================= Salary Structure =======================

export function StructureTab({
  member, profile, onSaved,
}: { member: UserResponse; profile: PayrollProfileResponse | undefined; onSaved: () => void }) {
  const [revise, setRevise] = useState(false);
  if (!profile) return <Empty text="No salary structure yet." />;
  const comps = decodeComponents(profile.components);
  const ctc = Number(profile.salary.monthlyCtc);
  const basic = basicAmount(comps, ctc) || Number(profile.salary.basic);
  const earnings = comps.filter((c) => c.kind === "EARNING").map((c) => ({ c, amt: Math.round(componentAmount(c, { ctc, basic, gross: ctc })) }));
  const deductions = comps.filter((c) => c.kind === "DEDUCTION").map((c) => ({ c, amt: Math.round(componentAmount(c, { ctc, basic, gross: ctc })) }));
  const totalEarn = earnings.reduce((a, e) => a + e.amt, 0);
  const totalDed = deductions.reduce((a, e) => a + e.amt, 0);
  const rate = profile.salary.workType;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-600">
          {rate
            ? <>Paid <b>{inr(profile.salary.workRate)}</b> per {rate === "HOURLY" ? "hour" : rate === "PIECE" ? "piece (work logs)" : "day"}</>
            : <>Monthly CTC <b>{inr(ctc)}</b> · Yearly <b>{inr(ctc * 12)}</b></>}
          <span className="ml-2 text-xs text-gray-400">· salary basis {profile.salary.salaryBasis === "PUNCH" ? "punch hours" : "shift days"}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRevise(true)} className="rounded-lg border border-brand-accent px-3 py-1.5 text-sm font-medium text-brand-accent hover:bg-cyan-50">Revise</button>
          <Link href={`/payroll/staff/${member.id}/edit`} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><Pencil size={13} /> Edit</Link>
        </div>
      </div>
      {!rate && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><th className="px-4 py-2">Components</th><th className="px-4 py-2">Calculation</th><th className="px-4 py-2 text-right">Monthly</th><th className="px-4 py-2 text-right">Yearly</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="bg-gray-50/60 px-4 py-1.5 text-xs font-semibold text-gray-600">Earnings</td></tr>
              {earnings.map(({ c, amt }) => (
                <tr key={`e-${c.name}`} className="border-t border-gray-50"><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2 text-xs text-gray-500">{c.calc === "FLAT" ? "Fixed" : `${c.value}${CALC_LABEL[c.calc]}`}</td><td className="px-4 py-2 text-right">{inr(amt)}</td><td className="px-4 py-2 text-right text-gray-500">{inr(amt * 12)}</td></tr>
              ))}
              <tr className="border-t border-gray-100 font-medium"><td className="px-4 py-2">Gross Salary</td><td /><td className="px-4 py-2 text-right">{inr(totalEarn)}</td><td className="px-4 py-2 text-right">{inr(totalEarn * 12)}</td></tr>
              {deductions.length > 0 && <tr><td colSpan={4} className="bg-gray-50/60 px-4 py-1.5 text-xs font-semibold text-gray-600">Deductions</td></tr>}
              {deductions.map(({ c, amt }) => (
                <tr key={`d-${c.name}`} className="border-t border-gray-50"><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2 text-xs text-gray-500">{c.calc === "FLAT" ? "Fixed" : `${c.value}${CALC_LABEL[c.calc]}`}{c.cap ? ` (cap ${inr(c.cap)})` : ""}</td><td className="px-4 py-2 text-right text-rose-600">−{inr(amt)}</td><td className="px-4 py-2 text-right text-gray-500">−{inr(amt * 12)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 p-4 sm:grid-cols-4">
            <StatCard label="Total CTC (monthly)" value={inr(ctc)} accent="cyan" />
            <StatCard label="Total CTC (yearly)" value={inr(ctc * 12)} accent="cyan" />
            <StatCard label="Take Home (monthly)" value={inr(totalEarn - totalDed)} accent="green" />
            <StatCard label="Take Home (yearly)" value={inr((totalEarn - totalDed) * 12)} accent="green" />
          </div>
        </div>
      )}
      {revise && (
        <ReviseSalaryDialog profiles={[profile]} names={{ [member.id]: member.fullName }} onClose={() => setRevise(false)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ======================= Payments =======================

export function PaymentsTab({ member }: { member: UserResponse }) {
  const [rows, setRows] = useState<PaymentApi[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await getPaymentsApi({ userId: member.id })); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payments."); setRows([]); }
  }, [member.id]);
  useEffect(() => { load(); }, [load]);

  async function remove(p: PaymentApi) {
    if (!confirm(`Delete this ${p.category.toLowerCase()} entry of ${inr(p.amount)}?`)) return;
    try { await deletePaymentApi(p.id); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }
  const total = (rows ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const { sorted: sortedPays, sortKey, sortDir, toggle } = useTableSort(rows ?? NONE_PAY, PAY_SORT, { key: "date", dir: "desc" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{rows?.length ?? 0} entries · {inr(total)} recorded</span>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add Payment</button>
      </div>
      <ErrorLine text={error} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty text="No payments recorded." /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Cycle" sortKey="cycle" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Mode" sortKey="mode" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Description" sortKey="description" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><th /></tr></thead>
            <tbody>
              {sortedPays.map((p) => (
                <tr key={p.id} className="border-t border-gray-50">
                  <td className="px-4 py-2">{formatDateIST(p.recordDate)}</td>
                  <td className="px-4 py-2 text-gray-600">{monthLabel(p.month)}</td>
                  <td className="px-4 py-2"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{p.category}</span></td>
                  <td className="px-4 py-2 text-gray-600">{p.mode}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{p.description ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{inr(p.amount)}</td>
                  <td className="px-2 py-2"><button onClick={() => remove(p)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddPaymentDialog userId={member.id} name={member.fullName} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}

// ======================= Loans =======================

export function LoansTab({ member }: { member: UserResponse }) {
  const [rows, setRows] = useState<LoanApi[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setRows((await getLoansApi()).filter((l) => l.userId === member.id)); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load loans."); setRows([]); }
  }, [member.id]);
  useEffect(() => { load(); }, [load]);

  async function act(l: LoanApi, action: "PAUSE" | "RESUME" | "CLOSE" | "WRITE_OFF") {
    const words = { PAUSE: "Pause EMIs on", RESUME: "Resume EMIs on", CLOSE: "Close (mark fully recovered)", WRITE_OFF: "Write off" }[action];
    if (!confirm(`${words} “${l.name}”?`)) return;
    try { await loanActionApi(l.id, action); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update the loan."); }
  }
  const total = (rows ?? []).reduce((a, l) => a + Number(l.principal), 0);
  const balance = (rows ?? []).reduce((a, l) => a + Number(l.outstanding), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Loan Amount" value={inr(total)} />
        <StatCard label="Total Payment" value={inr(total - balance)} accent="green" />
        <StatCard label="Loan Balance" value={inr(balance)} accent="amber" />
      </div>
      <div className="flex justify-end">
        <Link href="/payroll/loans" className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add Loan</Link>
      </div>
      <ErrorLine text={error} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty text="No loans to show." /> : rows.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              {l.name}
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${l.status === "ACTIVE" || !l.status ? "bg-cyan-50 text-brand-accent" : l.status === "PAUSED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{l.status ?? "ACTIVE"}</span>
            </div>
            <div className="text-xs text-gray-500">
              Principal {inr(l.principal)} · {Number(l.annualRate)}% {l.interestType.toLowerCase()} · EMI {inr(l.emi)} × {l.tenureMonths} from {l.startMonth} · Balance <b>{inr(l.outstanding)}</b>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(l.status ?? "ACTIVE") === "ACTIVE" && <button onClick={() => act(l, "PAUSE")} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Pause</button>}
            {l.status === "PAUSED" && <button onClick={() => act(l, "RESUME")} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Resume</button>}
            {l.status !== "CLOSED" && l.status !== "WRITTEN_OFF" && (
              <>
                <button onClick={() => act(l, "WRITE_OFF")} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Write off</button>
                <button onClick={() => act(l, "CLOSE")} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Close</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ======================= Leaves =======================

export function LeavesTab({ member }: { member: UserResponse }) {
  const [rows, setRows] = useState<LeaveRequestApi[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    memberLeave(member.id).then(setRows).catch((err) => { setError(err instanceof ApiError ? err.message : "Unable to load leaves."); setRows([]); });
  }, [member.id]);
  const approved = (rows ?? []).filter((r) => r.status === "APPROVED");
  const { sorted: sortedLeaves, sortKey, sortDir, toggle } = useTableSort(rows ?? NONE_LEAVE, LEAVE_SORT, { key: "from", dir: "desc" });
  const byType = new Map<string, number>();
  for (const r of approved) byType.set(r.leaveTypeName, (byType.get(r.leaveTypeName) ?? 0) + Number(r.days));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Leaves Availed" value={approved.reduce((a, r) => a + Number(r.days), 0)} accent="blue" />
        {[...byType.entries()].slice(0, 3).map(([t, d]) => <StatCard key={t} label={t} value={d} />)}
      </div>
      <p className="text-xs text-gray-500">To mark a leave for a past day use the Attendance tab (L). Requests are approved on the Leave screen.</p>
      <ErrorLine text={error} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty text="No leave applications." /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><SortTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="From" sortKey="from" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="To" sortKey="to" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Days" sortKey="days" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggle} /><th className="px-4 py-2 font-medium">Reason</th></tr></thead>
            <tbody>
              {sortedLeaves.map((r) => (
                <tr key={r.id} className="border-t border-gray-50">
                  <td className="px-4 py-2">{r.leaveTypeName}</td>
                  <td className="px-4 py-2">{formatDateIST(r.fromDate)}</td>
                  <td className="px-4 py-2">{formatDateIST(r.toDate)}</td>
                  <td className="px-4 py-2 text-right">{Number(r.days)}</td>
                  <td className="px-4 py-2 text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ======================= Work logs (piece rate) =======================

export function WorkTab({ member }: { member: UserResponse }) {
  const mon = useMonth();
  const [rows, setRows] = useState<WorkLogApi[] | null>(null);
  const [items, setItems] = useState<WorkItemApi[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ date: todayIST(), itemId: "", units: "", note: "" });
  const load = useCallback(async () => {
    try { setRows(await getWorkLogsApi(mon.from, mon.to, member.id)); setError(""); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load work logs."); setRows([]); }
  }, [member.id, mon.from, mon.to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getWorkItemsApi().then((i) => setItems(i.filter((x) => x.active))).catch(() => {}); }, []);

  const item = items.find((i) => String(i.id) === form.itemId);
  async function add() {
    if (!item || !(Number(form.units) > 0)) { setError("Pick a work item and enter units."); return; }
    try {
      await addWorkLogApi({ userId: member.id, date: form.date, itemId: item.id, units: Number(form.units), note: form.note || undefined });
      setForm((f) => ({ ...f, units: "", note: "" }));
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to log work."); }
  }
  async function remove(id: number) {
    try { await deleteWorkLogApi(id); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to delete."); }
  }
  const total = (rows ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const { sorted: sortedWork, sortKey, sortDir, toggle } = useTableSort(rows ?? NONE_WORK, WORK_SORT, { key: "date", dir: "desc" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitch label={monthLabel(mon.key)} step={mon.step} />
        <span className="text-sm text-gray-600">Payable this month: <b>{inr(total)}</b></span>
      </div>
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-5">
        <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        <Select value={form.itemId} onChange={(v) => setForm((f) => ({ ...f, itemId: v }))} placeholder="Work item" options={items.map((i) => ({ value: String(i.id), label: `${i.name} · ${inr(i.rate)}${i.unit ? `/${i.unit}` : ""}` }))} />
        <input type="number" min={0} value={form.units} onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))} placeholder="Units" className="input" />
        <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Note (optional)" className="input" />
        <button onClick={add} className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
          Log {item && Number(form.units) > 0 ? inr(item.rate * Number(form.units)) : "Work"}
        </button>
      </div>
      {items.length === 0 && <p className="text-xs text-gray-500">No work items yet — add them in <Link href="/payroll/work" className="text-brand-accent underline">Work Management</Link>.</p>}
      <ErrorLine text={error} />
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty text="No work logged this month." /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs text-gray-500"><SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Item" sortKey="item" activeKey={sortKey} dir={sortDir} onSort={toggle} /><SortTh label="Units" sortKey="units" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Rate" sortKey="rate" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><SortTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" /><th /></tr></thead>
            <tbody>
              {sortedWork.map((r) => (
                <tr key={r.id} className="border-t border-gray-50">
                  <td className="px-4 py-2">{formatDateIST(r.date)}</td>
                  <td className="px-4 py-2">{r.itemName}{r.note ? <span className="ml-1 text-xs text-gray-400">· {r.note}</span> : null}</td>
                  <td className="px-4 py-2 text-right">{Number(r.units)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{inr(r.rate)}</td>
                  <td className="px-4 py-2 text-right font-medium">{inr(r.amount)}</td>
                  <td className="px-2 py-2"><button onClick={() => remove(r.id)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ======================= Documents =======================

export function DocumentsTab({ member, profile }: { member: UserResponse; profile: PayrollProfileResponse | undefined }) {
  let docs: { type: string; fileName: string; dataUrl: string }[] = [];
  try { docs = profile?.documents ? JSON.parse(profile.documents) : []; } catch { docs = []; }
  const withFile = docs.filter((d) => d.dataUrl);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href={`/payroll/staff/${member.id}/edit`} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Add Document</Link>
      </div>
      {withFile.length === 0 ? <Empty text="No documents uploaded." /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {withFile.map((d, i) => (
            <button key={i} type="button" onClick={() => previewFile({ name: d.fileName, url: d.dataUrl })} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left hover:bg-gray-50">
              <FileText size={20} className="text-brand-accent" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">{d.type}</div>
                <div className="truncate text-xs text-gray-500">{d.fileName}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { cycleOptions };
