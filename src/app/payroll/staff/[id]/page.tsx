"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PayrollShell } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { usePayrollProfiles, useLeavePolicies } from "@/lib/usePayrollSetup";
import { getPayrollPeople, setStaffStatus, ApiError } from "@/lib/api";
import type { PayrollProfileResponse, UserResponse } from "@/lib/api";
import { categoryConfig } from "@/lib/payrollConfig";
import { payGroupOf, staffStatusOf } from "@/lib/payrollGroups";
import { AddPaymentDialog, VariableDialog } from "@/components/payroll/PayrollDialogs";
import { ExitDialog } from "@/components/payroll/ExitDialog";
import {
  AttendanceTab, DocumentsTab, LeavesTab, LoansTab, PaymentsTab, ProfileTab, SalaryOverviewTab, StructureTab, WorkTab,
} from "@/components/payroll/StaffTabs";
import { ArrowLeft, ChevronDown, Settings2 } from "lucide-react";
import { profileProgress } from "@/lib/payrollApi";
import { getParties } from "@/lib/vyaparApi";
import { heldAssets } from "@/lib/assetApi";
import type { HeldAsset } from "@/lib/assetApi";
import { useCan } from "@/lib/permissions";
import { inr } from "@/lib/format";
import { useRefreshTick } from "@/lib/autoRefresh";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "attendance", label: "Attendance" },
  { key: "salary", label: "Salary Overview" },
  { key: "structure", label: "Salary Structure" },
  { key: "payments", label: "Payments" },
  { key: "loans", label: "Loans" },
  { key: "leaves", label: "Leave(s)" },
  { key: "work", label: "Work Logs" },
  { key: "documents", label: "Document Centre" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Staff profile — PagarBook's per-staff hub: header with type and status, an Actions menu, and tabs
 * for profile details, daily attendance (P / HD / A / F / OT / L), salary overview with dues,
 * salary structure, payments ledger, loans, leaves, piece-rate work and documents.
 */
export default function StaffProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = Number(params.id);
  const [people, setPeople] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("profile");
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "PAY" | "VAR" | "EXIT">(null);
  const [notice, setNotice] = useState("");
  const { profiles, refresh, loading: profileLoading } = usePayrollProfiles([userId]);
  const { leavePolicies } = useLeavePolicies();
  const [local, setLocal] = useState<PayrollProfileResponse | undefined>(undefined);
  const profile = local ?? profiles[userId];

  const tick = useRefreshTick(); // silent re-load on the module auto-refresh
  useEffect(() => {
    let cancelled = false;
    getPayrollPeople()
      .then((r) => { if (!cancelled) setPeople(r.content); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load the member."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick]);

  // Read the tab from the URL hash so a link can open "#attendance" directly.
  useEffect(() => {
    const h = window.location.hash.replace("#", "") as TabKey;
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, []);
  const go = (k: TabKey) => { setTab(k); history.replaceState(null, "", `#${k}`); };

  const member = useMemo(() => people.find((p) => p.id === userId) ?? null, [people, userId]);
  const leaveTypes = useMemo(() => {
    const policy = leavePolicies.find((lp) => lp.id === profile?.leavePolicyId) ?? leavePolicies[0];
    return (policy?.types ?? []).filter((t) => t.paid).map((t) => ({ value: t.name, label: t.name }));
  }, [leavePolicies, profile?.leavePolicyId]);

  if (loading || profileLoading && !profile) {
    return (
      <PayrollShell requireAdmin>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
      </PayrollShell>
    );
  }
  if (!member) {
    return (
      <PayrollShell requireAdmin>
        <div className="mx-auto max-w-md space-y-3 py-16 text-center">
          <p className="text-sm text-gray-500">{error || "This staff member could not be found."}</p>
          <Link href="/payroll/staff" className="text-sm font-medium text-brand-accent hover:underline">Back to Staff List</Link>
        </div>
      </PayrollShell>
    );
  }

  const inactive = staffStatusOf(profile) === "DEACTIVATED";
  const setup = profileProgress(profile);

  /** Their Vyapar party — where payroll posts their salary, advances, claims and loans. */
  async function openLedger() {
    setMenu(false);
    try {
      const party = (await getParties()).find((p) => p.userId === userId);
      if (party) router.push(`/vyapar/parties?open=${party.id}`);
      else setNotice("No Vyapar ledger yet — it is created with their first payroll entry, or by Payments ▸ Sync to Vyapar.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to open the Vyapar ledger.");
    }
  }
  async function toggleStatus() {
    setMenu(false);
    if (!profile) { setNotice("Set up a payroll profile first."); return; }
    const to = inactive ? "ACTIVE" : "DEACTIVATED";
    if (to === "DEACTIVATED" && !confirm(`Deactivate ${member!.fullName}? They are left out of new payroll runs until reactivated.`)) return;
    try {
      await setStaffStatus([userId], to);
      setLocal(undefined);
      await refresh();
      setNotice(to === "ACTIVE" ? "Staff activated." : "Staff deactivated.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Unable to change status.");
    }
  }

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => router.push("/payroll/staff")} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-50 text-sm font-semibold text-brand-accent">
            {member.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-800">{member.fullName}</h2>
            <p className="text-xs text-gray-500">
              ID {profile?.details?.staffCode ?? `#${member.id}`} | {profile ? `${categoryConfig(profile.category).title.toUpperCase()} (${payGroupOf(profile)})` : "Payroll not set up"}
              {inactive && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">Deactivated</span>}
              {profile?.details?.exitDate && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">Exited {profile.details.exitDate}</span>}
            </p>
          </div>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Actions <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                <MenuItem onClick={() => { setMenu(false); setDialog("PAY"); }}>Add Payment</MenuItem>
                <MenuItem onClick={() => { setMenu(false); setDialog("VAR"); }}>Add Variable Earning / Deduction</MenuItem>
                <MenuItem onClick={openLedger}>Vyapar Ledger (Party)</MenuItem>
                <MenuItem onClick={() => { setMenu(false); router.push(`/payroll/staff/${userId}/edit`); }}>{profile ? "Edit Salary & Policies" : "Set up Payroll Profile"}</MenuItem>
                <MenuItem onClick={toggleStatus}>{inactive ? "Activate Staff" : "Deactivate Staff"}</MenuItem>
                <MenuItem onClick={() => { setMenu(false); setDialog("EXIT"); }}>{profile?.details?.exitDate ? "Full & Final Settlement" : "Initiate Exit / Full & Final"}</MenuItem>
                <MenuItem onClick={() => { setMenu(false); router.push("/settings"); }}>Manage login (Settings)</MenuItem>
              </div>
            )}
          </div>
        </div>

        {setup.percent < 100 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-900">
                {profile ? `Payroll profile ${setup.percent}% set up` : "Payroll profile not set up yet"}
              </div>
              <div className="mt-0.5 text-xs text-amber-800">
                {profile
                  ? `Still to do: ${setup.steps.filter((s) => !s.done).map((s) => s.label).join(", ")}.`
                  : "Add employment details, shift & policies, salary and bank details so this person can be paid."}
              </div>
            </div>
            <Link
              href={`/payroll/staff/${userId}/edit`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Settings2 size={15} /> {profile ? "Complete setup" : "Set up profile"}
            </Link>
          </div>
        )}

        {notice && <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{notice}</div>}

        <HeldAssets userId={userId} exiting={!!profile?.details?.exitDate} />

        <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "profile" && <ProfileTab member={member} profile={profile} people={people.filter((p) => p.onPayroll || p.id !== userId)} onSaved={(p) => setLocal(p)} />}
        {tab === "attendance" && <AttendanceTab member={member} leaveTypes={leaveTypes} />}
        {tab === "salary" && <SalaryOverviewTab member={member} profile={profile} />}
        {tab === "structure" && <StructureTab member={member} profile={profile} onSaved={async () => { setLocal(undefined); await refresh(); }} />}
        {tab === "payments" && <PaymentsTab member={member} />}
        {tab === "loans" && <LoansTab member={member} />}
        {tab === "leaves" && <LeavesTab member={member} />}
        {tab === "work" && <WorkTab member={member} />}
        {tab === "documents" && <DocumentsTab member={member} profile={profile} />}
      </div>

      {dialog === "PAY" && <AddPaymentDialog userId={userId} name={member.fullName} onClose={() => setDialog(null)} onSaved={() => setNotice("Payment recorded.")} />}
      {dialog === "EXIT" && (
        <ExitDialog
          userId={userId}
          name={member.fullName}
          profile={profile}
          onClose={() => setDialog(null)}
          onDone={async (msg) => { setDialog(null); setNotice(msg); setLocal(undefined); await refresh(); }}
        />
      )}
      {dialog === "VAR" && <VariableDialog members={[{ id: userId, name: member.fullName }]} onClose={() => setDialog(null)} onSaved={() => setNotice("Added — it applies when the month's payroll is generated.")} />}
    </PayrollShell>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{children}</button>;
}

/**
 * Company assets this person is holding — the camera, the mixer. Shown on the profile so nothing
 * walks out with someone at exit; hidden when they hold nothing or the viewer has no Asset access.
 */
function HeldAssets({ userId, exiting }: { userId: number; exiting: boolean }) {
  const can = useCan();
  const allowed = can("ASSET:VIEW");
  const [rows, setRows] = useState<HeldAsset[]>([]);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    heldAssets("USER", userId).then((r) => { if (!cancelled) setRows(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, allowed]);
  if (!allowed || rows.length === 0) return null;
  const value = rows.reduce((s, r) => s + Number(r.unitRate) * r.qty, 0);
  return (
    <div className={`rounded-xl border px-4 py-3 ${exiting ? "border-rose-200 bg-rose-50" : "border-gray-200 bg-white"}`}>
      <div className="mb-1.5 text-sm font-semibold text-gray-800">
        Company assets with them <span className="font-normal text-gray-500">· {rows.length} item{rows.length === 1 ? "" : "s"} · {inr(value)}</span>
        {exiting && <span className="ml-2 text-xs font-medium text-rose-700">Collect before full &amp; final settlement</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <Link key={r.assignmentId} href={`/asset/${r.assetId}`} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:border-brand-accent hover:text-brand-accent">
            <span className="font-mono text-gray-400">{r.assetCode}</span> {r.assetName} × {r.qty}
          </Link>
        ))}
      </div>
    </div>
  );
}
