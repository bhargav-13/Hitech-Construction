"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { usePayrollStore } from "@/lib/payrollApi";
import type { Employee } from "@/lib/payrollApi";
import { useRolesAndUsers, defaultStaffRoleId, suggestPassword, createStaffLogin } from "@/lib/payrollUsers";
import { ApiError } from "@/lib/api";
import { Copy, KeyRound, Link2, ShieldCheck, UserPlus } from "lucide-react";

/**
 * Give an existing staff member a login: create a fresh ERP user account, or link one that already
 * exists. Keeps admins from entering the same person twice (once as staff, once as a user).
 */
export function StaffLoginDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { roles, users, loading } = useRolesAndUsers();
  const linkUser = usePayrollStore((s) => s.linkUser);
  const updateEmployee = usePayrollStore((s) => s.updateEmployee);

  const [mode, setMode] = useState<"CREATE" | "LINK">("CREATE");
  const [email, setEmail] = useState(employee.email ?? "");
  const [roleId, setRoleId] = useState<string>("");
  const [password, setPassword] = useState(() => suggestPassword(employee.name));
  const [existingUserId, setExistingUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Default the role once roles arrive.
  const roleValue = roleId || String(defaultStaffRoleId(roles) ?? "");

  // Users not already linked to another staff member. Select the stable array, derive in a memo —
  // deriving inside the selector returns a fresh array each render and trips the getSnapshot guard.
  const employees = usePayrollStore((s) => s.employees);
  const linkedIds = useMemo(
    () => employees.map((e) => e.userId).filter((x): x is number => x != null),
    [employees]
  );
  const availableUsers = useMemo(
    () => users.filter((u) => u.id === employee.userId || !linkedIds.includes(u.id)),
    [users, linkedIds, employee.userId]
  );

  async function submit() {
    setError("");
    if (mode === "LINK") {
      if (!existingUserId) return setError("Choose a user to link.");
      const u = users.find((x) => String(x.id) === existingUserId);
      linkUser(employee.id, Number(existingUserId));
      if (u && !employee.email) updateEmployee(employee.id, { email: u.email });
      onClose();
      return;
    }
    // CREATE
    if (!email.trim()) return setError("Email is required to create a login.");
    if (!roleValue) return setError("Select a role.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setSaving(true);
    try {
      const created = await createStaffLogin({ email, password, fullName: employee.name, phone: employee.phone, roleId: Number(roleValue) });
      linkUser(employee.id, created.id);
      updateEmployee(employee.id, { email: email.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the login account.");
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Drawer title="Login Created" onClose={onClose} width="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <ShieldCheck size={16} /> Login created for {employee.name}.
          </div>
          <p className="text-sm text-gray-500">Share these credentials with the employee. They should change the password after signing in.</p>
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm">
            <CredRow label="Email" value={email.trim()} />
            <CredRow label="Temporary Password" value={password} />
          </div>
          <button onClick={onClose} className="w-full rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95">Done</button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer title={`Give ${employee.name} a login`} onClose={onClose} onSave={submit} saveLabel={saving ? "Creating…" : mode === "CREATE" ? "Create Login" : "Link Account"} width="max-w-md">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="inline-flex w-full overflow-hidden rounded-lg ring-1 ring-gray-200">
          <ModeTab active={mode === "CREATE"} onClick={() => setMode("CREATE")} icon={UserPlus} label="Create new" />
          <ModeTab active={mode === "LINK"} onClick={() => setMode("LINK")} icon={Link2} label="Link existing" />
        </div>

        {mode === "CREATE" ? (
          <>
            <F label="Login Email" required>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="name@hitech.local" autoFocus />
            </F>
            <F label="Role" required>
              <Select value={roleValue} onChange={setRoleId} placeholder={loading ? "Loading roles…" : "Select role"} options={roles.map((r) => ({ value: String(r.id), label: r.name }))} />
            </F>
            <F label="Temporary Password" required>
              <div className="flex items-center gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className="input font-mono" />
                <button type="button" onClick={() => setPassword(suggestPassword(employee.name))} title="Generate another" className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-brand-accent">
                  <KeyRound size={15} />
                </button>
              </div>
            </F>
            <p className="text-[11px] text-gray-400">A real ERP user is created with these credentials and linked to this staff member. Share the password; the employee changes it on first login.</p>
          </>
        ) : (
          <>
            <F label="Existing User" required>
              <Select value={existingUserId} onChange={setExistingUserId} placeholder={loading ? "Loading users…" : "Select a user"} options={availableUsers.map((u) => ({ value: String(u.id), label: `${u.fullName} · ${u.email}` }))} />
            </F>
            <p className="text-[11px] text-gray-400">Links an account that already exists to this staff member. Users already linked to other staff are hidden.</p>
          </>
        )}
      </div>
    </Drawer>
  );
}

function ModeTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number }>; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-brand-accent text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
      <Icon size={14} /> {label}
    </button>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-gray-800">{value}</span>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-accent"
          title="Copy"
        >
          <Copy size={13} />
        </button>
        {copied && <span className="text-[10px] text-emerald-600">copied</span>}
      </span>
    </div>
  );
}
