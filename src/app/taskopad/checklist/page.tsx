"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { PeopleSelect, ProgressBar, UserAvatar } from "@/components/task/TaskBits";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { useUsers } from "@/lib/useUsers";
import {
  CHECKLIST_PERIODS,
  useChecklist,
  type ChecklistPeriod,
  type ChecklistRow,
  type RoutineInput,
} from "@/lib/checklistStore";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** One tickable box: a day, a week, a month, a quarter, a half or a financial year. */
type Box = { key: string; label: string; sub?: string; title: string; current?: boolean; future?: boolean };
type Person = { id: string; name: string; role?: string };

const EVERYONE = "all";

const PERIOD_LABEL: Record<ChecklistPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  halfYearly: "Half-yearly",
  yearly: "Yearly",
};

/** How far the arrows move on each tab, in months. */
const STEP_MONTHS: Record<ChecklistPeriod, number> = { daily: 1, weekly: 1, monthly: 1, quarterly: 12, halfYearly: 12, yearly: 12 };

// The FY runs April to March and is named by the year it starts in: FY2026 = Apr 2026 – Mar 2027.
const fyOf = (y: number, m: number) => (m >= 3 ? y : y - 1);
const quarterOf = (m: number) => Math.floor(((m + 9) % 12) / 3) + 1;
const halfOf = (m: number) => (m >= 3 && m <= 8 ? 1 : 2);
const fyName = (fy: number) => `FY ${fy}-${pad((fy + 1) % 100)}`;
const monthSpan = (y: number, from: number, len: number) => {
  const a = new Date(y, from, 1);
  const b = new Date(y, from + len - 1, 1);
  return a.getFullYear() === b.getFullYear()
    ? `${MONTHS_SHORT[a.getMonth()]} – ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
    : `${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
};

/** "Apr–Jun", "Jan–Mar" — compact enough for a column header. */
const shortSpan = (y: number, from: number, len: number) =>
  `${MONTHS_SHORT[new Date(y, from, 1).getMonth()]}–${MONTHS_SHORT[new Date(y, from + len - 1, 1).getMonth()]}`;

/** The boxes a tab shows for the month in view, plus the label for the period navigator. */
function boxesFor(period: ChecklistPeriod, year: number, monthIdx: number, now: Date): { boxes: Box[]; navLabel: string } {
  const monthKey = `${year}-${pad(monthIdx + 1)}`;
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const monthLabel = `${MONTHS[monthIdx]} ${year}`;
  const fy = fyOf(year, monthIdx);
  const nowFy = fyOf(now.getFullYear(), now.getMonth());

  switch (period) {
    case "daily": {
      const days = new Date(year, monthIdx + 1, 0).getDate();
      const boxes = Array.from({ length: days }, (_, i) => {
        const key = `${monthKey}-${pad(i + 1)}`;
        const dow = new Date(year, monthIdx, i + 1).getDay();
        return {
          key,
          label: String(i + 1),
          sub: "SMTWTFS"[dow],
          title: `${i + 1} ${MONTHS_SHORT[monthIdx]} ${year}`,
          current: key === todayKey,
          future: key > todayKey,
        };
      });
      return { boxes, navLabel: monthLabel };
    }
    case "weekly": {
      const days = new Date(year, monthIdx + 1, 0).getDate();
      const boxes = Array.from({ length: 5 }, (_, i) => {
        const from = i * 7 + 1;
        const to = Math.min(days, from + 6);
        const inWeek =
          now.getFullYear() === year && now.getMonth() === monthIdx && now.getDate() >= from && now.getDate() <= to;
        return {
          key: `${monthKey}-W${i + 1}`,
          label: `W${i + 1}`,
          sub: `${from}–${to}`,
          title: `Week ${i + 1} · ${from}–${to} ${MONTHS_SHORT[monthIdx]}`,
          current: inWeek,
          future: `${monthKey}-${pad(from)}` > todayKey,
        };
      });
      return { boxes, navLabel: monthLabel };
    }
    case "monthly":
      return {
        boxes: [{ key: monthKey, label: monthLabel, title: monthLabel, current: now.getFullYear() === year && now.getMonth() === monthIdx }],
        navLabel: monthLabel,
      };
    // Quarterly and half-yearly show the whole FY, so earlier periods stay visible and tickable.
    case "quarterly": {
      const nowQ = nowFy === fy ? quarterOf(now.getMonth()) : null;
      const boxes = [1, 2, 3, 4].map((q) => {
        const from = (q - 1) * 3 + 3; // months from January of the FY's start year
        const start = `${fy + Math.floor(from / 12)}-${pad((from % 12) + 1)}-01`;
        return {
          key: `FY${fy}-Q${q}`,
          label: `Q${q}`,
          sub: shortSpan(fy, from, 3),
          title: `Q${q} ${fyName(fy)} · ${monthSpan(fy, from, 3)}`,
          current: nowQ === q,
          future: start > todayKey,
        };
      });
      return { boxes, navLabel: fyName(fy) };
    }
    case "halfYearly": {
      const nowH = nowFy === fy ? halfOf(now.getMonth()) : null;
      const boxes = [1, 2].map((h) => {
        const from = h === 1 ? 3 : 9;
        const start = `${fy}-${pad(from + 1)}-01`;
        return {
          key: `FY${fy}-H${h}`,
          label: `H${h}`,
          sub: shortSpan(fy, from, 6),
          title: `H${h} ${fyName(fy)} · ${monthSpan(fy, from, 6)}`,
          current: nowH === h,
          future: start > todayKey,
        };
      });
      return { boxes, navLabel: fyName(fy) };
    }
    case "yearly": {
      const span = monthSpan(fy, 3, 12);
      return {
        boxes: [{ key: `FY${fy}`, label: fyName(fy), sub: span, title: `${fyName(fy)} · ${span}`, current: nowFy === fy }],
        navLabel: fyName(fy),
      };
    }
  }
}

/**
 * Recurring Checklist — the daily → yearly routines board, standing on its own.
 *
 * <p>A copy of the spreadsheet the office already keeps, not a view over Taskopad's tasks: nothing
 * here creates a task, needs an approval, or shows up in Reports.
 *
 * <p>One cadence at a time. Daily, weekly, quarterly and half-yearly are a grid of boxes, like the
 * sheet — the last two across the whole FY, so earlier periods stay visible. Monthly and yearly have
 * a single box per period, so they read as a plain checklist instead of a one-column table.
 *
 * <p>Run by the role ladder: you see your own routines and those of everyone below you. Only someone
 * above a person sets up that person's routines; the person themselves (or anyone above) ticks.
 */
export default function ChecklistPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [tab, setTab] = useState<ChecklistPeriod>("daily");
  const { rows, scope, loading, error, reload, addRow, saveRow, removeRow, toggleTick } = useChecklist();
  const { users } = useUsers();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ period: ChecklistPeriod; row: ChecklistRow | null } | null>(null);

  const people: Person[] = useMemo(() => users.map((u) => ({ id: u.id, name: u.name, role: u.role })), [users]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? `User #${id}`;

  const superAdmin = scope?.superAdmin ?? false;
  const meId = scope?.meId ?? "";
  // Who the viewer can set routines up for: everyone below them (anyone at all for Super Admin).
  const manageable: Person[] = useMemo(() => {
    if (!scope) return [];
    if (scope.superAdmin) return people;
    return people.filter((p) => scope.teamUserIds.includes(p.id));
  }, [scope, people]);
  const hasTeam = superAdmin || (scope?.teamUserIds.length ?? 0) > 0;
  const canAdd = manageable.length > 0;

  // The picker: me first, then the people below me. Someone with nobody below them only ever sees
  // their own board, so they get no picker at all.
  const pickable: Person[] = useMemo(() => {
    if (!scope) return [];
    const me = people.find((p) => p.id === scope.meId);
    const others = manageable.filter((p) => p.id !== scope.meId).sort((a, b) => a.name.localeCompare(b.name));
    return me ? [me, ...others] : others;
  }, [scope, people, manageable]);
  const view = selected ?? (hasTeam ? EVERYONE : meId);

  const visibleRows = view === EVERYONE ? rows : rows.filter((r) => r.assigneeId === view);
  const tabRows = visibleRows.filter((r) => r.period === tab);
  const { boxes, navLabel } = boxesFor(tab, year, monthIdx, now);
  const atCurrent = boxes.some((b) => b.current);

  // A new routine goes to the person in view when the viewer may set theirs up.
  const defaultAssignee = view !== EVERYONE && manageable.some((p) => p.id === view) ? view : "";

  const step = (dir: 1 | -1) => {
    const d = new Date(year, monthIdx + dir * STEP_MONTHS[tab], 1);
    setYear(d.getFullYear());
    setMonthIdx(d.getMonth());
  };
  const goCurrent = () => {
    setYear(now.getFullYear());
    setMonthIdx(now.getMonth());
  };

  // With the whole team in view, routines are grouped by person — me first, then by name.
  const groups = useMemo(() => {
    if (view !== EVERYONE) return [{ assigneeId: null as string | null, rows: tabRows }];
    const byPerson = new Map<string, ChecklistRow[]>();
    for (const r of tabRows) byPerson.set(r.assigneeId, [...(byPerson.get(r.assigneeId) ?? []), r]);
    const name = (id: string) => people.find((p) => p.id === id)?.name ?? "";
    return [...byPerson.entries()]
      .sort(([a], [b]) => (a === meId ? -1 : b === meId ? 1 : name(a).localeCompare(name(b))))
      .map(([assigneeId, list]) => ({ assigneeId: assigneeId as string | null, rows: list }));
  }, [view, tabRows, people, meId]);

  const ticked = tabRows.reduce((n, r) => n + boxes.filter((b) => r.ticks[b.key]).length, 0);
  const totalBoxes = tabRows.length * boxes.length;

  if (loading && !scope) {
    return (
      <TaskopadShell>
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading checklist…
        </div>
      </TaskopadShell>
    );
  }

  if (error && !scope) {
    return (
      <TaskopadShell>
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <div className="text-base font-semibold text-gray-700">Couldn&apos;t load the checklist</div>
          <p className="mt-1 max-w-sm text-sm text-gray-400">{error}</p>
          <button onClick={() => reload()} className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Try again
          </button>
        </div>
      </TaskopadShell>
    );
  }

  const grid = tab !== "monthly" && tab !== "yearly";

  return (
    <TaskopadShell>
      <div className="animate-fade-in space-y-4">
        {/* Title + who is in view */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Recurring Checklist</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {canAdd
                ? "Set up routines for your team and track them period by period."
                : "Your routines, set up by your manager. Tick each one off as you do it."}
            </p>
          </div>
          {hasTeam && (
            <Select
              value={view}
              onChange={setSelected}
              className="w-full sm:w-[240px]"
              options={[
                { value: EVERYONE, label: superAdmin ? "Everyone" : "Me + my team" },
                ...pickable.map((p) => ({ value: p.id, label: p.id === meId ? `${p.name} (me)` : p.name })),
              ]}
            />
          )}
        </div>

        {/* Cadence tabs */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="inline-flex min-w-max items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
            {CHECKLIST_PERIODS.map((p) => {
              const count = visibleRows.filter((r) => r.period === p).length;
              const active = tab === p;
              return (
                <button
                  key={p}
                  onClick={() => setTab(p)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    active ? "bg-brand-accent text-white shadow-sm" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  {PERIOD_LABEL[p]}
                  <span
                    className={`min-w-[18px] rounded-full px-1.5 text-[10px] font-semibold ${
                      active ? "bg-white/25 text-white" : count ? "bg-gray-100 text-gray-600" : "bg-gray-50 text-gray-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Period navigator + progress + add */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} title="Previous" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[150px] text-center text-sm font-semibold text-gray-800">{navLabel}</span>
            <button onClick={() => step(1)} title="Next" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <ChevronRight size={16} />
            </button>
            {!atCurrent && (
              <button
                onClick={goCurrent}
                className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 hover:border-brand-accent hover:text-brand-accent"
              >
                Current
              </button>
            )}
          </div>

          {tabRows.length > 0 && (
            <div className="flex min-w-[180px] flex-1 items-center gap-2 sm:max-w-xs">
              <ProgressBar value={totalBoxes ? (ticked / totalBoxes) * 100 : 0} />
              <span className="shrink-0 text-xs text-gray-500">
                {grid ? `${ticked} / ${totalBoxes} ticked` : `${ticked} of ${tabRows.length} done`}
              </span>
            </div>
          )}

          {canAdd && (
            <button
              onClick={() => setEditing({ period: tab, row: null })}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
            >
              <Plus size={14} /> Add {PERIOD_LABEL[tab].toLowerCase()} routine
            </button>
          )}
        </div>

        {tabRows.length === 0 ? (
          <EmptyState period={tab} canAdd={canAdd} onAdd={() => setEditing({ period: tab, row: null })} />
        ) : grid ? (
          <GridTable
            boxes={boxes}
            groups={groups}
            showNote={tab !== "daily"}
            nameOf={nameOf}
            meId={meId}
            onOpen={(row) => setEditing({ period: tab, row })}
            onToggle={toggleTick}
          />
        ) : (
          <PeriodList
            box={boxes[0]}
            groups={groups}
            nameOf={nameOf}
            meId={meId}
            onOpen={(row) => setEditing({ period: tab, row })}
            onToggle={toggleTick}
          />
        )}
      </div>

      {editing && (
        <RowDrawer
          key={editing.row?.id ?? `new-${editing.period}`}
          period={editing.period}
          row={editing.row ? rows.find((r) => r.id === editing.row!.id) ?? editing.row : null}
          assignable={manageable}
          defaultAssignee={defaultAssignee}
          nameOf={nameOf}
          onSave={async (input) => {
            if (editing.row) await saveRow(editing.row.id, input);
            else await addRow(input);
          }}
          onDelete={async () => {
            if (editing.row) await removeRow(editing.row.id);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </TaskopadShell>
  );
}

type Group = { assigneeId: string | null; rows: ChecklistRow[] };

function EmptyState({ period, canAdd, onAdd }: { period: ChecklistPeriod; canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <ClipboardList size={22} />
      </div>
      <div className="text-sm font-semibold text-gray-700">No {PERIOD_LABEL[period].toLowerCase()} routines</div>
      <p className="mt-1 max-w-xs text-sm text-gray-400">
        {canAdd ? "Add one for a member of your team to start tracking it." : "Your manager hasn't set any up for you yet."}
      </p>
      {canAdd && (
        <button
          onClick={onAdd}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Add routine
        </button>
      )}
    </div>
  );
}

function PersonHeader({ id, name, count, me }: { id: string; name: string; count: number; me: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <UserAvatar id={id} name={name} size={20} />
      <span className="text-xs font-semibold text-gray-700">{name}{me && " (me)"}</span>
      <span className="text-[11px] text-gray-400">{count} routine{count === 1 ? "" : "s"}</span>
    </span>
  );
}

function TickBox({ on, disabled, title, size = "sm", onClick }: { on: boolean; disabled: boolean; title: string; size?: "sm" | "lg"; onClick: () => void }) {
  const dim = size === "lg" ? "h-7 w-7" : "h-6 w-6";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      aria-label={title}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-md border transition-all duration-100 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 ${
        on
          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          : "border-gray-300 bg-white hover:border-emerald-500 hover:bg-emerald-50"
      }`}
    >
      {on && <Check size={size === "lg" ? 16 : 14} strokeWidth={3} />}
    </button>
  );
}

/**
 * Daily and weekly: the sheet's grid. The routine column is pinned and carries the assignee inside
 * it, so nothing slides underneath it when the days scroll sideways.
 */
function GridTable({
  boxes,
  groups,
  showNote,
  nameOf,
  meId,
  onOpen,
  onToggle,
}: {
  boxes: Box[];
  groups: Group[];
  showNote: boolean;
  nameOf: (id: string) => string;
  meId: string;
  onOpen: (row: ChecklistRow) => void;
  onToggle: (row: ChecklistRow, key: string) => void;
}) {
  const colSpan = boxes.length + 2;
  const cellW = boxes.length <= 5 ? "min-w-[76px]" : "min-w-[36px]";

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <th className="sticky left-0 z-20 w-[300px] min-w-[300px] border-r border-gray-100 bg-gray-50 px-4 py-2 text-left text-xs font-medium">
              Routine
            </th>
            {boxes.map((b) => (
              <th
                key={b.key}
                title={b.title}
                className={`${cellW} px-0.5 py-1.5 text-center font-medium ${b.current ? "bg-cyan-50 text-brand-accent" : ""}`}
              >
                <div className="text-xs leading-tight">{b.label}</div>
                {b.sub && <div className={`text-[10px] font-normal leading-tight ${b.current ? "text-brand-accent" : "text-gray-400"}`}>{b.sub}</div>}
              </th>
            ))}
            <th className="w-full" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.assigneeId ?? "one"}>
              {g.assigneeId && (
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <td className="sticky left-0 z-10 bg-gray-50 px-4 py-1.5" colSpan={1}>
                    <PersonHeader id={g.assigneeId} name={nameOf(g.assigneeId)} count={g.rows.length} me={g.assigneeId === meId} />
                  </td>
                  <td colSpan={colSpan - 1} className="bg-gray-50/70" />
                </tr>
              )}
              {g.rows.map((r) => (
                <tr key={r.id} className="group border-b border-gray-50 last:border-b-0 hover:bg-cyan-50/30">
                  <td
                    onClick={() => onOpen(r)}
                    title={r.canManage ? "Edit this routine" : "View this routine"}
                    className="sticky left-0 z-10 w-[300px] min-w-[300px] max-w-[300px] cursor-pointer border-r border-gray-100 bg-white px-4 py-2 group-hover:bg-cyan-50"
                  >
                    <div className="truncate font-medium text-gray-800">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                      {!g.assigneeId && (
                        <>
                          <UserAvatar id={r.assigneeId} name={nameOf(r.assigneeId)} size={16} />
                          <span className="truncate">{nameOf(r.assigneeId)}</span>
                        </>
                      )}
                      {showNote && r.note && (
                        <span className="truncate" title={r.note}>
                          {!g.assigneeId && "· "}
                          {r.note}
                        </span>
                      )}
                      {!r.canManage && <Lock size={10} className="shrink-0" />}
                    </div>
                  </td>
                  {boxes.map((b) => (
                    <td key={b.key} className={`px-0.5 py-2 text-center ${b.current ? "bg-cyan-50/60" : ""} ${b.future ? "opacity-40" : ""}`}>
                      <div className="flex justify-center">
                        <TickBox
                          on={!!r.ticks[b.key]}
                          disabled={!r.canTick}
                          title={`${r.name} · ${b.title}`}
                          onClick={() => onToggle(r, b.key)}
                        />
                      </div>
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </GroupRows>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Monthly and longer: one box per period, so a checklist rather than a one-column table. */
function PeriodList({
  box,
  groups,
  nameOf,
  meId,
  onOpen,
  onToggle,
}: {
  box: Box;
  groups: Group[];
  nameOf: (id: string) => string;
  meId: string;
  onOpen: (row: ChecklistRow) => void;
  onToggle: (row: ChecklistRow, key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {groups.map((g) => (
        <div key={g.assigneeId ?? "one"}>
          {g.assigneeId && (
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-1.5">
              <PersonHeader id={g.assigneeId} name={nameOf(g.assigneeId)} count={g.rows.length} me={g.assigneeId === meId} />
            </div>
          )}
          <ul className="divide-y divide-gray-50">
            {g.rows.map((r) => {
              const on = !!r.ticks[box.key];
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-cyan-50/30">
                  <TickBox on={on} disabled={!r.canTick} size="lg" title={`${r.name} · ${box.title}`} onClick={() => onToggle(r, box.key)} />
                  <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left" title={r.canManage ? "Edit this routine" : "View this routine"}>
                    <div className={`truncate font-medium ${on ? "text-gray-400 line-through" : "text-gray-800"}`}>{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                      {!g.assigneeId && (
                        <>
                          <UserAvatar id={r.assigneeId} name={nameOf(r.assigneeId)} size={16} />
                          <span className="truncate">{nameOf(r.assigneeId)}</span>
                        </>
                      )}
                      {r.note && (
                        <span className="truncate">
                          {!g.assigneeId && "· "}
                          {r.note}
                        </span>
                      )}
                      {!r.canManage && <Lock size={10} className="shrink-0" />}
                    </div>
                  </button>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                      on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {on ? "Done" : "Pending"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Adding, editing or just viewing one routine. Only someone above the assignee gets the editable
 * form — the assignee sees it read-only, since setting up their routines is their manager's call.
 */
function RowDrawer({
  period,
  row,
  assignable,
  defaultAssignee,
  nameOf,
  onSave,
  onDelete,
  onClose,
}: {
  period: ChecklistPeriod;
  row: ChecklistRow | null;
  assignable: Person[];
  defaultAssignee: string;
  nameOf: (id: string) => string;
  onSave: (input: RoutineInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [assigneeId, setAssigneeId] = useState(row?.assigneeId ?? defaultAssignee);
  const [busy, setBusy] = useState(false);
  const editable = row === null || row.canManage;
  const ticked = row ? Object.values(row.ticks).filter(Boolean).length : 0;
  const noteLabel = period === "weekly" ? "Work Alloted / Done" : "Note";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (busy) return;
    if (!name.trim()) return alert("Give the routine a name.");
    if (!assigneeId) return alert("Pick who this routine is for.");
    void run(() => onSave({ period, name, note, assigneeId }));
  }

  const title = row ? `${PERIOD_LABEL[period]} routine` : `New ${PERIOD_LABEL[period].toLowerCase()} routine`;

  return (
    <Drawer
      title={title}
      onClose={onClose}
      onSave={editable ? save : undefined}
      saveLabel={busy ? "Saving…" : row ? "Save" : "Add routine"}
      width="max-w-lg"
    >
      <div className="space-y-4">
        {!editable && (
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <Lock size={13} className="mt-0.5 shrink-0" />
            Only someone above {nameOf(row!.assigneeId)} can change this routine. You can still tick it on the board.
          </div>
        )}

        <DrawerField label="Routine" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Attendance Check - 10 AM"
            disabled={!editable}
            autoFocus={editable}
          />
        </DrawerField>

        <DrawerField group label="Assignee" required hint={editable ? "Only people below you in the role hierarchy are listed." : undefined}>
          {editable ? (
            <PeopleSelect people={assignable} value={assigneeId} onChange={setAssigneeId} placeholder="Pick a team member" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <UserAvatar id={row!.assigneeId} name={nameOf(row!.assigneeId)} size={22} />
              {nameOf(row!.assigneeId)}
            </div>
          )}
        </DrawerField>

        <DrawerField label={noteLabel}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="input resize-none"
            disabled={!editable}
            placeholder={period === "weekly" ? "e.g. Construction Tender Analysis" : "Anything worth remembering about this routine"}
          />
        </DrawerField>

        {row && (
          <p className="text-xs text-gray-400">
            Ticked {ticked} time{ticked === 1 ? "" : "s"} in total. Ticks are kept per period, so changing the name or
            assignee here leaves the history alone.
          </p>
        )}

        {row && editable && (
          <div className="border-t border-gray-100 pt-4">
            <button
              disabled={busy}
              onClick={() => { if (confirm(`Delete "${row.name}"? Its ticks go too.`)) void run(onDelete); }}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete routine
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
