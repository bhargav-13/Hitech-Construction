"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { projectAvatarColor } from "@/lib/projectHelpers";
import * as api from "@/lib/api";
import type { ModuleResponse, RoleResponse, UserResponse } from "@/lib/api";
import {
  ChevronRight,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  UserRound,
} from "lucide-react";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useDepartments } from "@/lib/useDepartments";

// Roles & Access is the only built Settings section. Unimplemented sections used to be listed here
// as "Coming soon" placeholders — that's been removed. The "coming soon" hint now lives in the
// New/Manage Role permission matrix (RoleDrawer), against modules whose feature isn't built yet.
const SECTIONS = ["Roles & Access"] as const;
type Section = (typeof SECTIONS)[number];

// Backend module codes that map to a real, usable feature. Everything else is flagged "Coming soon"
// in the role permission matrix.
const IMPLEMENTED_MODULES = new Set([
  "DASHBOARD",
  "PROJECT",
  "TASKOPAD",
  "VYAPAR",
  "PAYROLL",
  "AUDIT",
  "SETTINGS",
  "USER_MANAGEMENT",
]);

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("Roles & Access");

  return (
    <AppShell title="Setting">
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <button
            onClick={() => setSection(SECTIONS[0])}
            className="transition-colors duration-150 hover:text-gray-600 hover:underline"
          >
            Setting
          </button>
          <ChevronRight size={12} className="shrink-0" />
          <span className="font-medium text-gray-600">{section}</span>
        </div>

        {/* Horizontal section tabs */}
        <div className="flex gap-5 overflow-x-auto border-b border-gray-200">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`relative -mb-px flex items-center gap-1.5 px-0.5 pb-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                section === s ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {s}
              <span
                className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-accent transition-all duration-200 ${
                  section === s ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <RolesAndAccess />
        </div>
      </div>
    </AppShell>
  );
}

// ---- Roles & Access: real data from the Spring Boot backend ----
// UX loosely inspired by admin-panel "role cards + accounts table" patterns; no popups —
// create/edit flows open in a right-side Drawer instead.
type RoleDrawerState = { mode: "create" } | { mode: "edit"; role: RoleResponse } | null;
type UserDrawerState = { mode: "create"; roleId?: number } | { mode: "edit"; user: UserResponse } | null;

function RolesAndAccess() {
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [modules, setModules] = useState<ModuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | "all">("all");
  const [roleDrawer, setRoleDrawer] = useState<RoleDrawerState>(null);
  const [userDrawer, setUserDrawer] = useState<UserDrawerState>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [rolesRes, usersRes, modulesRes] = await Promise.all([
        api.getRoles(),
        api.getUsers(0, 100),
        api.getModules(),
      ]);
      setRoles(rolesRes);
      setUsers(usersRes.content);
      setModules(modulesRes);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const usersByRoleId = useMemo(() => {
    const map = new Map<number, UserResponse[]>();
    for (const user of users) {
      if (user.role.id == null) continue;
      const list = map.get(user.role.id) ?? [];
      list.push(user);
      map.set(user.role.id, list);
    }
    return map;
  }, [users]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
        <Spinner size={16} className="text-brand-accent" />
        Loading…
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Members &amp; Roles</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Access is based on role. Each role unlocks specific menus and features.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setRoleDrawer({ mode: "create" })}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-95"
          >
            + New Role
          </button>
          <button
            onClick={() => setUserDrawer({ mode: "create" })}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            + Add Member
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      <RoleHierarchy
        roles={roles}
        usersByRoleId={usersByRoleId}
        onManage={(role) => setRoleDrawer({ mode: "edit", role })}
      />

      <AccountsSection
        roles={roles}
        users={users}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        onEditUser={(user) => setUserDrawer({ mode: "edit", user })}
        onToggleActive={async (user) => {
          try {
            await api.updateUser(user.id, { isActive: !user.isActive });
            refresh();
          } catch (err) {
            setError(err instanceof api.ApiError ? err.message : "Unable to update the user.");
          }
        }}
        onDeleteUser={async (user) => {
          if (!confirm(`Permanently delete ${user.fullName}? This removes the account entirely and can't be undone.`)) {
            return;
          }
          try {
            await api.deleteUserPermanently(user.id);
            refresh();
          } catch (err) {
            setError(err instanceof api.ApiError ? err.message : "Unable to delete the user.");
          }
        }}
      />

      {roleDrawer && (
        <RoleDrawer
          modules={modules}
          roles={roles}
          existing={roleDrawer.mode === "edit" ? roleDrawer.role : undefined}
          onClose={() => setRoleDrawer(null)}
          onSaved={() => {
            setRoleDrawer(null);
            refresh();
          }}
        />
      )}

      {userDrawer && (
        <UserDrawer
          roles={roles}
          existing={userDrawer.mode === "edit" ? userDrawer.user : undefined}
          defaultRoleId={userDrawer.mode === "create" ? userDrawer.roleId : undefined}
          onClose={() => setUserDrawer(null)}
          onSaved={() => {
            setUserDrawer(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
        active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {active ? "Enabled" : "Disabled"}
    </span>
  );
}

/** Office vs Site posting — Site members are project-based, Office members aren't. */
function PostingPill({ staffType }: { staffType: "OFFICE" | "SITE" | null }) {
  if (!staffType) return <span className="text-gray-300">—</span>;
  const isSite = staffType === "SITE";
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
        isSite ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
      }`}
    >
      {isSite ? "Site" : "Office"}
    </span>
  );
}

/** Whether the member is enrolled in payroll (can punch and has a payroll profile). */
function PayrollPill({ onPayroll }: { onPayroll: boolean }) {
  if (!onPayroll) return <span className="text-gray-300">—</span>;
  return (
    <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Enrolled
    </span>
  );
}

function Avatar({ name, id, size = 32 }: { name: string; id: string; size?: number }) {
  return (
    <div
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${projectAvatarColor(id)}`}
      style={{ width: size, height: size }}
    >
      <UserRound size={Math.round(size * 0.6)} strokeWidth={2} />
    </div>
  );
}


function AccountsSection({
  roles,
  users,
  roleFilter,
  onRoleFilterChange,
  onEditUser,
  onToggleActive,
  onDeleteUser,
}: {
  roles: RoleResponse[];
  users: UserResponse[];
  roleFilter: number | "all";
  onRoleFilterChange: (filter: number | "all") => void;
  onEditUser: (user: UserResponse) => void;
  onToggleActive: (user: UserResponse) => void;
  onDeleteUser: (user: UserResponse) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = users.filter((user) => {
    if (roleFilter !== "all" && user.role.id !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return user.fullName.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
  });

  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Member Directory</h3>
          <p className="mt-0.5 text-xs text-gray-400">Everyone with an account — their role, posting and payroll status.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
          <Search size={14} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-48 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200 text-sm">
        <button
          onClick={() => onRoleFilterChange("all")}
          className={`-mb-px border-b-2 px-1 pb-2 font-medium transition-colors duration-150 ${
            roleFilter === "all" ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All ({users.length})
        </button>
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => onRoleFilterChange(role.id)}
            className={`-mb-px border-b-2 px-1 pb-2 font-medium transition-colors duration-150 ${
              roleFilter === role.id ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {role.name} ({users.filter((u) => u.role.id === role.id).length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Posting</th>
              <th className="px-4 py-2 font-medium">Payroll</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr
                key={user.id}
                onClick={() => onEditUser(user)}
                className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user.fullName} id={String(user.id)} size={30} />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800">{user.fullName}</div>
                      <div className="truncate text-xs text-gray-400">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-gray-600">{user.role.name}</td>
                <td className="px-4 py-2 text-gray-600">{user.departmentName ?? "—"}</td>
                <td className="px-4 py-2">
                  <PostingPill staffType={user.staffType} />
                </td>
                <td className="px-4 py-2">
                  <PayrollPill onPayroll={user.onPayroll} />
                </td>
                <td className="px-4 py-2">
                  <StatusPill active={user.isActive} />
                </td>
                <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex">
                    <RowMenu align="right" buttonLabel={`Actions for ${user.fullName}`}>
                      {(close) => (
                        <>
                          <RowMenuItem
                            icon={Pencil}
                            label="Edit"
                            onClick={() => {
                              close();
                              onEditUser(user);
                            }}
                          />
                          <RowMenuItem
                            icon={user.isActive ? UserMinus : UserCheck}
                            label={user.isActive ? "Remove Access" : "Restore Access"}
                            tone={user.isActive ? "warning" : "default"}
                            onClick={() => {
                              close();
                              onToggleActive(user);
                            }}
                          />
                          <RowMenuDivider />
                          <RowMenuItem
                            icon={Trash2}
                            label="Delete permanently"
                            tone="danger"
                            onClick={() => {
                              close();
                              onDeleteUser(user);
                            }}
                          />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No members match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The org ladder — roles laid out as an indented tree by "reports to". Makes the hierarchy readable
 * at a glance: who's at the top, who reports to whom, and how many people hold each role.
 */
function RoleHierarchy({
  roles,
  usersByRoleId,
  onManage,
}: {
  roles: RoleResponse[];
  usersByRoleId: Map<number, UserResponse[]>;
  onManage: (role: RoleResponse) => void;
}) {
  const byId = new Map(roles.map((r) => [r.id, r]));
  // Super Admin is the fixed top of the ladder — it reports to no one and everything sits under it.
  const superAdmin =
    roles.find((r) => r.name.toLowerCase() === "super admin") ?? roles.find((r) => r.isSystem);
  // Group each role under its parent. Any role without a valid parent falls under Super Admin
  // (rather than floating at the root) so the tree always has a single owner at the top.
  const childrenOf = new Map<number | "root", RoleResponse[]>();
  for (const r of roles) {
    if (superAdmin && r.id === superAdmin.id) continue; // the root itself
    const hasParent = r.reportsToRoleId != null && byId.has(r.reportsToRoleId);
    const key: number | "root" = hasParent
      ? r.reportsToRoleId!
      : superAdmin
        ? superAdmin.id
        : "root";
    const list = childrenOf.get(key) ?? [];
    list.push(r);
    childrenOf.set(key, list);
  }
  const roots = superAdmin
    ? [superAdmin]
    : (childrenOf.get("root") ?? []).sort((a, b) => a.name.localeCompare(b.name));

  function Node({ role, seen }: { role: RoleResponse; seen: Set<number> }) {
    if (seen.has(role.id)) return null; // defensive against a data loop
    const nextSeen = new Set(seen).add(role.id);
    const kids = (childrenOf.get(role.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const count = usersByRoleId.get(role.id)?.length ?? 0;
    return (
      <li>
        <button
          onClick={() => onManage(role)}
          className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-all duration-150 hover:bg-cyan-50/60 hover:shadow-sm active:scale-[0.99]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-accent/70 transition-transform duration-150 group-hover:scale-125" />
          <span className="text-sm font-medium text-gray-800 group-hover:text-brand-accent">{role.name}</span>
          {role.isSystem && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">System</span>
          )}
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-brand-accent">
            {count} {count === 1 ? "person" : "people"}
          </span>
          <ChevronRight size={14} className="ml-auto text-gray-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand-accent" />
        </button>
        {kids.length > 0 && (
          <ul className="ml-3 space-y-0.5 border-l border-gray-200 pl-3">
            {kids.map((k) => (
              <Node key={k.id} role={k} seen={nextSeen} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (roles.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">No roles yet.</div>;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="mb-2 px-1 text-xs text-gray-400">
        Top of the ladder first. Set a role&apos;s manager with the &ldquo;Reports to&rdquo; field when you edit it.
      </p>
      <ul className="space-y-0.5">
        {roots.map((r) => (
          <Node key={r.id} role={r} seen={new Set()} />
        ))}
      </ul>
    </div>
  );
}

function RoleDrawer({
  modules,
  roles,
  existing,
  onClose,
  onSaved,
}: {
  modules: ModuleResponse[];
  roles: RoleResponse[];
  existing?: RoleResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [reportsToRoleId, setReportsToRoleId] = useState<number | "">(existing?.reportsToRoleId ?? "");
  const [selected, setSelected] = useState<Set<number>>(
    new Set(existing?.permissions.map((p) => p.id) ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Super Admin is the fixed top of the ladder — it can't report to anyone, so its "Reports to" is frozen.
  const isSuperAdmin = existing != null && existing.name.toLowerCase() === "super admin";
  // A role can't report to itself; other roles are valid parents (the backend rejects deeper loops).
  const parentOptions = roles.filter((r) => r.id !== existing?.id);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModule(mod: ModuleResponse) {
    const allSelected = mod.permissions.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of mod.permissions) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        reportsToRoleId: reportsToRoleId === "" ? null : reportsToRoleId,
        permissionIds: Array.from(selected),
      };
      if (existing) {
        await api.updateRole(existing.id, body);
      } else {
        await api.createRole(body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to save the role.");
      setSaving(false);
    }
  }

  // Built modules first; "coming soon" ones drop to the bottom (V8 sort is stable).
  const orderedModules = [...modules].sort(
    (a, b) => Number(IMPLEMENTED_MODULES.has(b.code)) - Number(IMPLEMENTED_MODULES.has(a.code))
  );

  return (
    <Drawer
      title={existing ? "Manage Role" : "New Role"}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "Saving…" : "Save"}
    >
      <div className="space-y-4">
        {existing?.isSystem && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This is a system role. Changing its permissions affects everyone assigned to it.
          </div>
        )}

        <DrawerField label="Role Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Project Manager" />
        </DrawerField>

        <DrawerField label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
            placeholder="What can this role do?"
          />
        </DrawerField>

        <DrawerField label="Reports to">
          {isSuperAdmin ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Top</span>
                Top of the ladder — reports to no one
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Super Admin is the superior role. Every other role sits under it, so this can&apos;t be changed.
              </p>
            </>
          ) : (
            <>
              <select
                value={reportsToRoleId}
                onChange={(e) => setReportsToRoleId(e.target.value === "" ? "" : Number(e.target.value))}
                className="input"
              >
                <option value="">— Reports to Super Admin —</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Who this role answers to. This builds your org ladder — a manager can see the attendance of the roles below them. Left unset, it sits directly under Super Admin.
              </p>
            </>
          )}
        </DrawerField>

        <DrawerField label={`Module Permissions (${selected.size} selected)`}>
          <div className="space-y-3 rounded-lg border border-gray-100 p-3">
            {orderedModules.map((mod) => {
              const implemented = IMPLEMENTED_MODULES.has(mod.code);
              const allSelected = mod.permissions.every((p) => selected.has(p.id));
              return (
                <div key={mod.id} className="border-b border-gray-50 pb-2 last:border-b-0 last:pb-0">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      {mod.name}
                      {!implemented && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                          Coming soon
                        </span>
                      )}
                    </span>
                    {implemented && (
                      <button
                        type="button"
                        onClick={() => toggleModule(mod)}
                        className="text-xs font-medium text-brand-accent transition-opacity duration-150 hover:underline hover:opacity-80"
                      >
                        {allSelected ? "Clear" : "Select all"}
                      </button>
                    )}
                  </div>
                  {implemented ? (
                    <div className="flex flex-wrap gap-3">
                      {mod.permissions.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={selected.has(perm.id)}
                            onChange={() => toggle(perm.id)}
                            className="h-3.5 w-3.5 accent-cyan-600"
                          />
                          {perm.action}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Permissions unlock once this module ships.</p>
                  )}
                </div>
              );
            })}
          </div>
        </DrawerField>

        {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
      </div>
    </Drawer>
  );
}

function UserDrawer({
  roles,
  existing,
  defaultRoleId,
  onClose,
  onSaved,
}: {
  roles: RoleResponse[];
  existing?: UserResponse;
  defaultRoleId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(existing?.fullName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(existing?.phoneNumber ?? "");
  const [roleId, setRoleId] = useState<number | "">(
    existing?.role.id ?? defaultRoleId ?? roles[0]?.id ?? ""
  );
  const { departments } = useDepartments();
  const [departmentId, setDepartmentId] = useState<number | "">(existing?.departmentId ?? "");
  const [staffType, setStaffType] = useState<"OFFICE" | "SITE" | "">(existing?.staffType ?? "");
  const [onPayroll, setOnPayroll] = useState(existing?.onPayroll ?? false);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!fullName.trim() || roleId === "" || (!existing && (!email.trim() || !password))) {
      setError("Full name, role, and (for new users) email and password are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (existing) {
        await api.updateUser(existing.id, {
          fullName: fullName.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          roleId: roleId as number,
          departmentId: departmentId === "" ? null : (departmentId as number),
          staffType: staffType || null,
          onPayroll,
          isActive,
        });
      } else {
        await api.createUser({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          roleId: roleId as number,
          departmentId: departmentId === "" ? null : (departmentId as number),
          staffType: staffType || null,
          onPayroll,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to save the user.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? "Edit Member" : "Add Member"}
      onClose={onClose}
      onSave={submit}
      saveLabel={saving ? "Saving…" : "Save"}
    >
      <div className="space-y-4">
        <DrawerField label="Full Name" required>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
        </DrawerField>

        <DrawerField label="Email" required={!existing}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            disabled={!!existing}
          />
        </DrawerField>

        {!existing && (
          <DrawerField label="Password" required>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </DrawerField>
        )}

        <DrawerField label="Phone (optional)">
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input" />
        </DrawerField>

        {/* Department is the org team (Civil, Electrical…) — separate from Role, which is permissions. */}
        <DrawerField label="Department">
          <Select
            value={departmentId === "" ? "" : String(departmentId)}
            onChange={(v) => setDepartmentId(v === "" ? "" : Number(v))}
            placeholder="No department"
            options={[
              { value: "", label: "No department" },
              ...departments.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
          />
        </DrawerField>

        <DrawerField label="Role" required>
          <Select
            value={roleId === "" ? "" : String(roleId)}
            onChange={(v) => setRoleId(v ? Number(v) : "")}
            placeholder="Select role"
            options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
          />
        </DrawerField>

        <DrawerField label="Staff Type">
          <div className="flex gap-1 rounded-lg border border-gray-200 p-1">
            {([["", "Not set"], ["OFFICE", "Office"], ["SITE", "Site"]] as const).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStaffType(val as typeof staffType)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  staffType === val
                    ? "bg-brand-accent text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </DrawerField>

        <DrawerField label="On Payroll">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onPayroll}
              onChange={(e) => setOnPayroll(e.target.checked)}
              className="h-4 w-4 accent-cyan-600"
            />
            Member can punch and has a payroll profile
          </label>
        </DrawerField>

        {existing && (
          <DrawerField label="Status">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-cyan-600"
              />
              Account enabled
            </label>
          </DrawerField>
        )}

        {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
      </div>
    </Drawer>
  );
}

// ---- Previous Settings sections (Company, Notifications, Integrations, Subscription, and the
// hardcoded Roles & Access table/placeholder panels) ----
// Kept for reference; uncomment a section in SECTIONS above and restore its JSX block here
// (adjusting the `section === "..."` checks in the render tree) to bring one back.
//
// const USERS = [
//   { name: "Bhargav (You)", email: "bhargav@hitech.in", role: "Admin", status: "Active" },
//   { name: "Rakesh Shah", email: "rakesh@hitech.in", role: "Project Manager", status: "Active" },
//   { name: "Priya Mehta", email: "priya@hitech.in", role: "Finance", status: "Active" },
//   { name: "Site Desk", email: "site@hitech.in", role: "Site Supervisor", status: "Invited" },
// ];
//
// function OldSettingsPage() {
//   const [section, setSection] = useState<Section>("Company");
//   const [company, setCompany] = useState({ name: "Hi-Tech Construction", phone: "0281-2456789", address: "Office No. 420, Level 6, Imperial Heights, 150ft Ring Road, Rajkot", gstin: "24AABCH1234M1Z9" });
//   const [saved, setSaved] = useState(false);
//
//   return (
//     <AppShell title="Setting">
//       <div className="flex gap-6">
//         <aside className="w-56 shrink-0">
//           <ul className="space-y-1">
//             {SECTIONS.map((s) => (
//               <li key={s}>
//                 <button
//                   onClick={() => setSection(s)}
//                   className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
//                     section === s ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"
//                   }`}
//                 >
//                   {s}
//                 </button>
//               </li>
//             ))}
//           </ul>
//         </aside>
//
//         <div className="min-w-0 flex-1">
//           {section === "Company" && (
//             <div className="rounded-xl border border-gray-200 bg-white p-6">
//               <h3 className="mb-4 text-sm font-semibold text-gray-700">Company Details</h3>
//               <div className="grid max-w-2xl gap-4">
//                 <Field label="Company Name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
//                 <div className="grid grid-cols-2 gap-4">
//                   <Field label="GSTIN" value={company.gstin} onChange={(v) => setCompany({ ...company, gstin: v })} />
//                   <Field label="Phone" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
//                 </div>
//                 <Field label="Registered Address" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />
//                 <div>
//                   <button
//                     onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }}
//                     className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90"
//                   >
//                     {saved ? "Saved ✓" : "Save Changes"}
//                   </button>
//                 </div>
//               </div>
//             </div>
//           )}
//
//           {section === "Roles & Access" && (
//             <SimpleTable
//               columns={[{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "status", label: "Status" }]}
//               rows={USERS}
//             />
//           )}
//
//           {section === "Notifications" && (
//             <div className="rounded-xl border border-gray-200 bg-white p-6">
//               <h3 className="mb-4 text-sm font-semibold text-gray-700">Notifications</h3>
//               <div className="max-w-lg space-y-3">
//                 {["Daily progress report", "Payment due reminders", "Low stock alerts", "Overdue task alerts", "Approval requests"].map((n, i) => (
//                   <label key={n} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
//                     <span className="text-sm text-gray-700">{n}</span>
//                     <input type="checkbox" defaultChecked={i < 3} className="h-4 w-4 accent-cyan-600" />
//                   </label>
//                 ))}
//               </div>
//             </div>
//           )}
//
//           {section === "Integrations" && (
//             <div className="rounded-xl border border-gray-200 bg-white p-6">
//               <h3 className="mb-4 text-sm font-semibold text-gray-700">Integrations</h3>
//               <div className="max-w-lg space-y-3">
//                 {[["Tally", "Not Connected"], ["Zoho Books", "Not Connected"], ["WhatsApp Business", "Connected"]].map(([name, status]) => (
//                   <div key={name} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
//                     <span className="text-sm text-gray-700">{name}</span>
//                     <span className={`rounded-md px-2 py-1 text-xs ${status === "Connected" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>{status}</span>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}
//
//           {section === "Subscription" && (
//             <div className="rounded-xl border border-gray-200 bg-white p-6">
//               <h3 className="mb-1 text-sm font-semibold text-gray-700">Current Plan</h3>
//               <p className="mb-4 text-2xl font-semibold text-brand-accent">Business Pro</p>
//               <div className="grid max-w-md grid-cols-2 gap-4 text-sm">
//                 <div><div className="text-gray-400">Users</div><div className="font-medium text-gray-800">15 / 20</div></div>
//                 <div><div className="text-gray-400">Renews</div><div className="font-medium text-gray-800">31 Mar 2027</div></div>
//               </div>
//             </div>
//           )}
//
//           {["Payroll", "Holiday & Weekoff", "Workflow Controls", "Document & Fields", "Multi Level Approval", "Inspection Forms"].includes(section) && (
//             <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
//               <div className="text-center">
//                 <div className="text-base font-medium text-gray-700">{section}</div>
//                 <div className="mt-1 text-sm text-gray-400">Configuration panel coming soon.</div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </AppShell>
//   );
// }
//
// function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
//   return (
//     <label className="block">
//       <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
//       <input value={value} onChange={(e) => onChange(e.target.value)} className="input" />
//     </label>
//   );
// }
