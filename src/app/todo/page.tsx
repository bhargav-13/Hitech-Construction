"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Drawer, DrawerField } from "@/components/Drawer";
import { DatePicker } from "@/components/DatePicker";
import { formatDateIST, formatDateTimeIST, formatTimeIST, msIST, todayIST, wallClockIST } from "@/lib/datetime";
import {
  createTodo,
  deleteTodo,
  listTodos,
  reorderTodos,
  toInput,
  updateTodo,
  type TodoDto,
  type TodoInput,
  type TodoPriority,
  type TodoStatus,
} from "@/lib/todoApi";

/*
 * My To-Do — a private list for every signed-in person, opened from the button beside Punch.
 * Taskopad is the team's task system (assigned, followed, approved); this is the scratch pad nobody
 * else reads. Three ways to look at the same items: a board to move them along, a month calendar by
 * due date, and the reminders, which the server posts to the bell (and the desktop) when they fall due.
 */

type View = "board" | "calendar" | "reminders";

const COLUMNS: { status: TodoStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To Do", accent: "bg-gray-400" },
  { status: "DOING", label: "In Progress", accent: "bg-sky-500" },
  { status: "DONE", label: "Done", accent: "bg-emerald-500" },
];

const PRIORITIES: { value: TodoPriority; label: string; chip: string; dot: string }[] = [
  { value: "HIGH", label: "High", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  { value: "MEDIUM", label: "Medium", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  { value: "LOW", label: "Low", chip: "bg-gray-100 text-gray-600", dot: "bg-gray-300" },
];
const priorityMeta = (p: TodoPriority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Calendar arithmetic on `yyyy-MM-dd` keys, done in UTC so the browser's own zone never shifts a day.
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayMon0(key: string): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** The calendar day an item sits on: its due date, else the day its reminder rings. */
const dayOf = (t: TodoDto) => t.dueDate ?? t.remindAt?.slice(0, 10) ?? null;

export default function TodoPage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <TodoScreen />
    </Suspense>
  );
}

function TodoScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<TodoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  // null = closed; { todo: null } = new, optionally with a preset due date.
  const [editing, setEditing] = useState<{ todo: TodoDto | null; dueDate?: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await listTodos());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your to-do list");
    } finally {
      setLoading(false);
    }
  }, []);

  // First load. State is only set once the request settles, never synchronously in the effect.
  useEffect(() => {
    let live = true;
    listTodos()
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        setError(null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load your to-do list"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  // A reminder in the bell links here as ?open=<id>. Derived rather than copied into state, so it
  // opens the moment the list arrives; closing it (or opening anything else) dismisses the link.
  const openId = Number(params.get("open")) || null;
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const deepLinked = !deepLinkDismissed && openId != null ? (items.find((t) => t.id === openId) ?? null) : null;
  const drawer = editing ?? (deepLinked ? { todo: deepLinked } : null);
  const closeDrawer = () => {
    setEditing(null);
    if (openId != null) {
      setDeepLinkDismissed(true);
      router.replace("/todo");
    }
  };

  async function save(id: number | null, input: TodoInput) {
    const saved = id == null ? await createTodo(input) : await updateTodo(id, input);
    setItems((cur) => (id == null ? [...cur, saved] : cur.map((t) => (t.id === id ? saved : t))));
  }

  async function remove(id: number) {
    await deleteTodo(id);
    setItems((cur) => cur.filter((t) => t.id !== id));
  }

  /** Quick changes from the board or reminder list: shown at once, rolled back if the server says no. */
  async function patch(t: TodoDto, change: Partial<TodoInput>) {
    const before = items;
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, ...change } as TodoDto : x)));
    try {
      const saved = await updateTodo(t.id, toInput(t, change));
      setItems((cur) => cur.map((x) => (x.id === t.id ? saved : x)));
    } catch (e) {
      setItems(before);
      alert(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function move(status: TodoStatus, ids: number[]) {
    const before = items;
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    setItems((cur) =>
      cur.map((t) => (order.has(t.id) ? { ...t, status, sortOrder: order.get(t.id)! } : t))
    );
    try {
      setItems(await reorderTodos(status, ids));
    } catch (e) {
      setItems(before);
      alert(e instanceof Error ? e.message : "Could not move that card");
    }
  }

  const today = todayIST();
  const open = items.filter((t) => t.status !== "DONE");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const dueToday = open.filter((t) => t.dueDate === today).length;
  const upcomingReminders = open.filter((t) => t.remindAt && !t.reminded).length;

  return (
    <AppShell title="My To-Do">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800">My To-Do</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
              <Lock size={13} className="shrink-0" /> Private to you — nobody else can see this list.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
              {(
                [
                  { v: "board", label: "Board", icon: Columns3 },
                  { v: "calendar", label: "Calendar", icon: CalendarDays },
                  { v: "reminders", label: "Reminders", icon: Bell },
                ] as const
              ).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon size={14} /> {label}
                  {v === "reminders" && upcomingReminders > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-semibold ${view === v ? "bg-white/25" : "bg-orange-100 text-orange-700"}`}>
                      {upcomingReminders}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setEditing({ todo: null })}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} /> New to-do
            </button>
          </div>
        </div>

        {(overdue > 0 || dueToday > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {overdue > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">{overdue} overdue</span>
            )}
            {dueToday > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{dueToday} due today</span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
            <p className="text-sm text-gray-600">{error}</p>
            <button onClick={() => void reload()} className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Try again
            </button>
          </div>
        ) : view === "board" ? (
          <Board
            items={items}
            today={today}
            onOpen={(t) => setEditing({ todo: t })}
            onQuickAdd={(title) => save(null, { title, status: "TODO", priority: "MEDIUM" })}
            onToggleDone={(t) => void patch(t, { status: t.status === "DONE" ? "TODO" : "DONE" })}
            onMove={(status, ids) => void move(status, ids)}
          />
        ) : view === "calendar" ? (
          <MonthCalendar
            items={items}
            today={today}
            onOpen={(t) => setEditing({ todo: t })}
            onNew={(dueDate) => setEditing({ todo: null, dueDate })}
          />
        ) : (
          <Reminders
            items={items}
            onOpen={(t) => setEditing({ todo: t })}
            onSnooze={(t, remindAt) => void patch(t, { remindAt })}
            onDone={(t) => void patch(t, { status: "DONE" })}
            onClear={(t) => void patch(t, { remindAt: null })}
          />
        )}
      </div>

      {drawer && (
        <TodoDrawer
          key={drawer.todo?.id ?? `new-${drawer.dueDate ?? ""}`}
          todo={drawer.todo}
          presetDue={drawer.dueDate}
          onClose={closeDrawer}
          onSave={(input) => save(drawer.todo?.id ?? null, input)}
          onDelete={drawer.todo ? () => remove(drawer.todo!.id) : undefined}
        />
      )}
    </AppShell>
  );
}

/* ───────────────────────────── Board ───────────────────────────── */

function Board({
  items,
  today,
  onOpen,
  onQuickAdd,
  onToggleDone,
  onMove,
}: {
  items: TodoDto[];
  today: string;
  onOpen: (t: TodoDto) => void;
  onQuickAdd: (title: string) => Promise<void>;
  onToggleDone: (t: TodoDto) => void;
  onMove: (status: TodoStatus, ids: number[]) => void;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  // Where a dragged card would land: a column, and the card it would sit above (null = the bottom).
  const [over, setOver] = useState<{ status: TodoStatus; beforeId: number | null } | null>(null);

  const byColumn = useMemo(() => {
    const map: Record<TodoStatus, TodoDto[]> = { TODO: [], DOING: [], DONE: [] };
    for (const t of items) map[t.status]?.push(t);
    for (const k of Object.keys(map) as TodoStatus[]) {
      map[k].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    // Done reads newest first, so the column doesn't fill up with last month's work on top.
    map.DONE.sort((a, b) => msIST(b.completedAt) - msIST(a.completedAt) || a.sortOrder - b.sortOrder);
    return map;
  }, [items]);

  function drop(status: TodoStatus) {
    if (dragId == null) return;
    const ids = byColumn[status].map((t) => t.id).filter((id) => id !== dragId);
    const at = over?.beforeId != null ? ids.indexOf(over.beforeId) : -1;
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    onMove(status, ids);
    setDragId(null);
    setOver(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const cards = byColumn[col.status];
        const isOver = dragId != null && over?.status === col.status;
        return (
          <section
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              if (over?.status !== col.status) setOver({ status: col.status, beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(col.status);
            }}
            className={`flex min-h-[320px] flex-col rounded-xl border bg-gray-50/70 transition-colors ${
              isOver ? "border-brand-accent/60 bg-cyan-50/40" : "border-gray-200"
            }`}
          >
            <header className="flex items-center gap-2 px-3 pt-3 pb-2">
              <span className={`h-2 w-2 rounded-full ${col.accent}`} />
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-gray-200">
                {cards.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
              {col.status === "TODO" && <QuickAdd onAdd={onQuickAdd} />}
              {cards.map((t) => (
                <div
                  key={t.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (over?.beforeId !== t.id) setOver({ status: col.status, beforeId: t.id });
                  }}
                >
                  {isOver && over?.beforeId === t.id && dragId !== t.id && <DropLine />}
                  <TodoCard
                    todo={t}
                    today={today}
                    dragging={dragId === t.id}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    onOpen={() => onOpen(t)}
                    onToggleDone={() => onToggleDone(t)}
                  />
                </div>
              ))}
              {isOver && over?.beforeId == null && <DropLine />}
              {cards.length === 0 && !isOver && (
                <p className="px-1 py-6 text-center text-xs text-gray-400">
                  {col.status === "DONE" ? "Finished items land here." : "Nothing here — drag a card in."}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DropLine() {
  return <div className="mb-2 h-0.5 rounded-full bg-brand-accent" />;
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onAdd(value);
      setTitle("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-2.5 py-1.5 focus-within:border-brand-accent">
      <Plus size={14} className="shrink-0 text-gray-400" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="Add a to-do and press Enter"
        className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
        disabled={busy}
      />
      {busy && <Loader2 size={14} className="animate-spin text-gray-400" />}
    </div>
  );
}

function TodoCard({
  todo: t,
  today,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onToggleDone,
}: {
  todo: TodoDto;
  today: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const done = t.status === "DONE";
  const p = priorityMeta(t.priority);
  const dueTone = done
    ? "bg-gray-100 text-gray-500"
    : t.dueDate && t.dueDate < today
      ? "bg-rose-50 text-rose-700"
      : t.dueDate === today
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-600";
  const dueLabel = t.dueDate === today ? "Today" : t.dueDate === addDays(today, 1) ? "Tomorrow" : t.dueDate ? formatDateIST(t.dueDate) : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(t.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group flex cursor-pointer gap-2 rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-all hover:border-gray-300 hover:shadow ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        title={done ? "Mark as not done" : "Mark as done"}
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug break-words ${done ? "text-gray-400 line-through" : "text-gray-800"}`}>{t.title}</div>
        {t.note && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.note}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${p.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label}
          </span>
          {dueLabel && (
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${dueTone}`}>
              <CalendarDays size={11} /> {dueLabel}
            </span>
          )}
          {t.remindAt && !done && (
            <span
              title={t.reminded ? "Reminder sent" : "Reminder set"}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${
                t.reminded ? "bg-gray-100 text-gray-500" : "bg-orange-50 text-orange-700"
              }`}
            >
              {t.reminded ? <Bell size={11} /> : <BellRing size={11} />} {reminderShort(t.remindAt, today)}
            </span>
          )}
        </div>
      </div>
      <GripVertical size={14} className="mt-0.5 hidden shrink-0 text-gray-300 group-hover:block" />
    </div>
  );
}

/** "3:30 PM" today, "Tomorrow 9:00 AM", otherwise "28 Oct 2026, 9:00 AM". */
function reminderShort(remindAt: string, today: string): string {
  const day = remindAt.slice(0, 10);
  if (day === today) return formatTimeIST(remindAt);
  if (day === addDays(today, 1)) return `Tomorrow ${formatTimeIST(remindAt)}`;
  return formatDateTimeIST(remindAt);
}

/* ───────────────────────────── Calendar ───────────────────────────── */

function MonthCalendar({
  items,
  today,
  onOpen,
  onNew,
}: {
  items: TodoDto[];
  today: string;
  onOpen: (t: TodoDto) => void;
  onNew: (dueDate: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const gridStart = addDays(first, -weekdayMon0(first));
  // Six weeks always covers a month, and keeps the grid from jumping height between months.
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const [y, m] = month.split("-").map(Number);

  const byDay = useMemo(() => {
    const map = new Map<string, TodoDto[]>();
    for (const t of items) {
      const d = dayOf(t);
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
    }
    return map;
  }, [items]);

  const undated = items.filter((t) => !dayOf(t) && t.status !== "DONE").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(addMonths(month, -1))} title="Previous month" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-gray-800">
            {MONTHS[m - 1]} {y}
          </span>
          <button onClick={() => setMonth(addMonths(month, 1))} title="Next month" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
            <ChevronRight size={16} />
          </button>
        </div>
        {month !== today.slice(0, 7) && (
          <button onClick={() => setMonth(today.slice(0, 7))} className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Today
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          Click a day to add a to-do due then.{undated > 0 && ` ${undated} open item${undated === 1 ? " has" : "s have"} no date and only show on the board.`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="grid min-w-[640px] grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-b border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">
              {d}
            </div>
          ))}
          {days.map((day, i) => {
            const inMonth = day.startsWith(month);
            const list = byDay.get(day) ?? [];
            const isToday = day === today;
            return (
              <div
                key={day}
                onClick={() => onNew(day)}
                className={`group min-h-[104px] cursor-pointer border-gray-100 p-1.5 transition-colors hover:bg-cyan-50/40 ${
                  i % 7 !== 6 ? "border-r" : ""
                } ${i < 35 ? "border-b" : ""} ${inMonth ? "" : "bg-gray-50/60"}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
                      isToday ? "bg-brand-accent font-semibold text-white" : inMonth ? "font-medium text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <Plus size={12} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="space-y-1">
                  {list.slice(0, 3).map((t) => {
                    const done = t.status === "DONE";
                    const late = !done && day < today;
                    return (
                      <button
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(t);
                        }}
                        title={t.title}
                        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
                          done
                            ? "bg-gray-100 text-gray-400 line-through"
                            : late
                              ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                              : "bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityMeta(t.priority).dot}`} />
                        {t.remindAt && t.remindAt.startsWith(day) && !done && <BellRing size={10} className="shrink-0" />}
                        <span className="truncate">{t.title}</span>
                      </button>
                    );
                  })}
                  {list.length > 3 && (
                    <div className="px-1.5 text-[11px] font-medium text-gray-500">+{list.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Reminders ───────────────────────────── */

function Reminders({
  items,
  onOpen,
  onSnooze,
  onDone,
  onClear,
}: {
  items: TodoDto[];
  onOpen: (t: TodoDto) => void;
  onSnooze: (t: TodoDto, remindAt: string) => void;
  onDone: (t: TodoDto) => void;
  onClear: (t: TodoDto) => void;
}) {
  const withReminder = items
    .filter((t) => t.remindAt && t.status !== "DONE")
    .sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
  const upcoming = withReminder.filter((t) => !t.reminded);
  const rang = withReminder.filter((t) => t.reminded).reverse();
  const [now] = useState(() => Date.now());

  if (withReminder.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
          <AlarmClock size={22} />
        </div>
        <div className="text-sm font-semibold text-gray-700">No reminders set</div>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Open any to-do and set &ldquo;Remind me&rdquo;. At that time it arrives in the bell at the top, and as a desktop
          notification if you have those switched on — even when this page is closed.
        </p>
      </div>
    );
  }

  const row = (t: TodoDto) => {
    const late = !t.reminded && msIST(t.remindAt) < now;
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            t.reminded ? "bg-gray-100 text-gray-500" : "bg-orange-50 text-orange-600"
          }`}
        >
          {t.reminded ? <Bell size={16} /> : <BellRing size={16} />}
        </div>
        <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium text-gray-800">{t.title}</div>
          <div className={`text-xs ${late ? "text-rose-600" : "text-gray-500"}`}>
            {formatDateTimeIST(t.remindAt)}
            {t.reminded ? " · sent to your bell" : late ? " · sending now" : ""}
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSnooze(t, wallClockIST(Date.now() + 60 * 60 * 1000))}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Snooze 1h
          </button>
          <button
            onClick={() => onDone(t)}
            className="flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <Check size={12} /> Done
          </button>
          <button onClick={() => onClear(t)} title="Remove reminder" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Reminders arrive in the bell at the top (and as a desktop notification if switched on), even when this page is closed.
      </p>
      {upcoming.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">Upcoming</h3>
          <ul className="divide-y divide-gray-100">{upcoming.map(row)}</ul>
        </section>
      )}
      {rang.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Already reminded — still open
          </h3>
          <ul className="divide-y divide-gray-100">{rang.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────────── Drawer ───────────────────────────── */

function TodoDrawer({
  todo,
  presetDue,
  onClose,
  onSave,
  onDelete,
}: {
  todo: TodoDto | null;
  presetDue?: string;
  onClose: () => void;
  onSave: (input: TodoInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(todo?.title ?? "");
  const [note, setNote] = useState(todo?.note ?? "");
  const [status, setStatus] = useState<TodoStatus>(todo?.status ?? "TODO");
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? presetDue ?? "");
  const [remindDate, setRemindDate] = useState(todo?.remindAt?.slice(0, 10) ?? "");
  const [remindTime, setRemindTime] = useState(todo?.remindAt?.slice(11, 16) ?? "");
  const [busy, setBusy] = useState(false);
  // One clock reading per open drawer: the presets and the "already passed" warning use it.
  const [now] = useState(() => Date.now());

  const today = todayIST();
  const remindAt = remindDate ? `${remindDate}T${remindTime || "09:00"}` : null;
  const remindInPast = remindAt != null && remindAt !== todo?.remindAt && msIST(remindAt) < now;

  function setReminder(value: string | null) {
    setRemindDate(value ? value.slice(0, 10) : "");
    setRemindTime(value ? value.slice(11, 16) : "");
  }

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
    if (!title.trim()) return alert("Give the to-do a title.");
    void run(() => onSave({ title: title.trim(), note: note.trim() || null, status, priority, dueDate: dueDate || null, remindAt }));
  }

  const presets: { label: string; value: string }[] = [
    { label: "In 1 hour", value: wallClockIST(now + 60 * 60 * 1000) },
    { label: "This evening", value: `${today}T18:00` },
    { label: "Tomorrow 9 AM", value: `${addDays(today, 1)}T09:00` },
    ...(dueDate ? [{ label: "Due day 9 AM", value: `${dueDate}T09:00` }] : []),
  ].filter((p) => msIST(p.value) > now);

  return (
    <Drawer
      title={todo ? "Edit to-do" : "New to-do"}
      onClose={onClose}
      onSave={save}
      saveLabel={busy ? "Saving…" : todo ? "Save" : "Add to-do"}
      width="max-w-lg"
    >
      <div className="space-y-4">
        <DrawerField label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="input"
            placeholder="e.g. Call the cement supplier"
            autoFocus
            maxLength={300}
          />
        </DrawerField>

        <DrawerField label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input resize-none" placeholder="Anything worth remembering" />
        </DrawerField>

        <DrawerField group label="Status">
          <Segmented
            value={status}
            onChange={setStatus}
            options={COLUMNS.map((c) => ({ value: c.status, label: c.label }))}
          />
        </DrawerField>

        <DrawerField group label="Priority">
          <Segmented value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
        </DrawerField>

        <DrawerField group label="Due date">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
            </div>
            {dueDate && (
              <button onClick={() => setDueDate("")} title="Clear due date" className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
        </DrawerField>

        <DrawerField group label="Remind me" hint="It arrives in the bell (and as a desktop notification) at this time, even if the app is closed.">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <DatePicker value={remindDate} onChange={setRemindDate} placeholder="No reminder" />
              </div>
              <input
                type="time"
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                disabled={!remindDate}
                className="input w-[120px] disabled:opacity-50"
              />
              {remindDate && (
                <button onClick={() => setReminder(null)} title="Remove reminder" className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setReminder(p.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    remindAt === p.value ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {remindInPast && <p className="text-xs text-amber-600">That time has already passed — it will ring straight away.</p>}
            {todo?.reminded && remindAt === todo.remindAt && (
              <p className="text-xs text-gray-500">Already sent to your bell. Pick a new time to be reminded again.</p>
            )}
          </div>
        </DrawerField>

        {todo && onDelete && (
          <div className="border-t border-gray-100 pt-4">
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete "${todo.title}"?`)) void run(onDelete);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete to-do
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === o.value ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
