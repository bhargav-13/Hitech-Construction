"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  Link2,
  ListPlus,
  MoveDown,
  Pencil,
  Plus,
  SlidersHorizontal,
  Target as TargetIcon,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { TargetDrawer, QtyPill } from "@/components/project/TargetDrawer";
import { inr } from "@/lib/format";
import { useUsers } from "@/lib/useUsers";
import * as api from "@/lib/projectTargetApi";
import type { ApiTarget, TargetStatus } from "@/lib/projectTargetApi";
import { TARGET_COLUMNS, useTargetColumns, type TargetColumnKey } from "@/lib/targetColumns";
import {
  TARGET_STATUS_META,
  buildRows,
  delayDays,
  delayOf,
  shortDate,
  useProjectTargets,
  useTargetTotals,
  workingDays,
} from "@/lib/useProjectTargets";

/**
 * Targets — what is actually being built, line by line.
 *
 * <p>Separate from the BOQ on purpose. The BOQ is the commercial document: what we bill and what we
 * budgeted. Targets are the site's view of the same rows, and the people who open them are not the
 * people reading margins.
 *
 * <p><b>Progress is reported against a line, never a family.</b> A family is a heading here — it
 * rolls its children up <em>by value</em>, because a family holding cum, rmt and nos has no
 * meaningful summed quantity, and the percentage taken from one is the number the site team
 * correctly refused to trust. Clicking a family expands it; the work is on the lines inside.
 */
export function ProjectTargets({ projectId }: { projectId: number }) {
  const { boq, targets, loading, error, reload } = useProjectTargets(projectId);
  const totals = useTargetTotals(boq, targets);

  if (loading) {
    return <div className="animate-fade-in py-16 text-center text-sm text-gray-400">Loading targets…</div>;
  }

  if (error) {
    return (
      <div className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <p>
          <strong>Couldn&apos;t load targets.</strong> {error}
        </p>
      </div>
    );
  }

  if (!boq) {
    return (
      <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
          <TargetIcon size={24} />
        </div>
        <div className="text-base font-semibold text-gray-700">No BOQ on this project yet</div>
        <p className="mt-1 max-w-md text-sm text-gray-400">
          Targets are built from the project&apos;s BOQ lines, so the work being measured is the work being
          billed. Create the BOQ first and the targets follow.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <header className="grid grid-cols-2 divide-x divide-gray-100 rounded-xl border border-gray-200 bg-white lg:grid-cols-5">
        <Stat label="Targets" value={`${totals!.complete}/${totals!.total}`} sub="complete" />
        <Stat label="Physical progress" value={`${totals!.progressPct.toFixed(1)}%`} sub="by value of work done" />
        <Stat label="Work done" value={inr(totals!.doneValue)} sub={`of ${inr(totals!.value)} BOQ value`} />
        <Stat label="At risk" value={String(totals!.atRisk)} sub="behind their window" />
        <Stat label="Not targeted" value={String(totals!.untargeted)} sub="BOQ lines with no target" />
      </header>

      <TargetsTable projectId={projectId} boq={boq} targets={targets} reload={reload} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-gray-800">{value}</div>
      <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

function TargetsTable({
  projectId,
  boq,
  targets,
  reload,
}: {
  projectId: number;
  boq: NonNullable<ReturnType<typeof useProjectTargets>["boq"]>;
  targets: ApiTarget[];
  reload: () => Promise<void>;
}) {
  const { shows, visible } = useTargetColumns();
  const { users } = useUsers();

  // Families start collapsed — the schedule opens as its list of titles, and you expand the one you
  // are reporting against rather than scrolling past every other title's lines.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(boq.items.map((i) => i.groupKey || "—")),
  );
  const [status, setStatus] = useState<"ALL" | TargetStatus>("ALL");
  const [assignee, setAssignee] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<{ target: ApiTarget | null; parentId: number | null; boqItemId: number | null } | null>(null);
  const [linking, setLinking] = useState<ApiTarget | null>(null);
  const [error, setError] = useState("");

  const rows = useMemo(
    () => buildRows(boq, targets, { collapsed, status, search, assignee }),
    [boq, targets, collapsed, status, search, assignee],
  );

  const open = targets.find((t) => t.id === openId) ?? null;
  const openItem = open ? boq.items.find((i) => i.id === open.boqItemId) ?? null : null;

  const toggleFamily = (key: string) =>
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change was refused.");
    }
  }

  /** Column count for the full-width rows, so a family header spans the table however it is configured. */
  const span = 2 + visible.length + 1;

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0 text-rose-400 hover:text-rose-600">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search targets"
          className="w-48 rounded-lg border border-gray-200 px-2.5 py-2 text-xs focus:border-brand-accent focus:outline-none"
        />
        <Select
          value={status}
          onChange={(v) => setStatus(v as "ALL" | TargetStatus)}
          size="sm"
          className="w-36"
          options={[
            { value: "ALL", label: "All status" },
            ...(Object.keys(TARGET_STATUS_META) as TargetStatus[]).map((s) => ({
              value: s,
              label: TARGET_STATUS_META[s].label,
            })),
          ]}
        />
        <Select
          value={assignee === null ? "" : String(assignee)}
          onChange={(v) => setAssignee(v ? Number(v) : null)}
          size="sm"
          className="w-40"
          options={[
            { value: "", label: "Anyone" },
            ...users.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <span className="text-xs text-gray-400">
          {targets.filter((t) => t.parentId === null).length} targets · {boq.items.length} BOQ lines
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicker(true)}
            title="Show / hide columns"
            aria-label="Show or hide columns"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            <SlidersHorizontal size={13} /> Columns
          </button>
          <button
            type="button"
            onClick={() => setEditing({ target: null, parentId: null, boqItemId: null })}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <Plus size={13} /> Target
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-medium whitespace-nowrap">#</th>
              <th className="px-3 py-2 text-left font-medium">Target</th>
              {shows("status") && <th className="px-3 py-2 text-left font-medium">Status</th>}
              {shows("progress") && <th className="px-3 py-2 text-left font-medium">Progress</th>}
              {shows("delay") && <th className="px-3 py-2 text-left font-medium">Delay</th>}
              {shows("assignedTo") && <th className="px-3 py-2 text-left font-medium">Assigned to</th>}
              {shows("duration") && <th className="px-3 py-2 text-right font-medium">Duration</th>}
              {shows("schedule") && <th className="px-3 py-2 text-left font-medium">Schedule</th>}
              {shows("actual") && <th className="px-3 py-2 text-left font-medium">Actual</th>}
              {shows("forecastEnd") && <th className="px-3 py-2 text-left font-medium">Forecast end</th>}
              {shows("dependencies") && <th className="px-3 py-2 text-left font-medium">Depends on</th>}
              {shows("value") && <th className="px-3 py-2 text-right font-medium">Value earned</th>}
              {shows("tag") && <th className="px-3 py-2 text-left font-medium">Tag</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={span} className="px-3 py-12 text-center text-sm text-gray-400">
                  Nothing matches those filters.
                </td>
              </tr>
            )}

            {rows.map((row, i) => {
              if (row.kind === "family") {
                const isOpen = !collapsed.has(row.key);
                return (
                  <tr key={`fam-${row.key}`} className="border-b border-gray-100 bg-gray-50/60">
                    <td className="px-2 py-2" />
                    <td colSpan={span - 2} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleFamily(row.key)}
                        className="flex items-center gap-1.5 text-left"
                      >
                        {isOpen ? (
                          <ChevronDown size={14} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={14} className="text-gray-400" />
                        )}
                        <span className="min-w-0 truncate text-[13px] font-semibold text-gray-700" title={row.label}>
                          {row.label}
                        </span>
                        <span className="shrink-0 text-[11px] whitespace-nowrap text-gray-400">
                          {row.lineCount} {row.lineCount === 1 ? "item" : "items"}
                        </span>
                        {/* By value, never a summed quantity — the family's units do not add up. */}
                        <span className="ml-2 inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                            <span
                              className="block h-full bg-cyan-400"
                              style={{ width: `${row.progress * 100}%` }}
                            />
                          </span>
                          <span className="text-[11px] tabular-nums text-gray-500">
                            {(row.progress * 100).toFixed(0)}% by value
                          </span>
                        </span>
                      </button>
                    </td>
                    <td />
                  </tr>
                );
              }

              if (row.kind === "untargeted") {
                return (
                  <tr key={`un-${row.item.id}`} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-xs tabular-nums text-gray-300">{row.item.srNo}</td>
                    <td colSpan={span - 3} className="py-2 pr-3 pl-8 text-[13px] text-gray-400">
                      {row.item.description}
                      <span className="ml-2 text-[11px] tabular-nums">
                        {row.item.qty.toLocaleString("en-IN")} {row.item.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing({ target: null, parentId: null, boqItemId: row.item.id })}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent"
                      >
                        + Target
                      </button>
                    </td>
                    <td />
                  </tr>
                );
              }

              const t = row.target;
              const meta = TARGET_STATUS_META[t.status];
              const delay = delayOf(t);
              const lost = delayDays(t);
              const wd = workingDays(t.startDate, t.dueDate);

              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-gray-100 transition-colors duration-150 hover:bg-gray-50/70">
                    <td className="px-3 py-2 text-xs tabular-nums text-gray-400">
                      {row.depth === 0 ? row.item.srNo : ""}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(t.id)}
                        style={{ paddingLeft: row.depth * 18 }}
                        className="block max-w-[300px] truncate text-left font-medium text-gray-800 hover:text-brand-accent"
                        title={t.name}
                      >
                        {row.depth === 1 && <span className="mr-1 text-gray-300">↳</span>}
                        {t.name}
                      </button>
                      {row.subtaskCount > 0 && (
                        <span className="text-[11px] text-gray-400">{row.subtaskCount} subtasks</span>
                      )}
                    </td>

                    {shows("status") && (
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap ${meta.text}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                    )}
                    {shows("progress") && (
                      <td className="px-3 py-2">
                        <QtyPill done={t.doneQty} total={t.targetQty} unit={t.unit} size="row" />
                      </td>
                    )}
                    {shows("delay") && (
                      <td className={`px-3 py-3 text-[13px] font-medium ${delay.tone}`}>
                        {delay.label}
                        {lost > 0 && <span className="ml-1 text-[11px] text-amber-600">({lost}d)</span>}
                      </td>
                    )}
                    {shows("assignedTo") && (
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {t.assignees.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className="block max-w-[140px] truncate" title={t.assignees.map((a) => a.name).join(", ")}>
                            {t.assignees[0].name ?? `#${t.assignees[0].userId}`}
                            {t.assignees.length > 1 && ` +${t.assignees.length - 1}`}
                          </span>
                        )}
                      </td>
                    )}
                    {shows("duration") && (
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {wd == null ? <span className="text-gray-300">—</span> : <>{wd} <span className="text-[11px] text-gray-400">wd</span></>}
                      </td>
                    )}
                    {shows("schedule") && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-500">
                        {t.startDate || t.dueDate ? (
                          `${shortDate(t.startDate) ?? "—"} – ${shortDate(t.dueDate) ?? "—"}`
                        ) : (
                          <span className="text-gray-300">Not scheduled</span>
                        )}
                      </td>
                    )}
                    {shows("actual") && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-500">
                        {t.actualStart || t.actualEnd ? (
                          `${shortDate(t.actualStart) ?? "—"} – ${shortDate(t.actualEnd) ?? "—"}`
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    {shows("forecastEnd") && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-500">
                        {shortDate(t.forecastEnd) ?? <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    {shows("dependencies") && (
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {t.dependencies.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1"
                            title={t.dependencies.map((d) => d.dependsOnName).join(", ")}
                          >
                            <Link2 size={11} className="text-gray-400" />
                            {t.dependencies.length}
                          </span>
                        )}
                      </td>
                    )}
                    {shows("value") && (
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        {row.depth === 1 ? <span className="text-gray-300">—</span> : inr(row.doneValue)}
                      </td>
                    )}
                    {shows("tag") && (
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {t.tag ? (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">{t.tag}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}

                    <td className="px-2 py-2 text-right">
                      <RowMenu align="right" buttonLabel={`Actions for ${t.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem
                              icon={Pencil}
                              label="Edit"
                              onClick={() => {
                                close();
                                setEditing({ target: t, parentId: t.parentId, boqItemId: t.boqItemId });
                              }}
                            />
                            <RowMenuItem
                              icon={ListPlus}
                              label="Add subtask"
                              disabled={row.depth === 1}
                              disabledHint="A subtask can't have subtasks of its own."
                              onClick={() => {
                                close();
                                setEditing({ target: null, parentId: t.id, boqItemId: t.boqItemId });
                              }}
                            />
                            <RowMenuItem
                              icon={Link2}
                              label="Add dependency"
                              onClick={() => {
                                close();
                                setLinking(t);
                              }}
                            />
                            <RowMenuItem
                              icon={MoveDown}
                              label="Move down"
                              onClick={() => {
                                close();
                                const ids = targets.map((x) => x.id);
                                const at = ids.indexOf(t.id);
                                if (at < 0 || at === ids.length - 1) return;
                                [ids[at], ids[at + 1]] = [ids[at + 1], ids[at]];
                                void act(() => api.reorderTargets(projectId, ids));
                              }}
                            />
                            <RowMenuItem
                              icon={CopyPlus}
                              label="Duplicate"
                              disabled={row.depth === 0}
                              disabledHint="A BOQ line can hold only one target. Duplicate a subtask instead."
                              onClick={() => {
                                close();
                                void act(() => api.duplicateTarget(projectId, t.id));
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Trash2}
                              label="Delete"
                              tone="danger"
                              onClick={() => {
                                close();
                                if (confirm(`Delete "${t.name}"? Its subtasks and progress go with it.`)) {
                                  void act(() => api.deleteTarget(projectId, t.id));
                                }
                              }}
                            />
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                  {void i}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {picker && <ColumnPicker onClose={() => setPicker(false)} />}

      {editing && (
        <TargetEditor
          projectId={projectId}
          boq={boq}
          targets={targets}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      {linking && (
        <DependencyPicker
          target={linking}
          siblings={targets}
          onClose={() => setLinking(null)}
          onPick={async (dependsOn) => {
            setLinking(null);
            await act(() => api.addDependency(projectId, linking.id, { dependsOn }));
          }}
        />
      )}

      {open && openItem && (
        <TargetDrawer
          projectId={projectId}
          target={open}
          item={openItem}
          siblings={targets}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

/** The show/hide list. Mirrors the panel the client already knows from OnSite. */
function ColumnPicker({ onClose }: { onClose: () => void }) {
  const { shows, toggle, reset } = useTargetColumns();
  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="w-[280px] max-w-full p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Show / hide columns</h2>
          <button type="button" onClick={reset} className="text-[11px] text-gray-400 hover:text-brand-accent">
            Reset
          </button>
        </div>
        <ul className="space-y-1">
          {TARGET_COLUMNS.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => toggle(c.key as TargetColumnKey)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <input type="checkbox" readOnly checked={shows(c.key as TargetColumnKey)} className="accent-brand-accent" />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function DependencyPicker({
  target,
  siblings,
  onClose,
  onPick,
}: {
  target: ApiTarget;
  siblings: ApiTarget[];
  onClose: () => void;
  onPick: (dependsOn: number) => void;
}) {
  const already = new Set(target.dependencies.map((d) => d.dependsOn));
  const options = siblings.filter((s) => s.id !== target.id && !already.has(s.id));

  return (
    <Modal onClose={onClose} guardOnClose={false}>
      <div className="w-[420px] max-w-full p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-800">What does this wait on?</h2>
        <p className="mb-3 text-xs text-gray-400">
          &ldquo;{target.name}&rdquo; can&apos;t start until the one you pick is finished.
        </p>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {options.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="w-full truncate rounded-md px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {s.name}
              </button>
            </li>
          ))}
          {options.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-gray-400">Nothing left to depend on.</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

/**
 * Create or edit one target.
 *
 * <p>The BOQ line picker is the important control: a target must name the line it measures, and
 * lines that already have one are not offered. That is the rule the whole module now rests on, so
 * the form makes it impossible to break rather than reporting it afterwards.
 */
function TargetEditor({
  projectId,
  boq,
  targets,
  editing,
  onClose,
  onSaved,
}: {
  projectId: number;
  boq: NonNullable<ReturnType<typeof useProjectTargets>["boq"]>;
  targets: ApiTarget[];
  editing: { target: ApiTarget | null; parentId: number | null; boqItemId: number | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = editing.target;
  const isSubtask = editing.parentId !== null;

  const takenItemIds = new Set(
    targets.filter((x) => x.parentId === null && x.id !== t?.id).map((x) => x.boqItemId),
  );
  const available = boq.items.filter((i) => !takenItemIds.has(i.id));

  const [boqItemId, setBoqItemId] = useState<number | null>(editing.boqItemId ?? available[0]?.id ?? null);
  const [name, setName] = useState(t?.name ?? "");
  const [qty, setQty] = useState(t ? String(t.targetQty) : "");
  const [unit, setUnit] = useState(t?.unit ?? "");
  const [startDate, setStartDate] = useState(t?.startDate ?? "");
  const [dueDate, setDueDate] = useState(t?.dueDate ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const line = boq.items.find((i) => i.id === boqItemId) ?? null;

  return (
    <Modal onClose={onClose}>
      <div className="w-[460px] max-w-full space-y-4 p-5">
        <h2 className="text-base font-semibold text-gray-800">
          {t ? "Edit target" : isSubtask ? "Add subtask" : "New target"}
        </h2>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

        {!isSubtask && (
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">BOQ line</span>
            <Select
              value={boqItemId === null ? "" : String(boqItemId)}
              onChange={(v) => setBoqItemId(v ? Number(v) : null)}
              disabled={Boolean(t)}
              size="sm"
              options={
                available.length === 0
                  ? [{ value: "", label: "Every line already has a target" }]
                  : available.map((i) => ({ value: String(i.id), label: `${i.srNo}. ${i.description}` }))
              }
            />
            {line && (
              <span className="mt-1 block text-[11px] tabular-nums text-gray-400">
                {line.qty.toLocaleString("en-IN")} {line.unit} @ {inr(line.saleRate)}
              </span>
            )}
          </label>
        )}

        <label className="block">
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={line ? line.description : "What is being built"}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Quantity</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder={line ? String(line.qty) : "0"}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm tabular-nums focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={line?.unit ?? "No"}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">End</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-accent focus:outline-none"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={saving || (!isSubtask && !t && boqItemId === null)}
          onClick={async () => {
            setSaving(true);
            setError("");
            const body: api.TargetUpsert = {
              parentId: editing.parentId,
              boqItemId: isSubtask ? null : boqItemId,
              name: name.trim() || null,
              unit: unit.trim() || null,
              targetQty: qty.trim() === "" ? null : Number(qty),
              startDate: startDate || null,
              dueDate: dueDate || null,
              actualStart: t?.actualStart ?? null,
              actualEnd: t?.actualEnd ?? null,
              forecastEnd: t?.forecastEnd ?? null,
              tag: t?.tag ?? null,
            };
            try {
              if (t) await api.updateTarget(projectId, t.id, body);
              else await api.createTarget(projectId, body);
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "That was refused.");
              setSaving(false);
            }
          }}
          className="w-full rounded-lg bg-brand-accent py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {saving ? "Saving…" : t ? "Save changes" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
