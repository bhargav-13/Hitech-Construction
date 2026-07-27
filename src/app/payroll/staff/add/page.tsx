"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { usePayrollStore } from "@/lib/payrollApi";
import type { WorkType } from "@/lib/payrollApi";
import { STAFF_CATEGORIES, DEPARTMENTS, DESIGNATIONS, categoryConfig } from "@/lib/payrollConfig";
import type { StaffCategory } from "@/lib/payrollConfig";
import { useRolesAndUsers, defaultStaffRoleId, suggestPassword, createStaffLogin } from "@/lib/payrollUsers";
import { useStaffDraft } from "@/lib/staffDraft";
import type { StaffDraftUser } from "@/lib/staffDraft";
import { ApiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { ArrowLeft, Check, KeyRound, ShieldCheck, UserPlus } from "lucide-react";

/** Add Staff — pick an employment category, then a category-appropriate salary form. */
export default function AddStaffPage() {
  const router = useRouter();
  const addEmployee = usePayrollStore((s) => s.addEmployee);
  const fromUser = useStaffDraft((s) => s.fromUser);
  const clearDraft = useStaffDraft((s) => s.clear);
  const [category, setCategory] = useState<StaffCategory | null>(null);

  if (!category) {
    return (
      <PayrollShell requireAdmin>
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Add Staff</h2>
              <p className="mt-0.5 text-sm text-gray-500">Choose the employment type to add an employee under.</p>
            </div>
            {fromUser && (
              <button onClick={clearDraft} className="text-xs font-medium text-gray-400 hover:text-gray-600">Clear</button>
            )}
          </div>
          {fromUser && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-brand-accent">
              <ShieldCheck size={15} className="shrink-0" />
              Linking existing login <span className="font-semibold">{fromUser.name}</span> · {fromUser.email} — pick their employment type to continue.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {STAFF_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md active:scale-[0.99]"
              >
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
                  <UserPlus size={18} />
                </div>
                <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                <p className="mt-1 flex-1 text-xs text-gray-500">{c.blurb}</p>
                <div className="mt-3 space-y-1">
                  {c.features.slice(0, 3).map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                      <Check size={11} className="shrink-0 text-emerald-500" /> {f}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] font-medium text-brand-accent opacity-0 transition-opacity group-hover:opacity-100">
                  Select {c.title} →
                </div>
              </button>
            ))}
          </div>
        </div>
      </PayrollShell>
    );
  }

  return (
    <AddStaffForm
      category={category}
      prefill={fromUser}
      onBack={() => setCategory(null)}
      onSaved={() => { clearDraft(); router.push("/payroll/staff"); }}
      addEmployee={addEmployee}
    />
  );
}

function AddStaffForm({
  category,
  prefill,
  onBack,
  onSaved,
  addEmployee,
}: {
  category: StaffCategory;
  prefill: StaffDraftUser | null;
  onBack: () => void;
  onSaved: () => void;
  addEmployee: ReturnType<typeof usePayrollStore.getState>["addEmployee"];
}) {
  const cfg = categoryConfig(category);
  // When adding from an existing user, the login already exists — pre-fill and link it, and skip
  // the "create login" section entirely.
  const linkedUserId = prefill?.id ?? null;
  const isWork = category === "WORK_BASIS";
  const [name, setName] = useState(prefill?.name ?? "");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [designation, setDesignation] = useState(DESIGNATIONS[0]);
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyCtc, setMonthlyCtc] = useState(0);
  const [workType, setWorkType] = useState<WorkType>("DAILY");
  const [workRate, setWorkRate] = useState(0);
  const [pan, setPan] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [pf, setPf] = useState(category === "REGULAR");
  const [esic, setEsic] = useState(false);
  const [pt, setPt] = useState(category !== "WORK_BASIS");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Optional one-step login: create the ERP user account alongside the staff record.
  const { roles } = useRolesAndUsers();
  const [createLogin, setCreateLogin] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState(() => suggestPassword("Staff"));
  const roleValue = roleId || String(defaultStaffRoleId(roles) ?? "");

  const basic = Math.round(monthlyCtc * 0.5);
  const hra = Math.round(monthlyCtc * 0.2);

  function buildEmployee(userId: number | null) {
    return {
      name: name.trim(),
      category,
      department,
      designation,
      phone: phone.trim(),
      email: email.trim() || null,
      joiningDate,
      active: true,
      salary: {
        monthlyCtc: isWork ? 0 : Number(monthlyCtc) || 0,
        basic: isWork ? 0 : basic,
        hra: isWork ? 0 : hra,
        otherAllowances: isWork ? 0 : (Number(monthlyCtc) || 0) - basic - hra,
        workType: isWork ? workType : null,
        workRate: isWork ? Number(workRate) || 0 : 0,
        pf,
        esic,
        pt,
      },
      bankAccount: bankAccount.trim() || null,
      ifsc: ifsc.trim() || null,
      bankName: bankName.trim() || null,
      pan: pan.trim() || null,
      userId,
    };
  }

  async function save() {
    if (!name.trim()) return setError("Employee name is required.");
    if (!phone.trim()) return setError("Phone number is required.");
    // Already linked to an existing user — save straight away with that user id.
    if (linkedUserId != null) {
      addEmployee(buildEmployee(linkedUserId));
      onSaved();
      return;
    }
    if (createLogin) {
      if (!email.trim()) return setError("Email is required to create a login.");
      if (!roleValue) return setError("Select a role for the login.");
      if (password.length < 6) return setError("Password must be at least 6 characters.");
      setSaving(true);
      setError("");
      try {
        const user = await createStaffLogin({ email, password, fullName: name, phone, roleId: Number(roleValue) });
        addEmployee(buildEmployee(user.id));
        onSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't create the login account.");
        setSaving(false);
      }
      return;
    }
    addEmployee(buildEmployee(null));
    onSaved();
  }

  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Add {cfg.title}</h2>
            <p className="text-xs text-gray-500">{cfg.blurb}</p>
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* Basic details */}
        <Section title="Basic Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <F label="Full Name" required><input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus /></F>
            <F label="Phone" required><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></F>
            <F label="Department"><Select value={department} onChange={setDepartment} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} /></F>
            <F label="Designation"><Select value={designation} onChange={setDesignation} options={DESIGNATIONS.map((d) => ({ value: d, label: d }))} /></F>
            <F label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="optional" /></F>
            <F label="Joining Date"><DatePicker value={joiningDate} onChange={setJoiningDate} placeholder="Joining date" /></F>
          </div>
        </Section>

        {/* Salary */}
        <Section title={isWork ? "Work-based Pay" : "Salary Structure"}>
          {isWork ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <F label="Work Type">
                <Select value={workType} onChange={(v) => setWorkType(v as WorkType)} options={[{ value: "DAILY", label: "Daily wage" }, { value: "HOURLY", label: "Hourly" }, { value: "PIECE", label: "Piece-rate" }]} />
              </F>
              <F label={`Rate per ${workType === "HOURLY" ? "hour" : workType === "PIECE" ? "piece" : "day"}`}>
                <input type="number" value={workRate} onChange={(e) => setWorkRate(Number(e.target.value))} className="input" />
              </F>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <F label="Monthly CTC"><input type="number" value={monthlyCtc} onChange={(e) => setMonthlyCtc(Number(e.target.value))} className="input" /></F>
              </div>
              {monthlyCtc > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-gray-50/70 p-3 text-sm">
                  <Comp label="Basic (50%)" value={inr(basic)} />
                  <Comp label="HRA (20%)" value={inr(hra)} />
                  <Comp label="Other Allowances" value={inr(monthlyCtc - basic - hra)} />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                <Toggle label="PF" checked={pf} onChange={setPf} />
                <Toggle label="ESIC" checked={esic} onChange={setEsic} />
                <Toggle label="Professional Tax" checked={pt} onChange={setPt} />
              </div>
            </>
          )}
        </Section>

        {/* Bank & statutory */}
        <Section title="Bank & Identity">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <F label="PAN"><input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className="input font-mono" placeholder="optional" /></F>
            <F label="Bank Account No."><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="input font-mono" placeholder="optional" /></F>
            <F label="IFSC"><input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className="input font-mono" placeholder="optional" /></F>
            <F label="Bank Name"><input value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" placeholder="optional" /></F>
          </div>
        </Section>

        {/* Login account. When adding from an existing user the login is already there — just show it
            linked. Otherwise offer to create the ERP user in the same step. */}
        {linkedUserId != null ? (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 text-sm text-brand-accent">
            <ShieldCheck size={16} className="shrink-0" />
            Linked to existing login <span className="font-semibold">{prefill?.email}</span> — this employee can already sign in. No new account is created.
          </div>
        ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-brand-accent"><KeyRound size={16} /></div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Create Login Account</h3>
                <p className="text-xs text-gray-400">Give this employee an ERP login now, linked to their staff record.</p>
              </div>
            </div>
            <Toggle label="" checked={createLogin} onChange={setCreateLogin} />
          </div>
          {createLogin && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <F label="Login Email" required><input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="name@hitech.local" /></F>
              <F label="Role" required><Select value={roleValue} onChange={setRoleId} placeholder="Select role" options={roles.map((r) => ({ value: String(r.id), label: r.name }))} /></F>
              <F label="Temporary Password" required>
                <div className="flex items-center gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} className="input font-mono" />
                  <button type="button" onClick={() => setPassword(suggestPassword(name || "Staff"))} title="Generate another" className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-brand-accent">
                    <KeyRound size={15} />
                  </button>
                </div>
              </F>
              <div className="sm:col-span-2 text-[11px] text-gray-400">Share this password with the employee; they change it after signing in. Uses the same email/phone as above.</div>
            </div>
          )}
        </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50">
            <UserPlus size={15} /> {saving ? "Saving…" : linkedUserId != null ? "Save & Link Employee" : createLogin ? "Save & Create Login" : "Save Employee"}
          </button>
          <button onClick={onBack} className="rounded-lg px-4 py-2 text-sm text-gray-500 transition-colors hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </PayrollShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}
function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}{required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
function Comp({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="font-medium text-gray-800">{value}</div>
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  // Deliberately NOT a <label>: a <label> wrapping a <button> re-dispatches the click to the
  // button (buttons are labelable), firing onChange twice and cancelling the toggle out.
  return (
    <span className="flex items-center gap-2 text-sm text-gray-600">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-brand-accent" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {label && (
        <span className="cursor-pointer" onClick={() => onChange(!checked)}>{label}</span>
      )}
    </span>
  );
}
