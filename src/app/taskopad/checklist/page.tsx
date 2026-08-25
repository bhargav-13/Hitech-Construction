"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Lock, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { TaskopadShell } from "@/components/task/TaskopadShell";
import { PeopleMultiSelect, PeopleSelect, UserAvatar } from "@/components/task/TaskBits";
import { Drawer, DrawerField } from "@/components/Drawer";
import { useAuthStore } from "@/lib/authStore";
import { useUsers } from "@/lib/useUsers";
import { isSuperAdminRole } from "@/lib/taskPermissions";
import { useChecklist, type ChecklistPeriod, type ChecklistRow } from "@/lib/checklistStore";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

type Column = { label: string; key: string; today?: boolean };

/**
 * Recurring Checklist — the daily / weekly / monthly routine board, standing on its own.
 *
 * <p>A deliberate copy of the spreadsheet the office already keeps, not a view over Taskopad's
 * tasks: nothing here creates a task, needs an approval, or shows up in Reports. Pick a month, tick
 * the boxes. A Super Admin decides who can open it from the header.
 */
export default function ChecklistPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const { data, ready, addRow, removeRow, patchRow, toggleTick, setAllowedUsers, reset } = useChecklist();
  const { users } = useUsers();
  const authUser = useAuthStore((s) => s.user);
  const superAdmin = isSuperAdminRole(authUser?.role.name);
  const [accessOpen, setAccessOpen] = useState(false);
  const [editing, setEditing] = useState<{ period: ChecklistPeriod; row: ChecklistRow } | null>(null);

  const monthKey = `${year}-${pad(monthIdx + 1)}`;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const dayKeys: Column[] = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const key = `${monthKey}-${pad(i + 1)}`;
        return { label: String(i + 1), key, today: key === todayKey };
      }),
    [daysInMonth, monthKey, todayKey],
  );
  const weekKeys: Column[] = useMemo(
    () => Array.from({ length: 5 }, (_, i) => ({ label: `W${i + 1}`, key: `${monthKey}-W${i + 1}` })),
    [monthKey],
  );
  const monthKeys: Column[] = useMemo(() => [{ label: MONTHS_SHORT[monthIdx], key: monthKey }], [monthIdx, monthKey]);

  const step = (dir: 1 | -1) => {
    let m = monthIdx + dir, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonthIdx(m); setYear(y);
  };

  // An empty access list means nobody has been restricted yet, so the board is open to everyone.
  // Once a Super Admin picks people, only they (and Super Admins) get in.
  const meId = authUser ? String(authUser.id) : "";
  const allowed = superAdmin || data.allowedUserIds.length === 0 || data.allowedUserIds.includes(meId);

  if (!ready) {
    return (
      <TaskopadShell>
        <div className="py-20 text-center text-sm text-gray-400">Loading…</div>
      </TaskopadShell>
    );
  }

  if (!allowed) {
    return (
      <TaskopadShell>
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <Lock size={22} />
          </div>
          <div className="text-base font-semibold text-gray-700">Not shared with you</div>
          <p className="mt-1 max-w-xs text-sm text-gray-400">
            The recurring checklist is limited to selected people. Ask a Super Admin to add you.
          </p>
        </div>
      </TaskopadShell>
    );
  }

  const people = users.map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return (
    <TaskopadShell>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Recurring Checklist</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              The daily, weekly and monthly routines board. Standalone — nothing here creates a task or needs approval.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {superAdmin && (
              <button
                onClick={() => setAccessOpen((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  accessOpen ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Users size={14} /> Access
                <span className="text-xs text-gray-400">
                  {data.allowedUserIds.length === 0 ? "everyone" : data.allowedUserIds.length}
                </span>
              </button>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button onClick={() => step(-1)} title="Previous month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <span className="min-w-[120px] px-2 text-center text-sm font-semibold text-gray-700">{MONTHS[monthIdx]} {year}</span>
              <button onClick={() => step(1)} title="Next month" className="rounded p-1.5 text-gray-500 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>

        {superAdmin && accessOpen && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Who can open this board</h3>
                <p className="text-xs text-gray-400">
                  Leave empty to let everyone in Taskopad see it. Pick people to limit it to them.
                </p>
              </div>
              <button
                onClick={() => { if (confirm("Reset the checklist rows back to the standard routines? Ticks are cleared.")) reset(); }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
              >
                <RotateCcw size={12} /> Reset rows
              </button>
            </div>
            <PeopleMultiSelect
              people={people}
              values={data.allowedUserIds}
              onChange={setAllowedUsers}
              placeholder="Everyone — pick people to restrict"
            />
          </div>
        )}

        <ChecklistBlock
          title="Daily Checklist"
          tone="bg-amber-400"
          columns={dayKeys}
          rows={data.daily}
          period="daily"
          people={people}
          onAdd={addRow}
          onOpen={(row) => setEditing({ period: "daily", row })}
          onToggle={toggleTick}
        />
        <ChecklistBlock
          title="Weekly Checklist"
          tone="bg-orange-400"
          columns={weekKeys}
          rows={data.weekly}
          period="weekly"
          people={people}
          showNote
          noteLabel="Work Alloted / Done"
          onAdd={addRow}
          onOpen={(row) => setEditing({ period: "weekly", row })}
          onToggle={toggleTick}
        />
        <ChecklistBlock
          title="Monthly Checklist"
          tone="bg-orange-500"
          columns={monthKeys}
          rows={data.monthly}
          period="monthly"
          people={people}
          onAdd={addRow}
          onOpen={(row) => setEditing({ period: "monthly", row })}
          onToggle={toggleTick}
        />
      </div>

      {editing && (
        <RowDrawer
          key={editing.row.id}
          period={editing.period}
          row={data[editing.period].find((r) => r.id === editing.row.id) ?? editing.row}
          people={people}
          onPatch={(patch) => patchRow(editing.period, editing.row.id, patch)}
          onDelete={() => { removeRow(editing.period, editing.row.id); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </TaskopadShell>
  );
}

type Person = { id: string; name: string; role?: string };

/**
 * One block of the board.
 *
 * <p>The layout is the fix for a table that had thirty-one day columns fighting a task name for the
 * same width: the name, owner and note are pinned to the left and the day grid scrolls under them,
 * so a routine is always readable no matter how far into the month you have scrolled.
 */
function ChecklistBlock({
  title,
  tone,
  columns,
  rows,
  period,
  people,
  showNote = false,
  noteLabel = "Note",
  onAdd,
  onOpen,
  onToggle,
}: {
  title: string;
  tone: string;
  columns: Column[];
  rows: ChecklistRow[];
  period: ChecklistPeriod;
  people: Person[];
  showNote?: boolean;
  noteLabel?: string;
  onAdd: (p: ChecklistPeriod) => void;
  onOpen: (row: ChecklistRow) => void;
  onToggle: (p: ChecklistPeriod, id: string, key: string) => void;
}) {
  const done = rows.reduce((n, r) => n + columns.filter((c) => r.ticks[c.key]).length, 0);
  const total = rows.length * columns.length;
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-3 py-1 text-sm font-semibold text-white ${tone}`}>{title}</span>
        <span className="text-xs text-gray-400">{done} of {total} ticked</span>
        <button
          onClick={() => onAdd(period)}
          className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-50/50"
        >
          <Plus size={13} /> Add row
        </button>
      </div>

      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-blue-600 text-left text-xs font-semibold text-white">
              <th className="sticky left-0 z-20 w-12 bg-blue-600 px-2 py-2.5 text-center">Sr</th>
              <th className="sticky left-12 z-20 min-w-[260px] bg-blue-600 px-3 py-2.5">Task Name</th>
              <th className="min-w-[170px] px-3 py-2.5">Assignee</th>
              {showNote && <th className="min-w-[200px] px-3 py-2.5">{noteLabel}</th>}
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`w-10 px-1 py-2.5 text-center font-semibold ${c.today ? "bg-blue-800" : ""}`}
                  title={c.today ? "Today" : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-10 px-1 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (showNote ? 5 : 4)} className="px-4 py-8 text-center text-sm text-gray-400">
                  No rows yet — add one to start tracking.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const assignee = nameOf(r.assigneeId);
                const zebra = i % 2 === 1;
                const rowBg = zebra ? "bg-gray-50/60" : "bg-white";
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r)}
                    title="Open this routine"
                    className={`group cursor-pointer border-b border-gray-100 last:border-b-0 ${rowBg} hover:bg-cyan-50/50`}
                  >
                    <td className={`sticky left-0 z-10 px-2 py-2 text-center text-xs text-gray-500 ${rowBg} group-hover:bg-cyan-50/50`}>
                      {i + 1}
                    </td>
                    <td className={`sticky left-12 z-10 px-3 py-2 ${rowBg} group-hover:bg-cyan-50/50`}>
                      <span className={`font-medium ${r.name ? "text-gray-800" : "text-gray-300 italic"}`}>
                        {r.name || "Untitled routine"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {assignee ? (
                        <span className="flex items-center gap-1.5">
                          <UserAvatar id={r.assigneeId!} name={assignee} size={20} />
                          <span className="truncate text-xs text-gray-700">{assignee}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">Unassigned</span>
                      )}
                    </td>
                    {showNote && (
                      <td className="px-3 py-2 text-xs text-gray-600">{r.note || <span className="text-gray-300">—</span>}</td>
                    )}
                    {columns.map((c) => {
                      const on = !!r.ticks[c.key];
                      return (
                        <td key={c.key} className="px-1 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onToggle(period, r.id, c.key)}
                            title={`${r.name || "Routine"} · ${c.label}${on ? " · ticked" : ""}`}
                            aria-pressed={on}
                            aria-label={`${r.name || "Routine"} ${c.label}`}
                            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border transition-all duration-100 active:scale-90 ${
                              on
                                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                                : "border-gray-300 bg-white hover:border-emerald-500 hover:bg-emerald-50"
                            }`}
                          >
                            {on && <Check size={14} strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-1 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpen(r)}
                        title="Open this routine"
                        className="rounded-md px-1.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-cyan-50 hover:text-brand-accent"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Editing one routine. The grid is for ticking; everything about the routine itself is changed
 * here, which is what makes the rows worth clicking.
 */
function RowDrawer({
  period,
  row,
  people,
  onPatch,
  onDelete,
  onClose,
}: {
  period: ChecklistPeriod;
  row: ChecklistRow;
  people: Person[];
  onPatch: (patch: Partial<Pick<ChecklistRow, "name" | "note" | "assigneeId">>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [note, setNote] = useState(row.note);
  const [assigneeId, setAssigneeId] = useState(row.assigneeId ?? "");
  const ticked = Object.values(row.ticks).filter(Boolean).length;

  function save() {
    onPatch({ name: name.trim(), note: note.trim(), assigneeId: assigneeId || null });
    onClose();
  }

  const periodLabel = period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly";

  return (
    <Drawer title={`${periodLabel} routine`} onClose={onClose} onSave={save} saveLabel="Save" width="max-w-lg">
      <div className="space-y-4">
        <DrawerField label="Task Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Attendance Check - 10 AM"
            autoFocus
          />
        </DrawerField>

        <DrawerField label="Assignee">
          {/* The same people as everywhere else in the app — the board keeps no directory of its own. */}
          <PeopleSelect people={people} value={assigneeId} onChange={setAssigneeId} placeholder="Unassigned" />
          {assigneeId && (
            // PeopleSelect has no empty option (a task must have an assignee); a routine may not,
            // so the way back to unassigned lives here rather than in the shared control.
            <button
              type="button"
              onClick={() => setAssigneeId("")}
              className="mt-1 text-xs font-medium text-gray-400 transition-colors hover:text-rose-600"
            >
              Clear assignee
            </button>
          )}
        </DrawerField>

        <DrawerField label={period === "weekly" ? "Work Alloted / Done" : "Note"}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder={period === "weekly" ? "e.g. Construction Tender Analysis" : "Anything worth remembering about this routine"}
          />
        </DrawerField>

        <p className="text-xs text-gray-400">
          Ticked {ticked} time{ticked === 1 ? "" : "s"} in total. Ticks are kept per period, so changing the name or
          owner here leaves the history alone.
        </p>

        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => { if (confirm(`Delete "${row.name || "this routine"}"? Its ticks go too.`)) onDelete(); }}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <Trash2 size={14} /> Delete routine
          </button>
        </div>
      </div>
    </Drawer>
  );
}
