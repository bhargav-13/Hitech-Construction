"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Info, Lock } from "lucide-react";
import * as api from "@/lib/api";
import type { ModuleResponse, PermissionResponse, RoleResponse } from "@/lib/api";
import { Select } from "@/components/Select";

/**
 * The role editor — one section per module, each with an ON/OFF switch and a grid of that module's
 * features (Full Access / View / Create / Edit, with Delete and Approve under "More permissions").
 *
 * <p>Modules are listed in sidebar order. A module the app doesn't let you grant yet (Report,
 * Finance, …) isn't shown, and any permission a role already holds on one is carried through save
 * untouched.
 *
 * <p>The server has the final word on consistency (PermissionRules): a module switched off loses
 * everything inside it, an action includes view, and module-level actions are derived from the
 * features. This screen applies the same rules as you click so what you see is what gets saved.
 */

type Action = PermissionResponse["action"];

// Sidebar order. `rule` explains who-sees-what that is decided automatically, not by this screen.
const MODULES: { code: string; rule?: string }[] = [
  { code: "DASHBOARD" },
  { code: "TENDER" },
  {
    code: "PROJECT",
    rule: "Office staff see every project. Site staff see only the projects they are a member of.",
  },
  {
    code: "TASKOPAD",
    rule: "Everyone sees the tasks they created, follow or are assigned. A manager can also see their team's tasks through the role hierarchy.",
  },
  { code: "VYAPAR", rule: "Entries are limited to the projects the person can access." },
  { code: "PROCUREMENT" },
  {
    code: "PAYROLL",
    rule: "With Payroll on, everyone gets self-service: their own attendance, leave, payslips, loans and reimbursements. The rows below add team-level access.",
  },
  {
    code: "WAREHOUSE",
    rule: "Which stores a person works in, and as keeper or supervisor, is set per store under Warehouse › Access.",
  },
  { code: "AUDIT" },
  { code: "APPROVAL" },
  { code: "USER_MANAGEMENT" },
  { code: "SETTINGS" },
];

const GRID: Action[] = ["VIEW", "CREATE", "EDIT"];
const MORE: Action[] = ["DELETE", "APPROVE"];
const ACTION_LABEL: Record<Action, string> = {
  VIEW: "View",
  CREATE: "Create",
  EDIT: "Edit",
  DELETE: "Delete",
  APPROVE: "Approve",
};

type Row = { key: string; label: string; perms: Partial<Record<Action, PermissionResponse>>; isModuleRow: boolean };
type Section = { module: ModuleResponse; switchPerm: PermissionResponse; rows: Row[]; rule?: string };

const byAction = (perms: PermissionResponse[]) =>
  Object.fromEntries(perms.map((p) => [p.action, p])) as Partial<Record<Action, PermissionResponse>>;

export function RoleEditor({
  modules,
  roles,
  existing,
  onCancel,
  onSaved,
}: {
  modules: ModuleResponse[];
  roles: RoleResponse[];
  existing?: RoleResponse;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [reportsToRoleId, setReportsToRoleId] = useState<string>(existing?.reportsToRoleId ? String(existing.reportsToRoleId) : "");
  const [selected, setSelected] = useState<Set<number>>(new Set(existing?.permissions.map((p) => p.id) ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [openMore, setOpenMore] = useState<string | null>(null);

  const isSuperAdmin = existing != null && existing.name.trim().toLowerCase() === "super admin";
  const locked = isSuperAdmin;
  const parentOptions = roles.filter((r) => r.id !== existing?.id);

  const sections: Section[] = useMemo(() => {
    return MODULES.flatMap(({ code, rule }) => {
      const mod = modules.find((m) => m.code === code && !m.parentCode);
      const own = mod ? byAction(mod.permissions) : {};
      if (!mod || !own.VIEW) return [];
      const features = modules
        .filter((m) => m.parentCode === code)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const rows: Row[] = features.length
        ? features.map((f) => ({ key: f.code, label: f.name, perms: byAction(f.permissions), isModuleRow: false }))
        : // A module without features is one row: its own actions, View being the switch itself.
          [{ key: mod.code, label: mod.name, perms: own, isModuleRow: true }];
      return [{ module: mod, switchPerm: own.VIEW, rows, rule }];
    });
  }, [modules]);

  const has = (p?: PermissionResponse) => !!p && selected.has(p.id);

  function update(fn: (next: Set<number>) => void) {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      fn(next);
      return next;
    });
  }

  function setModule(section: Section, on: boolean) {
    update((next) => {
      if (on) {
        next.add(section.switchPerm.id);
        // Switching a module on starts everyone off able to see all of it — the usual first step.
        for (const row of section.rows) if (row.perms.VIEW) next.add(row.perms.VIEW.id);
      } else {
        for (const p of section.module.permissions) next.delete(p.id);
        for (const row of section.rows) for (const p of Object.values(row.perms)) if (p) next.delete(p.id);
      }
    });
  }

  function setAction(row: Row, action: Action, on: boolean) {
    update((next) => {
      const perm = row.perms[action];
      if (!perm) return;
      if (on) {
        next.add(perm.id);
        if (row.perms.VIEW) next.add(row.perms.VIEW.id); // any action includes seeing it
      } else if (action === "VIEW" && !row.isModuleRow) {
        // Can't act on what you can't see.
        for (const p of Object.values(row.perms)) if (p) next.delete(p.id);
      } else {
        next.delete(perm.id);
      }
    });
  }

  function setFull(row: Row, on: boolean) {
    update((next) => {
      for (const [action, p] of Object.entries(row.perms)) {
        if (!p || (row.isModuleRow && action === "VIEW")) continue;
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
    });
  }

  const isFull = (row: Row) =>
    Object.entries(row.perms).every(([, p]) => !p || selected.has(p.id));

  const onCount = sections.filter((s) => has(s.switchPerm)).length;

  async function save() {
    if (!name.trim()) {
      setError("Role name is required.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        reportsToRoleId: reportsToRoleId === "" ? null : Number(reportsToRoleId),
        permissionIds: Array.from(selected),
      };
      if (existing) await api.updateRole(existing.id, body);
      else await api.createRole(body);
      onSaved();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Unable to save the role.");
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/95 px-1 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-800">{existing ? `Edit role · ${existing.name}` : "New Role"}</h2>
          <p className="text-xs text-gray-500">
            {onCount} of {sections.length} modules on
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          {!locked && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {isSuperAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock size={14} className="mt-0.5 shrink-0" />
          Super Admin always has full access to every module. Its access can&apos;t be narrowed.
        </div>
      )}

      {/* Role details */}
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            Role name <span className="text-rose-500">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={existing?.isSystem}
            className="input"
            placeholder="e.g. Site Engineer"
          />
        </label>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-500">Reports to</span>
          {isSuperAdmin ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">Top of the ladder</div>
          ) : (
            <Select
              value={reportsToRoleId}
              onChange={setReportsToRoleId}
              options={[
                { value: "", label: "Super Admin (top)" },
                ...parentOptions.filter((r) => r.name.toLowerCase() !== "super admin").map((r) => ({ value: String(r.id), label: r.name })),
              ]}
            />
          )}
        </div>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="input resize-none"
            placeholder="What this role is for"
          />
        </label>
      </div>

      {/* Modules */}
      <div className="space-y-3">
        {sections.map((section) => {
          const on = isSuperAdmin || has(section.switchPerm);
          const showMore = section.rows.some((r) => MORE.some((a) => r.perms[a]));
          const single = section.rows.length === 1 && section.rows[0].isModuleRow;
          return (
            <section key={section.module.code} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className={`flex items-center justify-between gap-3 px-4 py-3 ${on ? "bg-gray-50" : ""}`}>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${on ? "text-gray-800" : "text-gray-500"}`}>{section.module.name}</div>
                  {!on && (
                    <div className="text-xs text-gray-400">
                      Off — hidden from this role&apos;s sidebar
                      {section.rows.length > 1 ? ` · ${section.rows.length} features` : ""}
                    </div>
                  )}
                </div>
                <Switch on={on} disabled={locked} onChange={(v) => setModule(section, v)} label={section.module.name} />
              </div>

              {on && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  {section.rule && (
                    <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500">
                      <Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
                      {section.rule}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50/70 text-xs font-medium text-gray-500">
                          <th className="px-3 py-2 text-left font-medium">{single ? "" : "Feature"}</th>
                          <th className="w-24 px-2 py-2 text-center font-medium">Full Access</th>
                          {GRID.map((a) => (
                            <th key={a} className="w-20 px-2 py-2 text-center font-medium">{ACTION_LABEL[a]}</th>
                          ))}
                          {showMore && <th className="w-44 px-2 py-2 text-right font-medium">More permissions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => {
                          const more = MORE.filter((a) => row.perms[a]);
                          const moreOn = more.filter((a) => has(row.perms[a])).length;
                          const menuKey = `${section.module.code}:${row.key}`;
                          return (
                            <tr key={row.key} className="border-t border-gray-100 first:border-t-0">
                              <td className="px-3 py-2.5 text-gray-700">{single ? <span className="text-gray-400">{row.label}</span> : row.label}</td>
                              <td className="px-2 py-2.5 text-center">
                                <Check checked={isSuperAdmin || isFull(row)} disabled={locked} onChange={(v) => setFull(row, v)} label={`${row.label} full access`} />
                              </td>
                              {GRID.map((a) => (
                                <td key={a} className="px-2 py-2.5 text-center">
                                  {row.perms[a] ? (
                                    <Check
                                      checked={isSuperAdmin || has(row.perms[a]) || (row.isModuleRow && a === "VIEW")}
                                      disabled={locked || (row.isModuleRow && a === "VIEW")}
                                      onChange={(v) => setAction(row, a, v)}
                                      label={`${row.label} ${ACTION_LABEL[a]}`}
                                    />
                                  ) : (
                                    <span className="text-gray-200">—</span>
                                  )}
                                </td>
                              ))}
                              {showMore && (
                                <td className="relative px-2 py-2.5 text-right">
                                  {more.length > 0 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setOpenMore(openMore === menuKey ? null : menuKey)}
                                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                          moreOn || isSuperAdmin ? "text-brand-accent hover:bg-cyan-50" : "text-gray-500 hover:bg-gray-100"
                                        }`}
                                      >
                                        {isSuperAdmin ? "All" : moreOn ? more.filter((a) => has(row.perms[a])).map((a) => ACTION_LABEL[a]).join(", ") : "More permissions"}
                                        <ChevronDown size={12} />
                                      </button>
                                      {openMore === menuKey && (
                                        <>
                                          <div className="fixed inset-0 z-30" onClick={() => setOpenMore(null)} />
                                          <div className="animate-menu-pop absolute right-2 top-10 z-40 w-44 rounded-xl border border-gray-100 bg-white p-1 text-left shadow-xl">
                                            {more.map((a) => (
                                              <label
                                                key={a}
                                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 ${locked ? "" : "cursor-pointer hover:bg-gray-50"}`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isSuperAdmin || has(row.perms[a])}
                                                  disabled={locked}
                                                  onChange={(e) => setAction(row, a, e.target.checked)}
                                                  className="h-4 w-4 accent-cyan-600"
                                                />
                                                {ACTION_LABEL[a]}
                                              </label>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="pb-6 text-xs text-gray-400">
        Changes apply the next time a person signs in or their session refreshes.
      </p>
    </div>
  );
}

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} ${on ? "on" : "off"}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full text-[10px] font-bold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
        on ? "bg-brand-accent" : "bg-gray-200"
      }`}
    >
      <span className={`absolute ${on ? "left-1.5 text-white" : "right-1.5 text-gray-500"}`}>{on ? "ON" : "OFF"}</span>
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${on ? "left-[26px]" : "left-0.5"}`}
      />
    </button>
  );
}

function Check({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}
