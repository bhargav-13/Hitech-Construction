"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Columns3,
  Filter as FilterIcon,
  List as ListIcon,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useUsers } from "@/lib/useUsers";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useTaskStore } from "@/lib/taskStore";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatTaskDate,
  isOverdue,
  sameDay,
  toIso,
} from "@/lib/taskTypes";
import type { Task, TaskPriority, TaskStatus } from "@/lib/taskTypes";
import { PriorityChip, PrioritySelect, ProgressBar, StatusChip, StatusSelect, UserAvatar } from "./TaskBits";
import { TaskDrawer } from "./TaskDrawer";

type View = "List" | "Kanban" | "Calendar";
type SortKey = "Default" | "Due Date" | "Priority" | "Status";

const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * The Tasks surface. Used standalone in the Taskopad module (all accessible projects, optionally
 * narrowed by the header project dropdown) and embedded in the project workspace scoped to one
 * project via `projectId`.
 */
export function TaskWorkspace({ projectId }: { projectId?: string }) {
  const allTasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const loaded = useTaskStore((s) => s.loaded);
  const error = useTaskStore((s) => s.error);
  const load = useTaskStore((s) => s.load);
  const patchTask = useTaskStore((s) => s.patchTask);

  const { users } = useUsers();
  const { projects } = useProjects();
  const scope = useProjectScope((s) => s.projectId);

  useEffect(() => {
    load();
  }, [load]);

  // Embedded (project page) → hard-scope to that project. Otherwise honour the header dropdown.
  const effectiveProjectId = projectId ?? (scope !== "all" ? scope : undefined);

  const [view, setView] = useState<View>("List");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "All">("All");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [sort, setSort] = useState<SortKey>("Default");
  const [showFilters, setShowFilters] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  const tasks = useMemo(() => {
    let list = allTasks.filter((t) => (effectiveProjectId ? t.projectId === effectiveProjectId : true));
    list = list.filter((t) => (showDrafts ? t.isDraft : !t.isDraft));
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "All") list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== "All") list = list.filter((t) => t.assigneeId === assigneeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === "Due Date") sorted.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (sort === "Priority") sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    if (sort === "Status") sorted.sort((a, b) => a.status.localeCompare(b.status));
    return sorted;
  }, [allTasks, effectiveProjectId, showDrafts, statusFilter, priorityFilter, assigneeFilter, search, sort]);

  const activeFilters =
    (statusFilter !== "All" ? 1 : 0) + (priorityFilter !== "All" ? 1 : 0) + (assigneeFilter !== "All" ? 1 : 0);

  const onPatchStatus = (t: Task, status: TaskStatus) => void patchTask(t.id, { status });
  const onPatchPriority = (t: Task, priority: TaskPriority) => void patchTask(t.id, { priority });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <button
          onClick={() => setShowFilters((f) => !f)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all duration-150 active:scale-95 ${
            activeFilters > 0 || showFilters
              ? "border-brand-accent bg-cyan-50 text-brand-accent"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <FilterIcon size={14} /> Filter
          {activeFilters > 0 && (
            <span className="rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-white">
              {activeFilters}
            </span>
          )}
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none transition-colors duration-150 focus:border-cyan-500"
        >
          {(["Default", "Due Date", "Priority", "Status"] as SortKey[]).map((s) => (
            <option key={s} value={s}>
              Sort: {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowDrafts((d) => !d)}
          className={`rounded-lg border px-3 py-2 text-sm transition-all duration-150 active:scale-95 ${
            showDrafts
              ? "border-brand-accent bg-cyan-50 text-brand-accent"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Draft Tasks
        </button>

        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add Task
        </button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="animate-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <SlidersHorizontal size={14} className="text-gray-400" />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TaskStatus | "All")}
            options={["All", ...TASK_STATUSES]}
          />
          <FilterSelect
            label="Priority"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as TaskPriority | "All")}
            options={["All", ...TASK_PRIORITIES]}
          />
          <FilterSelect
            label="Assignee"
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            options={["All", ...users.map((u) => u.id)]}
            render={(v) => (v === "All" ? "All" : userName(v))}
          />
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setStatusFilter("All");
                setPriorityFilter("All");
                setAssigneeFilter("All");
              }}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-rose-600"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* View tabs */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-5">
          {([
            { v: "List", icon: ListIcon },
            { v: "Kanban", icon: Columns3 },
            { v: "Calendar", icon: CalendarDays },
          ] as const).map(({ v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors duration-150 ${
                view === v ? "border-brand-accent text-brand-accent" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon size={15} /> {v}
            </button>
          ))}
        </div>
        <span className="pb-2 text-xs text-gray-400">
          {loading && !loaded ? "Loading…" : `${tasks.length} tasks`}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !loaded ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
          <Loader2 className="mr-2 animate-spin" size={18} /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <EmptyTasks onAdd={() => setCreating(true)} draft={showDrafts} />
      ) : view === "List" ? (
        <ListView
          tasks={tasks}
          userName={userName}
          projectName={projectName}
          showProject={!projectId}
          onOpen={setEditing}
          onToggleDone={(t) => void patchTask(t.id, { status: t.status === "Completed" ? "Pending" : "Completed" })}
          onStatus={onPatchStatus}
          onPriority={onPatchPriority}
        />
      ) : view === "Kanban" ? (
        <KanbanView tasks={tasks} userName={userName} onOpen={setEditing} onMove={(t, s) => void patchTask(t.id, { status: s })} />
      ) : (
        <CalendarView tasks={tasks} onOpen={setEditing} />
      )}

      {creating && <TaskDrawer defaultProjectId={effectiveProjectId ?? null} onClose={() => setCreating(false)} />}
      {editing && <TaskDrawer existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-600 outline-none transition-colors duration-150 focus:border-cyan-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyTasks({ onAdd, draft }: { onAdd: () => void; draft: boolean }) {
  return (
    <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <ListIcon size={24} />
      </div>
      <div className="text-base font-semibold text-gray-700">
        {draft ? "No draft tasks." : "No tasks here yet."}
      </div>
      <p className="mt-1 max-w-xs text-sm text-gray-400">
        {draft ? "Tasks you save as draft will appear here." : "Create a task and assign it to your team."}
      </p>
      {!draft && (
        <button
          onClick={onAdd}
          className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add Task
        </button>
      )}
    </div>
  );
}

function ListView({
  tasks,
  userName,
  projectName,
  showProject,
  onOpen,
  onToggleDone,
  onStatus,
  onPriority,
}: {
  tasks: Task[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
  showProject: boolean;
  onOpen: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onStatus: (t: Task, s: TaskStatus) => void;
  onPriority: (t: Task, p: TaskPriority) => void;
}) {
  return (
    <div className="animate-fade-in overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th className="w-10 px-4 py-2" />
            <th className="px-4 py-2 font-medium">Task</th>
            {showProject && <th className="px-4 py-2 font-medium">Project</th>}
            <th className="px-4 py-2 font-medium">Assignee</th>
            <th className="px-4 py-2 font-medium">Due Date</th>
            <th className="px-4 py-2 font-medium">Priority</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="w-28 px-4 py-2 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isOverdue(t);
            return (
              <tr
                key={t.id}
                className="cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40"
                onClick={() => onOpen(t)}
              >
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={t.status === "Completed"}
                    onChange={() => onToggleDone(t)}
                    className="h-4 w-4 accent-cyan-600"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div className={`font-medium ${t.status === "Completed" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                    {t.title}
                  </div>
                  <div className="text-xs text-gray-400">
                    {t.code}
                    {t.subtasks.length > 0 && ` · ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} sub tasks`}
                  </div>
                </td>
                {showProject && <td className="px-4 py-2.5 text-gray-600">{projectName(t.projectId)}</td>}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={24} />
                    <span className="text-gray-600">{userName(t.assigneeId)}</span>
                  </div>
                </td>
                <td className={`px-4 py-2.5 ${overdue ? "font-medium text-rose-600" : "text-gray-600"}`}>
                  {formatTaskDate(t.dueDate)}
                  {overdue && <span className="ml-1 text-xs">· overdue</span>}
                </td>
                {/* Inline editors — change priority/status without opening the task. */}
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <PrioritySelect priority={t.priority} onChange={(p) => onPriority(t, p)} />
                </td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <StatusSelect status={t.status} onChange={(s) => onStatus(t, s)} />
                </td>
                <td className="px-4 py-2.5">
                  <ProgressBar value={t.progress} />
                  <div className="mt-1 text-[10px] text-gray-400">{t.progress}%</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({
  tasks,
  userName,
  onOpen,
  onMove,
}: {
  tasks: Task[];
  userName: (id: string) => string;
  onOpen: (t: Task) => void;
  onMove: (t: Task, s: TaskStatus) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="animate-fade-in flex gap-4 overflow-x-auto pb-2">
      {TASK_STATUSES.map((status) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const t = tasks.find((x) => x.id === dragId);
              if (t && t.status !== status) onMove(t, status);
              setDragId(null);
            }}
            className="flex w-[260px] shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <StatusChip status={status} />
              <span className="text-xs font-medium text-gray-400">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onClick={() => onOpen(t)}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-shadow duration-150 hover:shadow-md"
                >
                  <div className="mb-1.5 text-sm font-medium text-gray-800">{t.title}</div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <PriorityChip priority={t.priority} />
                    {isOverdue(t) && (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                        Overdue
                      </span>
                    )}
                  </div>
                  <ProgressBar value={t.progress} />
                  <div className="mt-2 flex items-center justify-between">
                    <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={22} />
                    <span className="text-[10px] text-gray-400">{formatTaskDate(t.dueDate)}</span>
                  </div>
                </div>
              ))}
              {col.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-300">
                  Drop here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [month, setMonth] = useState(() => new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="animate-fade-in rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-all duration-150 hover:bg-gray-50 active:scale-90"
          >
            ‹
          </button>
          <button
            onClick={() => setMonth(new Date())}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Today
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-all duration-150 hover:bg-gray-50 active:scale-90"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100 pb-1 text-center text-xs font-medium text-gray-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} className="min-h-[92px] border-b border-r border-gray-50" />;
          const dayTasks = tasks.filter((t) => sameDay(new Date(t.dueDate), d));
          const isToday = sameDay(d, new Date());
          return (
            <div key={toIso(d)} className="min-h-[92px] border-b border-r border-gray-50 p-1.5">
              <div
                className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-brand-accent font-semibold text-white" : "text-gray-500"
                }`}
              >
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 2).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] transition-opacity duration-150 hover:opacity-80 ${
                      isOverdue(t) ? "bg-rose-50 text-rose-700" : "bg-cyan-50 text-cyan-700"
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 2 && (
                  <div className="px-1.5 text-[10px] text-gray-400">+{dayTasks.length - 2} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
