"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, FlaskConical, Layers, Plus, Trash2, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import {
  ApiError,
  deleteApprovalRule,
  getApprovalChains,
  getApprovalRules,
  getPayrollPeople,
  getProjects,
  getRoles,
  previewApprovalChain,
  previewLeaveApproval,
  saveApprovalChain,
  saveApprovalRule,
} from "@/lib/api";
import type {
  ApprovalChain,
  ApprovalChainInput,
  ApprovalMode,
  ApprovalPreview,
  ApprovalScope,
  ProjectResponse,
  RoleResponse,
  UserResponse,
} from "@/lib/api";

/**
 * Settings → Multi Level Approval.
 *
 * <p>Left: every approvable record type. Right, in three tabs:
 * <ul>
 *   <li><b>Default chain</b> — the steps every office/site uses. Each step is a role, and either
 *       anyone holding it approves ("Any office" — HR Head, Super Admin) or only holders on the
 *       applicant's own office/site ("Same office/site" — their Office Manager, their site's PM).
 *       With "skip" on, a step nobody at that office/site can approve is left out automatically —
 *       so one chain fits the main office (no office manager) and the branches (with one).</li>
 *   <li><b>Office/site rules</b> — a different chain for one office/site (project), for the few
 *       that want their own order.</li>
 *   <li><b>Test a chain</b> — pick a person and see exactly who their request would go to.</li>
 * </ul>
 *
 * <p>Nothing takes effect until <b>Published</b>: an unpublished chain leaves the record on its old
 * single-decision behaviour, so this is safe to configure ahead of go-live.
 */

type Step = { roleIds: number[]; scope: ApprovalScope };
type Draft = { mode: ApprovalMode; published: boolean; skipEmpty: boolean; levels: Step[] };
type Tab = "default" | "rules" | "test";

const toDraft = (c: ApprovalChain): Draft => ({
  mode: c.mode,
  published: c.published,
  skipEmpty: c.skipEmpty ?? true,
  levels: c.levels.map((l) => ({ roleIds: [...l.roleIds], scope: l.scope ?? "ANY" })),
});

const toInput = (d: Draft): ApprovalChainInput => ({
  mode: d.mode,
  published: d.published,
  skipEmpty: d.skipEmpty,
  // Reporting-chain mode derives its levels at submit time, so don't send a ladder for it.
  levels: d.mode === "EXPLICIT" ? d.levels.map((l) => ({ roleIds: l.roleIds, scope: l.scope })) : [],
});

export function MultiLevelApproval() {
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("default");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, p] = await Promise.all([
        getApprovalChains(),
        getRoles(),
        getProjects({ size: 500 }).then((x) => x.content).catch(() => [] as ProjectResponse[]),
      ]);
      setChains(c);
      setRoles(r);
      setProjects(p);
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
                  selected === c.entityType ? "bg-cyan-50/60 font-medium text-brand-accent" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{c.entityLabel}</span>
                {c.published && <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Published" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {!current ? (
          <div className="p-6 text-center text-sm text-slate-400">Pick a record type.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 pt-2">
              {(
                [
                  ["default", "Default chain", Layers],
                  ["rules", "Office/site rules", Building2],
                  ["test", "Test a chain", FlaskConical],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                    tab === key ? "border-brand-accent text-brand-accent" : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {tab === "default" && (
              <DefaultChain
                key={current.entityType}
                chain={current}
                roles={roles}
                onSaved={(updated) => setChains((prev) => prev.map((c) => (c.entityType === updated.entityType ? updated : c)))}
              />
            )}
            {tab === "rules" && <RulesTab key={current.entityType} chain={current} roles={roles} projects={projects} />}
            {tab === "test" && <TestTab key={current.entityType} chain={current} projects={projects} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Default chain

function DefaultChain({ chain, roles, onSaved }: { chain: ApprovalChain; roles: RoleResponse[]; onSaved: (c: ApprovalChain) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(chain));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => setDraft(toDraft(chain)), [chain]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(chain));

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      onSaved(await saveApprovalChain(chain.entityType, toInput(draft)));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save this chain.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">Approval for {chain.entityLabel} — every office &amp; site</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} className="rounded border-slate-300" />
          <span className={draft.published ? "font-medium text-emerald-600" : "text-slate-500"}>{draft.published ? "Published" : "Not published"}</span>
        </label>
      </div>
      {APPLIES_WHEN[chain.entityType] && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">When it applies: </span>
          {APPLIES_WHEN[chain.entityType]} Requests show under <span className="font-medium">Approvals</span> in the sidebar.
        </p>
      )}

      <div>
        <div className="mb-1.5 text-xs font-medium text-slate-500">How approvers are chosen</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["EXPLICIT", "Custom steps", "Pick the role for each step, and whether it comes from the applicant's own office/site."],
              ["REPORTING_CHAIN", "Reporting chain", "Derived from Roles & Access — their role's manager, then theirs, and so on."],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              onClick={() => setDraft({ ...draft, mode })}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
                draft.mode === mode ? "border-brand-accent bg-cyan-50/50 ring-1 ring-brand-accent/20" : "border-slate-200 hover:bg-slate-50"
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
          Steps are worked out when a request is raised, by walking up from the requester&apos;s role in{" "}
          <span className="font-medium">Roles &amp; Access</span>. Switch to <span className="font-medium">Custom steps</span> to choose roles per
          step, limit a step to the applicant&apos;s own office/site, and use office/site rules.
        </div>
      ) : (
        <StepsEditor draft={draft} setDraft={setDraft} roles={roles} />
      )}

      {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <button disabled={!dirty || saving} onClick={save} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-accent-strong disabled:opacity-40">
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && (
          <button onClick={() => setDraft(toDraft(chain))} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

/** The steps list + the skip switch — shared by the default chain and office/site rules. */
function StepsEditor({ draft, setDraft, roles }: { draft: Draft; setDraft: (d: Draft) => void; roles: RoleResponse[] }) {
  return (
    <div className="space-y-2">
      {draft.levels.map((step, idx) => (
        <LevelRow
          key={idx}
          index={idx}
          step={step}
          roles={roles}
          onChange={(next) => {
            const levels = [...draft.levels];
            levels[idx] = next;
            setDraft({ ...draft, levels });
          }}
          onRemove={() => setDraft({ ...draft, levels: draft.levels.filter((_, i) => i !== idx) })}
        />
      ))}
      <button
        onClick={() => setDraft({ ...draft, levels: [...draft.levels, { roleIds: [], scope: "ANY" }] })}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-accent hover:bg-cyan-50"
      >
        <Plus size={15} /> Add step
      </button>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <input type="checkbox" checked={draft.skipEmpty} onChange={(e) => setDraft({ ...draft, skipEmpty: e.target.checked })} className="mt-0.5 rounded border-slate-300" />
        <span>
          Skip a step automatically when nobody at that office/site holds the role
          <span className="block text-xs text-slate-500">
            e.g. the main office has no Office Manager — its requests go straight to the next step.
          </span>
        </span>
      </label>
      {draft.levels.some((l) => l.roleIds.length === 0) && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle size={13} />
          Every step needs a role.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Office/site rules

function RulesTab({ chain, roles, projects }: { chain: ApprovalChain; roles: RoleResponse[]; projects: ProjectResponse[] }) {
  const [rules, setRules] = useState<ApprovalChain[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ projectId: number | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRules(await getApprovalRules(chain.entityType));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the rules.");
    }
  }, [chain.entityType]);
  useEffect(() => {
    void load();
  }, [load]);

  const used = new Set((rules ?? []).map((r) => r.projectId));
  const describe = (c: ApprovalChain) =>
    c.levels.length === 0
      ? "No steps"
      : c.levels.map((l) => `${l.roleNames.join(" / ")}${l.scope === "SAME_PROJECT" ? " (same office/site)" : ""}`).join(" → ");

  async function save() {
    if (!editing?.projectId) return setError("Pick the office/site first.");
    setSaving(true);
    try {
      await saveApprovalRule(chain.entityType, editing.projectId, { ...toInput({ ...editing.draft, mode: "EXPLICIT" }), published: true });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the rule.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(projectId: number) {
    if (!confirm("Remove this rule? That office/site goes back to the default chain.")) return;
    await deleteApprovalRule(chain.entityType, projectId);
    await load();
  }

  return (
    <div className="space-y-3 p-4">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        A rule gives one office/site (project) its own steps for <span className="font-medium">{chain.entityLabel}</span>. Everyone whose home
        office/site is that project follows the rule; every other office/site uses the <span className="font-medium">Default chain</span>.
        {!chain.published && <span className="ml-1 font-medium text-amber-700">Publish the default chain first — rules only apply while it is published.</span>}
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {rules == null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rules.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">No rules yet — every office/site uses the default chain.</li>}
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Building2 size={15} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{r.projectName ?? `Project #${r.projectId}`}</span>
                <span className="block text-xs text-slate-500">{describe(r)}</span>
              </span>
              <button onClick={() => setEditing({ projectId: r.projectId, draft: toDraft(r) })} className="rounded-md px-2 py-1 text-xs font-medium text-brand-accent hover:bg-cyan-50">
                Edit
              </button>
              <button onClick={() => r.projectId != null && void remove(r.projectId)} className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">
                Remove
              </button>
            </li>
          ))}
          <li className="flex items-center gap-3 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">Every other office/site → uses the Default chain</li>
        </ul>
      )}

      {!editing ? (
        <button
          onClick={() => setEditing({ projectId: null, draft: { mode: "EXPLICIT", published: true, skipEmpty: true, levels: [{ roleIds: [], scope: "ANY" }] } })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Add rule
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-brand-accent/30 bg-cyan-50/20 p-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Office / site</span>
            <select
              value={editing.projectId ?? ""}
              onChange={(e) => setEditing({ ...editing, projectId: e.target.value ? Number(e.target.value) : null })}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} disabled={used.has(p.id) && p.id !== editing.projectId}>
                  {p.name}
                  {used.has(p.id) && p.id !== editing.projectId ? " (has a rule)" : ""}
                </option>
              ))}
            </select>
          </label>
          <StepsEditor draft={editing.draft} setDraft={(d) => setEditing({ ...editing, draft: d })} roles={roles} />
          <div className="flex gap-2">
            <button
              disabled={saving || !editing.projectId || editing.draft.levels.length === 0 || editing.draft.levels.some((l) => !l.roleIds.length)}
              onClick={save}
              className="rounded-lg bg-brand-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save rule"}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Test a chain

function TestTab({ chain, projects }: { chain: ApprovalChain; projects: ProjectResponse[] }) {
  const isLeave = chain.entityType === "LEAVE_APPLICATION";
  const [people, setPeople] = useState<UserResponse[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [result, setResult] = useState<ApprovalPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPayrollPeople()
      .then((r) => setPeople(r.content.filter((u) => u.isActive !== false)))
      .catch(() => setPeople([]));
  }, []);

  async function run() {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      setResult(isLeave ? await previewLeaveApproval(userId) : await previewApprovalChain(chain.entityType, userId, projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't work out the chain.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-slate-500">
        Pick a person to see exactly who their {chain.entityLabel.toLowerCase()} would go to{isLeave ? " — from their home office/site" : ""}, and which
        steps would be skipped. Nothing is saved.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Person</span>
          <select value={userId ?? ""} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Choose…</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </label>
        {!isLeave && (
          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Office / site</span>
            <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
        <button disabled={!userId || busy} onClick={run} className="rounded-lg bg-brand-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Checking…" : "Show chain"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {result && <ChainPreviewView preview={result} />}
    </div>
  );
}

/** A worked-out chain: which rule applied, each step with who would be asked, skipped steps greyed. */
export function ChainPreviewView({ preview }: { preview: ApprovalPreview }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="mb-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{preview.userName}</span> · home office/site:{" "}
        <span className="font-medium text-slate-700">{preview.projectName ?? "not set"}</span>
        {preview.chainUsed && <> · uses <span className="font-medium text-slate-700">{preview.chainUsed}</span></>}
      </div>
      {preview.message && <p className="mb-2 text-xs text-amber-700">{preview.message}</p>}
      <ol className="space-y-1.5">
        {preview.steps.map((s, i) => (
          <li key={i} className={`flex items-start gap-2 ${s.skipped ? "text-slate-400" : ""}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${s.skipped ? "bg-slate-100" : "bg-cyan-50 text-brand-accent"}`}>
              {s.skipped ? "–" : s.levelOrder}
            </span>
            <span>
              <span className={`font-medium ${s.skipped ? "line-through" : "text-slate-800"}`}>{s.roleNames}</span>
              <span className="ml-1 text-xs">· {s.from}</span>
              {!s.skipped && s.approvers.length > 0 && <span className="block text-xs text-slate-500">Asked: {s.approvers.join(", ")}</span>}
              {s.note && <span className={`block text-xs ${s.skipped ? "" : "text-amber-700"}`}>{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- one step

/** One step — the role(s), any of which can clear it, and where its approver comes from. */
function LevelRow({ index, step, roles, onChange, onRemove }: { index: number; step: Step; roles: RoleResponse[]; onChange: (next: Step) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const selected = roles.filter((r) => step.roleIds.includes(r.id));

  return (
    <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
      <div className="w-16 shrink-0 pt-2 text-sm font-medium text-slate-700">Step {index + 1}</div>
      <div className="relative min-w-0 flex-1">
        <button onClick={() => setOpen((v) => !v)} className="flex min-h-[38px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-left transition hover:border-slate-300">
          {selected.length === 0 ? (
            <span className="px-1 text-sm text-slate-400">Choose approver role…</span>
          ) : (
            selected.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
                {r.name}
                <X
                  size={11}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...step, roleIds: step.roleIds.filter((id) => id !== r.id) });
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
                    checked={step.roleIds.includes(r.id)}
                    onChange={(e) =>
                      onChange({ ...step, roleIds: e.target.checked ? [...step.roleIds, r.id] : step.roleIds.filter((id) => id !== r.id) })
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
      <label className="w-44 shrink-0 text-xs text-slate-500" title="Approver from — any office, or only the applicant's own office/site">
        <select
          value={step.scope}
          onChange={(e) => onChange({ ...step, scope: e.target.value as ApprovalScope })}
          title="Where the approver comes from"
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="ANY">Any office</option>
          <option value="SAME_PROJECT">Same office/site</option>
        </select>
      </label>
      <button onClick={onRemove} title="Remove step" className="mt-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/** What raises a request for each chain, and what approving / rejecting does. Mirrors the backend hooks. */
const APPLIES_WHEN: Record<string, string> = {
  LEAVE_APPLICATION: "A member applies for leave. Their home office/site decides which rule applies. Attendance is marked PL once the last step approves.",
  TASK_COMPLETION: "A task is marked complete.",
  PAYROLL_RUN: "HR locks a month's payroll run. It can only be marked paid after approval; a rejection sends it back to draft.",
  PURCHASE_ORDER: "A purchase order is saved in Vyapar (including POs raised from an RFQ award). Rejecting cancels the PO.",
  SALES_INVOICE: "A sale invoice is saved. Rejecting cancels the invoice.",
  SALE_RETURN: "A credit note / sale return is saved. Rejecting cancels it.",
  PAYMENT_ENTRY: "A Payment In or Payment Out is recorded. Rejecting marks it rejected (money already moved isn't reversed).",
  SITE_EXPENSE: "An expense is saved. Rejecting cancels the expense.",
  MATERIAL_PURCHASE: "A purchase bill is saved. Rejecting cancels the bill.",
  PURCHASE_RETURN: "A debit note / purchase return is saved. Rejecting cancels it.",
  TENDER_SUBMISSION: "A tender is moved to the next stage. The tender stays where it is until approved.",
};
