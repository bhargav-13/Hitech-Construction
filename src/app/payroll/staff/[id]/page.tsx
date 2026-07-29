"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { profileProgress } from "@/lib/payrollApi";
import { useShifts, useHolidayPolicies, useLeavePolicies, usePayrollProfiles } from "@/lib/usePayrollSetup";
import { getUsers, ApiError } from "@/lib/api";
import type { UserResponse, PayrollProfileResponse } from "@/lib/api";
import { STAFF_CATEGORIES, DESIGNATIONS } from "@/lib/payrollConfig";
import type { StaffCategory } from "@/lib/payrollConfig";
import { inr } from "@/lib/format";
import {
  ArrowLeft, ArrowRight, Building2, Check, Clock, CalendarDays, Landmark,
  Mail, Phone, Plus, Palmtree, Wallet,
} from "lucide-react";

const STEPS = [
  { key: "employment", label: "Employment", icon: Building2 },
  { key: "policies", label: "Shift & Policies", icon: Clock },
  { key: "salary", label: "Salary", icon: Wallet },
  { key: "bank", label: "Bank & Identity", icon: Landmark },
] as const;

/**
 * Multi-step wizard to set up (or edit) a member's payroll profile. Opened from the People list.
 * Fetches the member + their profile + the setup policies, then hands off to the form once
 * everything has loaded — so the form's initial state always reflects real saved data.
 */
export default function PayrollProfileWizardPage() {
  const params = useParams();
  const userId = Number(params.id);

  const [member, setMember] = useState<UserResponse | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState("");

  const { shifts, loading: shiftsLoading } = useShifts();
  const { holidayPolicies, loading: holidaysLoading } = useHolidayPolicies();
  const { leavePolicies, loading: leaveLoading } = useLeavePolicies();
  const { profiles, loading: profilesLoading, save } = usePayrollProfiles([userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getUsers(0, 200);
        if (!cancelled) {
          const m = res.content.find((u) => u.id === userId) ?? null;
          setMember(m);
          if (!m) setMemberError("Member not found, or they're not on payroll.");
        }
      } catch (err) {
        if (!cancelled) setMemberError(err instanceof ApiError ? err.message : "Unable to load the member.");
      } finally {
        if (!cancelled) setMemberLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const loading = memberLoading || shiftsLoading || holidaysLoading || leaveLoading || profilesLoading;

  if (loading) {
    return (
      <PayrollShell requireAdmin>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </PayrollShell>
    );
  }

  if (memberError || !member) {
    return (
      <PayrollShell requireAdmin>
        <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
          <p className="text-sm text-rose-600">{memberError || "Member not found."}</p>
          <Link href="/payroll/staff" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            <ArrowLeft size={15} /> Back to People
          </Link>
        </div>
      </PayrollShell>
    );
  }

  return (
    <WizardForm
      member={member}
      existing={profiles[userId]}
      shifts={shifts}
      holidayPolicies={holidayPolicies}
      leavePolicies={leavePolicies}
      onSave={save}
    />
  );
}

function WizardForm({
  member,
  existing,
  shifts,
  holidayPolicies,
  leavePolicies,
  onSave,
}: {
  member: UserResponse;
  existing?: PayrollProfileResponse;
  shifts: ReturnType<typeof useShifts>["shifts"];
  holidayPolicies: ReturnType<typeof useHolidayPolicies>["holidayPolicies"];
  leavePolicies: ReturnType<typeof useLeavePolicies>["leavePolicies"];
  onSave: ReturnType<typeof usePayrollProfiles>["save"];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  // Form state (seeded from the existing profile or sensible defaults).
  const [category, setCategory] = useState<StaffCategory>((existing?.category as StaffCategory) ?? "REGULAR");
  const [designation, setDesignation] = useState(existing?.designation ?? DESIGNATIONS[0]);
  const [joiningDate, setJoiningDate] = useState(existing?.joiningDate ?? new Date().toISOString().slice(0, 10));
  const [shiftId, setShiftId] = useState<string>(existing?.shiftId != null ? String(existing.shiftId) : shifts[0] ? String(shifts[0].id) : "");
  const [holidayPolicyId, setHolidayPolicyId] = useState<string>(existing?.holidayPolicyId != null ? String(existing.holidayPolicyId) : holidayPolicies[0] ? String(holidayPolicies[0].id) : "");
  const [leavePolicyId, setLeavePolicyId] = useState<string>(existing?.leavePolicyId != null ? String(existing.leavePolicyId) : leavePolicies[0] ? String(leavePolicies[0].id) : "");
  const [monthlyCtc, setMonthlyCtc] = useState(existing?.salary.monthlyCtc ?? 0);
  const [workType, setWorkType] = useState<"DAILY" | "HOURLY" | "PIECE">(existing?.salary.workType ?? "DAILY");
  const [workRate, setWorkRate] = useState(existing?.salary.workRate ?? 0);
  const [pf, setPf] = useState(existing?.salary.pf ?? true);
  const [esic, setEsic] = useState(existing?.salary.esic ?? false);
  const [pt, setPt] = useState(existing?.salary.pt ?? true);
  const [pan, setPan] = useState(existing?.pan ?? "");
  const [bankAccount, setBankAccount] = useState(existing?.bankAccount ?? "");
  const [ifsc, setIfsc] = useState(existing?.ifsc ?? "");
  const [bankName, setBankName] = useState(existing?.bankName ?? "");

  const isWork = category === "WORK_BASIS";
  const basic = Math.round(monthlyCtc * 0.5);
  const hra = Math.round(monthlyCtc * 0.2);

  const buildProfile = (): PayrollProfileResponse => ({
    userId: member.id,
    category,
    designation,
    joiningDate,
    salary: {
      monthlyCtc: isWork ? 0 : Number(monthlyCtc) || 0,
      basic: isWork ? 0 : basic,
      hra: isWork ? 0 : hra,
      otherAllowances: isWork ? 0 : (Number(monthlyCtc) || 0) - basic - hra,
      workType: isWork ? workType : null,
      workRate: isWork ? Number(workRate) || 0 : 0,
      pf, esic, pt,
    },
    bankAccount: bankAccount.trim() || null,
    ifsc: ifsc.trim() || null,
    bankName: bankName.trim() || null,
    pan: pan.trim() || null,
    shiftId: shiftId ? Number(shiftId) : null,
    holidayPolicyId: holidayPolicyId ? Number(holidayPolicyId) : null,
    leavePolicyId: leavePolicyId ? Number(leavePolicyId) : null,
  });

  // Live progress from the current form (so the header % moves as they fill things in).
  const progress = useMemo(
    () => profileProgress(buildProfile()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, designation, joiningDate, shiftId, holidayPolicyId, leavePolicyId, monthlyCtc, workRate, workType, pf, esic, pt, pan, bankAccount, ifsc, bankName]
  );

  async function persist(): Promise<boolean> {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(buildProfile());
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save — check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const next = async () => { if (await persist()) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const finish = async () => { if (await persist()) router.push("/payroll/staff"); };

  const firstName = member.fullName.split(" ")[0];

  return (
    <PayrollShell requireAdmin>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header: back + identity + live progress */}
        <div className="flex items-center gap-3">
          <Link href="/payroll/staff" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            <ArrowLeft size={14} /> People
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-800">
              {existing ? "Payroll Profile" : "Set Up Payroll"} · {member.fullName}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><Mail size={11} /> {member.email}</span>
              {member.phoneNumber && <span className="inline-flex items-center gap-1"><Phone size={11} /> {member.phoneNumber}</span>}
              {member.departmentName && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {member.departmentName}</span>}
              {member.staffType && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${member.staffType === "SITE" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>
                  {member.staffType === "SITE" ? "Site" : "Office"}
                </span>
              )}
            </div>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <div className="text-lg font-semibold text-brand-accent">{progress.percent}%</div>
            <div className="text-[11px] text-gray-400">complete</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-accent transition-all duration-300" style={{ width: `${progress.percent}%` }} />
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = progress.steps[i].done;
            return (
              <button
                key={s.key}
                onClick={async () => { if (await persist()) setStep(i); }}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                  active ? "border-brand-accent bg-cyan-50/60" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done ? "bg-emerald-500 text-white" : active ? "bg-brand-accent text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {done ? <Check size={13} /> : i + 1}
                </span>
                <span className={`hidden truncate text-xs font-medium sm:block ${active ? "text-brand-accent" : "text-gray-600"}`}>{s.label}</span>
              </button>
            );
          })}
        </div>

        {saveError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{saveError}</div>}

        {/* Step body */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <span className="mb-2 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Employment Type</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {STAFF_CATEGORIES.map((c) => {
                    const selected = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        className={`flex flex-col rounded-lg border p-3 text-left transition-all duration-150 ${
                          selected ? "border-brand-accent bg-cyan-50/60 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${selected ? "text-brand-accent" : "text-gray-800"}`}>{c.title}</span>
                          {selected && <Check size={14} className="text-brand-accent" />}
                        </div>
                        <span className="mt-0.5 text-[11px] text-gray-500">{c.blurb.split(".")[0]}.</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Designation">
                  <Select value={designation} onChange={setDesignation} options={DESIGNATIONS.map((d) => ({ value: d, label: d }))} />
                </Field>
                <Field label="Joining Date">
                  <DatePicker value={joiningDate} onChange={setJoiningDate} placeholder="Joining date" />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Assign the policies {firstName} follows. Manage the options in Setup.</p>
              <PolicyField label="Shift" icon={Clock} value={shiftId} onChange={setShiftId} options={shifts.map((s) => ({ value: String(s.id), label: s.name }))} createHref="/payroll/setup/shifts" createLabel="New shift" empty="No shifts yet" />
              <PolicyField label="Holiday Policy" icon={Palmtree} value={holidayPolicyId} onChange={setHolidayPolicyId} options={holidayPolicies.map((h) => ({ value: String(h.id), label: h.name }))} createHref="/payroll/setup/holidays" createLabel="New policy" empty="No holiday policies yet" />
              <PolicyField label="Leave Policy" icon={CalendarDays} value={leavePolicyId} onChange={setLeavePolicyId} options={leavePolicies.map((l) => ({ value: String(l.id), label: l.name }))} createHref="/payroll/setup/leave" createLabel="New policy" empty="No leave policies yet" />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {isWork ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Work Type">
                    <Select value={workType} onChange={(v) => setWorkType(v as "DAILY" | "HOURLY" | "PIECE")} options={[{ value: "DAILY", label: "Daily wage" }, { value: "HOURLY", label: "Hourly" }, { value: "PIECE", label: "Piece-rate" }]} />
                  </Field>
                  <Field label={`Rate per ${workType === "HOURLY" ? "hour" : workType === "PIECE" ? "piece" : "day"}`}>
                    <input type="number" value={workRate} onChange={(e) => setWorkRate(Number(e.target.value))} className="input" />
                  </Field>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Monthly CTC">
                      <input type="number" value={monthlyCtc} onChange={(e) => setMonthlyCtc(Number(e.target.value))} className="input" autoFocus />
                    </Field>
                  </div>
                  {monthlyCtc > 0 && (
                    <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50/70 p-3 text-sm">
                      <Comp label="Basic (50%)" value={inr(basic)} />
                      <Comp label="HRA (20%)" value={inr(hra)} />
                      <Comp label="Other Allowances" value={inr(monthlyCtc - basic - hra)} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <Toggle label="PF" checked={pf} onChange={setPf} />
                    <Toggle label="ESIC" checked={esic} onChange={setEsic} />
                    <Toggle label="Professional Tax" checked={pt} onChange={setPt} />
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="PAN"><input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className="input font-mono" placeholder="optional" /></Field>
              <Field label="Bank Account No."><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="input font-mono" placeholder="optional" /></Field>
              <Field label="IFSC"><input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className="input font-mono" placeholder="optional" /></Field>
              <Field label="Bank Name"><input value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" placeholder="optional" /></Field>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={back}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="flex items-center gap-2">
            <button onClick={finish} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-50">
              Save &amp; Close
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50">
                {saving ? "Saving…" : "Next"} {!saving && <ArrowRight size={15} />}
              </button>
            ) : (
              <button onClick={finish} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50">
                <Check size={15} /> {saving ? "Saving…" : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function PolicyField({
  label, icon: Icon, value, onChange, options, createHref, createLabel, empty,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  createHref: string;
  createLabel: string;
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Icon size={14} className="text-gray-400" /> {label}</span>
        <Link href={createHref} className="flex items-center gap-1 text-[11px] font-medium text-brand-accent hover:underline">
          <Plus size={12} /> {createLabel}
        </Link>
      </div>
      {options.length === 0 ? (
        <Link href={createHref} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-brand-accent hover:text-brand-accent">
          <Plus size={13} /> {empty} — create one
        </Link>
      ) : (
        <Select value={value} onChange={onChange} placeholder="None" options={[{ value: "", label: "None" }, ...options]} />
      )}
    </div>
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
      {label && <span className="cursor-pointer" onClick={() => onChange(!checked)}>{label}</span>}
    </span>
  );
}
