"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Layers, Plus, Trash2, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { getApprovalChains, saveApprovalChain, getRoles, ApiError } from "@/lib/api";
import type { ApprovalChain, ApprovalMode, RoleResponse } from "@/lib/api";

/**
 * Settings → Multi Level Approval.
 *
 * <p>Left: every approvable record type. Right: the ladder for the selected one. A level holds one
 * or more roles and <em>any</em> of them can clear it; levels are climbed in order, so a level-2
 * approver sees nothing until level 1 has signed.
 *
 * <p>Two modes, because sites want different things:
 * <ul>
 *   <li><b>Reporting chain</b> — levels are derived from the ladder already configured in Roles &amp;
 *       Access. A Team Member under a PM under a Super Admin gets PM then Super Admin automatically,
 *       and it can never drift out of sync with the org chart.
 *   <li><b>Custom levels</b> — pick the roles explicitly, for flows where sign-off doesn't follow
 *       who-reports-to-whom (finance countersigning a purchase, say).
 * </ul>
 *
 * <p>Nothing takes effect until <b>Published</b>: an unpublished chain leaves the record on its old
 * single-decision behaviour, so this is safe to configure ahead of go-live.
 */
export function MultiLevelApproval() {
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Local working copy so an admin can build a ladder before committing it.
  const [draft, setDraft] = useState<{ mode: ApprovalMode; published: boolean; levels: number[][] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([getApprovalChains(), getRoles()]);
      setChains(c);
      setRoles(r);
      setSelected((prev) => prev ?? c[0]?.entityType ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load approval settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => chains.find((c) => c.entityType === selected) ?? null, [chains, selected]);

  // Reset the draft whenever the selected type changes or the server copy is reloaded.
  useEffect(() => {
    if (!current) {
      setDraft(null);
      return;
    }
    setDraft({
      mode: current.mode,
      published: current.published,
      levels: current.levels.map((l) => [...l.roleIds]),
    });
    setSaveError("");
  }, [current]);

  const dirty = useMemo(() => {
    if (!current || !draft) return false;
    return (
      draft.mode !== current.mode ||
      draft.published !== current.published ||
      JSON.stringify(draft.levels) !== JSON.stringify(current.levels.map((l) => l.roleIds))
    );
  }, [current, draft]);

  async function save() {
    if (!current || !draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await saveApprovalChain(current.entityType, {
        mode: draft.mode,
        published: draft.published,
        // Reporting-chain mode derives its levels at submit time, so don't send a ladder for it.
        levels: draft.mode === "EXPLICIT" ? draft.levels.map((roleIds) => ({ roleIds })) : [],
      });
      setChains((prev) => prev.map((c) => (c.entityType === updated.entityType ? updated : c)));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save this chain.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-6 text-center text-sm text-rose-700">{error}</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Record types */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {chains.map((c) => (
            <li key={c.entityType}>
              <button
                onClick={() => setSelected(c.entityType)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                  selected === c.entityType
                    ? "bg-cyan-50/60 font-medium text-brand-accent"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{c.entityLabel}</span>
                {c.published && <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Published" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Ladder editor */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {!current || !draft ? (
          <div className="p-6 text-center text-sm text-slate-400">Pick a record type.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">Approval for {current.entityLabel}</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span className={draft.published ? "font-medium text-emerald-600" : "text-slate-500"}>
                  {draft.published ? "Published" : "Not published"}
                </span>
              </label>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <div className="mb-1.5 text-xs font-medium text-slate-500">How approvers are chosen</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["REPORTING_CHAIN", "Reporting chain", "Derived from Roles & Access — PM, then their manager, and so on."],
                      ["EXPLICIT", "Custom levels", "Pick the roles for each level yourself."],
                    ] as const
                  ).map(([mode, label, hint]) => (
                    <button
                      key={mode}
                      onClick={() => setDraft({ ...draft, mode })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
                        draft.mode === mode
                          ? "border-brand-accent bg-cyan-50/50 ring-1 ring-brand-accent/20"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-sm font-medium text-slate-800">{label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {draft.mode === "REPORTING_CHAIN" ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-sm text-slate-600">
                  Levels are worked out when a request is raised, by walking up from the requester&apos;s role
                  in <span className="font-medium">Roles &amp; Access</span>.
                  <div className="mt-1.5 text-xs text-slate-500">
                    A Team Member reporting to Project Manager, reporting to Super Admin, produces{" "}
                    <span className="font-medium">Level 1 · Project Manager</span> then{" "}
                    <span className="font-medium">Level 2 · Super Admin</span>. Change the ladder in Roles &amp;
                    Access and every future request follows it — nothing to maintain twice.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.levels.map((roleIds, idx) => (
                    <LevelRow
                      key={idx}
                      index={idx}
                      roleIds={roleIds}
                      roles={roles}
                      onChange={(next) => {
                        const levels = [...draft.levels];
                        levels[idx] = next;
                        setDraft({ ...draft, levels });
                      }}
                      onRemove={() => {
                        setDraft({ ...draft, levels: draft.levels.filter((_, i) => i !== idx) });
                      }}
                    />
                  ))}
                  <button
                    onClick={() => setDraft({ ...draft, levels: [...draft.levels, []] })}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-accent hover:bg-cyan-50"
                  >
                    <Plus size={15} /> Add level
                  </button>
                  {draft.published && draft.levels.some((l) => l.length === 0) && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertTriangle size={13} />
                      A level with no approver would stall every request that reached it.
                    </p>
                  )}
                </div>
              )}

              {saveError && <p className="text-sm text-rose-600">{saveError}</p>}

              <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                <button
                  disabled={!dirty || saving}
                  onClick={save}
                  className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent-strong disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {dirty && (
                  <button
                    onClick={() =>
                      setDraft({
                        mode: current.mode,
                        published: current.published,
                        levels: current.levels.map((l) => [...l.roleIds]),
                      })
                    }
                    className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    Discard
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One rung — a multi-select of roles, any of which can clear it. */
function LevelRow({
  index,
  roleIds,
  roles,
  onChange,
  onRemove,
}: {
  index: number;
  roleIds: number[];
  roles: RoleResponse[];
  onChange: (next: number[]) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = roles.filter((r) => roleIds.includes(r.id));

  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0 pt-2 text-sm font-medium text-slate-700">Level {index + 1}</div>
      <div className="relative min-w-0 flex-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[38px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-left transition hover:border-slate-300"
        >
          {selected.length === 0 ? (
            <span className="px-1 text-sm text-slate-400">Choose approver role(s)…</span>
          ) : (
            selected.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-700"
              >
                {r.name}
                <X
                  size={11}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(roleIds.filter((id) => id !== r.id));
                  }}
                  className="cursor-pointer hover:text-cyan-900"
                />
              </span>
            ))
          )}
          <ChevronDown size={14} className="ml-auto shrink-0 text-slate-400" />
        </button>

        {open && (
          <>
            {/* Click-away closes the menu without stealing the checkbox clicks inside it. */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={roleIds.includes(r.id)}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...roleIds, r.id] : roleIds.filter((id) => id !== r.id))
                    }
                    className="rounded border-slate-300"
                  />
                  <span className="text-slate-700">{r.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        onClick={onRemove}
        title="Remove level"
        className="mt-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
