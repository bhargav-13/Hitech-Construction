"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, ShieldCheck, UserRound } from "lucide-react";
import { useUsers } from "@/lib/useUsers";
import { useAuthStore } from "@/lib/authStore";
import { getProjectMembers, setProjectMembers } from "@/lib/tasksApi";
import { projectAvatarColor } from "@/lib/projectHelpers";

/**
 * Manage who can access a project. Membership drives per-user project visibility (a non-admin only
 * sees projects they're a member of, and only those show in the header project dropdown). Editing
 * requires PROJECT:EDIT; otherwise the list is read-only.
 */
export function ProjectMembers({ projectId }: { projectId: string }) {
  const { users, loading: usersLoading } = useUsers();
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const canEdit = permissions.includes("PROJECT:EDIT");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await getProjectMembers(Number(projectId));
        if (!cancelled) {
          const set = new Set(ids.map(String));
          setSelected(set);
          setInitial(new Set(set));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load members");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const id of selected) if (!initial.has(id)) return true;
    return false;
  }, [selected, initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  }, [users, search]);

  function toggle(id: string) {
    if (!canEdit) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await setProjectMembers(Number(projectId), [...selected].map(Number));
      setInitial(new Set(selected));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save members.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || usersLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
        <Loader2 className="mr-2 animate-spin" size={18} /> Loading members…
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Project Members</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {selected.size} of {users.length} people can access this project.
            {!canEdit && " You have read-only access."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-40 bg-transparent text-sm outline-none"
            />
          </div>
          {canEdit && (
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {savedAt && !dirty ? "Saved" : "Save members"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {filtered.map((u) => {
          const on = selected.has(u.id);
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              disabled={!canEdit}
              className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
                canEdit ? "cursor-pointer hover:bg-cyan-50/40" : "cursor-default"
              } ${on ? "bg-cyan-50/30" : ""}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${projectAvatarColor(u.id)}`}
              >
                <UserRound size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{u.name}</div>
                <div className="truncate text-xs text-gray-400">{u.role}</div>
              </div>
              {u.role === "Super Admin" && (
                <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                  <ShieldCheck size={11} /> sees all
                </span>
              )}
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
                  on ? "border-brand-accent bg-brand-accent text-white" : "border-gray-300 bg-white text-transparent"
                }`}
              >
                <Check size={13} />
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No people match “{search}”.</div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Super Admins can access every project regardless of membership. Adding someone here lets them see
        this project in their list and the header project dropdown.
      </p>
    </div>
  );
}
