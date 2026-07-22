"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Columns3,
  Filter as FilterIcon,
  List as ListIcon,
  Download,
  Loader2,
  Pin,
  Repeat,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Select } from "@/components/Select";
import { DatePicker, recurrenceLabel } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useAuthStore } from "@/lib/authStore";
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

/** Optional list columns the user can show/hide via the Customize button. */
type ColumnKey = "project" | "assignee" | "department" | "dueDate" | "priority" | "status" | "progress" | "code";
const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "code", label: "Task code" },
  { key: "project", label: "Project" },
  { key: "assignee", label: "Assignee" },
  { key: "department", label: "Department" },
  { key: "dueDate", label: "Due date" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress" },
];
const DEFAULT_COLUMNS: ColumnKey[] = ["code", "project", "assignee", "dueDate", "priority", "status", "progress"];
const COLUMNS_KEY = "taskopad.listColumns.v1";

/** One-click due-date ranges for the filter bar. */
const DATE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Today", range: () => [toIso(new Date()), toIso(new Date())] },
  {
    label: "This week",
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return [toIso(start), toIso(end)];
    },
  },
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return [
        toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      ];
    },
  },
  {
    label: "Overdue",
    range: () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return ["", toIso(y)];
    },
  },
];

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
  const removeTask = useTaskStore((s) => s.removeTask);
  const bulkPatch = useTaskStore((s) => s.bulkPatch);
  const bulkRemove = useTaskStore((s) => s.bulkRemove);
  const createTask = useTaskStore((s) => s.createTask);
  const authUserId = useAuthStore((s) => s.user?.id);

  const { users } = useUsers();
  const { departments, departmentName } = useDepartments();
  const { projects } = useProjects();
  const scope = useProjectScope((s) => s.projectId);
  const searchParams = useSearchParams();

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
  const [departmentFilter, setDepartmentFilter] = useState<string>("All");
  const [sort, setSort] = useState<SortKey>("Default");
  const [showFilters, setShowFilters] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  // Due-date range filter (client asked for a date filter on the task list).
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  // Which optional columns the list shows — persisted so the choice sticks between visits.
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);

  // Drill-down: apply any filters passed in the URL (e.g. from a dashboard score card/chart).
  useEffect(() => {
    if (!searchParams) return;
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignee = searchParams.get("assignee");
    const from = searchParams.get("dueFrom");
    const to = searchParams.get("dueTo");
    if (status && (TASK_STATUSES as string[]).includes(status)) setStatusFilter(status as TaskStatus);
    if (priority && (TASK_PRIORITIES as string[]).includes(priority)) setPriorityFilter(priority as TaskPriority);
    if (assignee) setAssigneeFilter(assignee);
    if (from) setDueFrom(from);
    if (to) setDueTo(to);
    if (status || priority || assignee || from || to) setShowFilters(true);
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnKey[];
        if (Array.isArray(parsed)) setColumns(parsed.filter((c) => ALL_COLUMNS.some((x) => x.key === c)));
      }
    } catch {
      /* ignore malformed preference */
    }
  }, []);

  function toggleColumn(key: ColumnKey) {
    setColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
      try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — keep the in-memory choice */
      }
      return next;
    });
  }

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unassigned";
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  const tasks = useMemo(() => {
    let list = allTasks.filter((t) => (effectiveProjectId ? t.projectId === effectiveProjectId : true));
    list = list.filter((t) => (showDrafts ? t.isDraft : !t.isDraft));
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "All") list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter !== "All") list = list.filter((t) => t.assigneeId === assigneeFilter);
    if (departmentFilter !== "All") list = list.filter((t) => t.departmentId === departmentFilter);
    // Plain yyyy-MM-dd string compare — same timezone-safe approach as isOverdue.
    if (dueFrom) list = list.filter((t) => t.dueDate && t.dueDate >= dueFrom);
    if (dueTo) list = list.filter((t) => t.dueDate && t.dueDate <= dueTo);
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
    // Pinned tasks always float to the top, whatever the sort.
    sorted.sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
    return sorted;
  }, [
    allTasks,
    effectiveProjectId,
    showDrafts,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    departmentFilter,
    search,
    sort,
    dueFrom,
    dueTo,
  ]);

  const activeFilters =
    (statusFilter !== "All" ? 1 : 0) +
    (priorityFilter !== "All" ? 1 : 0) +
    (assigneeFilter !== "All" ? 1 : 0) +
    (departmentFilter !== "All" ? 1 : 0) +
    (dueFrom ? 1 : 0) +
    (dueTo ? 1 : 0);

  const onPatchStatus = (t: Task, status: TaskStatus) => void patchTask(t.id, { status });
  const onPatchPriority = (t: Task, priority: TaskPriority) => void patchTask(t.id, { priority });
  const onDelete = (t: Task) => {
    if (confirm(`Delete "${t.title}"? This can't be undone.`)) void removeTask(t.id);
  };
  const onTogglePin = (t: Task) => void patchTask(t.id, { pinned: !t.pinned });

  // ---- Bulk actions ----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const visibleIds = tasks.map((t) => t.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }
  async function runBulk(fn: () => Promise<void>) {
    setBulkBusy(true);
    try {
      await fn();
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  /** Export the currently filtered tasks to CSV. */
  function exportTasksCsv() {
    const head = ["Code", "Title", "Project", "Assignee", "Status", "Priority", "Progress", "Due Date"];
    const rows = tasks.map((t) => [
      t.code,
      t.title,
      projectName(t.projectId),
      userName(t.assigneeId),
      t.status,
      t.priority,
      `${t.progress}%`,
      t.dueDate,
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Bulk-create tasks from a CSV whose first column is the title (optional due date second). */
  async function importTasksCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return;
    // Skip a header row if it looks like one.
    const body = /title/i.test(lines[0]) ? lines.slice(1) : lines;
    const parsed = body
      .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
      .filter((cols) => cols[0]);
    if (parsed.length === 0) return;
    if (!confirm(`Import ${parsed.length} task(s) from ${file.name}?`)) return;

    setBulkBusy(true);
    try {
      for (const cols of parsed) {
        await createTask({
          title: cols[0],
          description: "",
          projectId: effectiveProjectId ?? null,
          assigneeId: String(authUserId ?? users[0]?.id ?? ""),
          followerIds: [],
          clientName: null,
          status: "Pending",
          priority: "Medium",
          progress: 0,
          dueDate: cols[1] || toIso(new Date()),
          subtasks: [],
        });
      }
    } finally {
      setBulkBusy(false);
    }
  }

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

        <Select
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          className="w-[150px]"
          options={(["Default", "Due Date", "Priority", "Status"] as SortKey[]).map((s) => ({
            value: s,
            label: `Sort: ${s}`,
          }))}
        />

        {/* Customize which columns the list shows */}
        <div className="relative">
          <button
            onClick={() => setShowColumns((c) => !c)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all duration-150 active:scale-95 ${
              showColumns
                ? "border-brand-accent bg-cyan-50 text-brand-accent"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={14} /> Customize
          </button>
          {showColumns && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumns(false)} />
              <div className="animate-menu-pop absolute right-0 top-11 z-20 w-56 origin-top-right rounded-xl border border-gray-100 bg-white p-1 shadow-xl ring-1 ring-black/[0.03]">
                <div className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
                  Show columns
                </div>
                {ALL_COLUMNS.map((c) => {
                  const on = columns.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleColumn(c.key)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                    >
                      {c.label}
                      <span
                        className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${
                          on ? "bg-brand-accent" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all duration-200 ${
                            on ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

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

        {/* Bulk import / export */}
        <label
          title="Import tasks from CSV (first column = title, optional second = due date)"
          className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
        >
          <Upload size={14} className="inline" /> Import
          <input type="file" accept=".csv,text/csv" hidden onChange={importTasksCsv} />
        </label>
        <button
          onClick={exportTasksCsv}
          disabled={tasks.length === 0}
          title="Export the filtered tasks to CSV"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          <Download size={14} className="inline" /> Export
        </button>

        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          + Add Task
        </button>
      </div>

      {/* Bulk action bar — appears once rows are selected */}
      {selected.size > 0 && (
        <div className="animate-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-brand-accent bg-cyan-50/60 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-accent">{selected.size} selected</span>
          <FilterSelect
            label="Set status"
            value="All"
            onChange={(v) =>
              v !== "All" && runBulk(() => bulkPatch([...selected], { status: v as TaskStatus }))
            }
            options={["All", ...TASK_STATUSES]}
          />
          <FilterSelect
            label="Set priority"
            value="All"
            onChange={(v) =>
              v !== "All" && runBulk(() => bulkPatch([...selected], { priority: v as TaskPriority }))
            }
            options={["All", ...TASK_PRIORITIES]}
          />
          <FilterSelect
            label="Assign to"
            value="All"
            onChange={(v) => v !== "All" && runBulk(() => bulkPatch([...selected], { assigneeId: v }))}
            options={["All", ...users.map((u) => u.id)]}
            render={(v) => (v === "All" ? "—" : userName(v))}
          />
          <button
            onClick={() => runBulk(() => bulkPatch([...selected], { pinned: true }))}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-amber-400 hover:text-amber-600 active:scale-95"
          >
            <Pin size={12} /> Pin
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} task(s)? This can't be undone.`)) {
                void runBulk(() => bulkRemove([...selected]));
              }
            }}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-gray-800"
          >
            Clear selection
          </button>
          {bulkBusy && <Loader2 size={14} className="animate-spin text-brand-accent" />}
        </div>
      )}

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
          <FilterSelect
            label="Department"
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={["All", ...departments.map((d) => String(d.id))]}
            render={(v) => (v === "All" ? "All" : departmentName(v))}
          />
          {/* Due-date range */}
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Due from</span>
            <DatePicker value={dueFrom} onChange={setDueFrom} placeholder="From" className="py-1.5" />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">to</span>
            <DatePicker
              value={dueTo}
              onChange={setDueTo}
              min={dueFrom || undefined}
              placeholder="To"
              className="py-1.5"
            />
          </label>

          {/* Quick ranges — the common cases without touching the pickers. */}
          <div className="flex items-center gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  const [f, t] = p.range();
                  setDueFrom(f);
                  setDueTo(t);
                }}
                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
              >
                {p.label}
              </button>
            ))}
          </div>

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setStatusFilter("All");
                setPriorityFilter("All");
                setAssigneeFilter("All");
                setDepartmentFilter("All");
                setDueFrom("");
                setDueTo("");
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
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          columns={columns}
          departmentName={departmentName}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allSelected={allSelected}
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
      <Select
        value={value}
        onChange={onChange}
        size="sm"
        className="min-w-[120px]"
        options={options.map((o) => ({ value: o, label: render ? render(o) : o }))}
      />
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
  onDelete,
  onTogglePin,
  columns,
  departmentName,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
}: {
  tasks: Task[];
  userName: (id: string) => string;
  projectName: (id: string | null) => string;
  showProject: boolean;
  onOpen: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onStatus: (t: Task, s: TaskStatus) => void;
  onPriority: (t: Task, p: TaskPriority) => void;
  onDelete: (t: Task) => void;
  onTogglePin: (t: Task) => void;
  columns: ColumnKey[];
  departmentName: (id: string | null) => string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
}) {
  const show = (k: ColumnKey) => columns.includes(k);
  const showProjectCol = showProject && show("project");
  return (
    <div className="animate-fade-in overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th className="w-10 px-4 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                title="Select all"
                className="h-4 w-4 accent-cyan-600"
              />
            </th>
            <th className="w-8 px-2 py-2" />
            <th className="px-4 py-2 font-medium">Task</th>
            {showProjectCol && <th className="px-4 py-2 font-medium">Project</th>}
            {show("assignee") && <th className="px-4 py-2 font-medium">Assignee</th>}
            {show("department") && <th className="px-4 py-2 font-medium">Department</th>}
            {show("dueDate") && <th className="px-4 py-2 font-medium">Due Date</th>}
            {show("priority") && <th className="px-4 py-2 font-medium">Priority</th>}
            {show("status") && <th className="px-4 py-2 font-medium">Status</th>}
            {show("progress") && <th className="w-28 px-4 py-2 font-medium">Progress</th>}
            <th className="w-10 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isOverdue(t);
            return (
              <tr
                key={t.id}
                className={`cursor-pointer border-b border-gray-50 transition-colors duration-150 last:border-b-0 hover:bg-cyan-50/40 ${
                  t.pinned ? "bg-amber-50/40" : "even:bg-gray-50/40"
                }`}
                onClick={() => onOpen(t)}
              >
                {/* Row selection drives the bulk action bar; completion is set via the Status column. */}
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => onToggleSelect(t.id)}
                    title="Select task"
                    className="h-4 w-4 accent-cyan-600"
                  />
                </td>
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onTogglePin(t)}
                    title={t.pinned ? "Unpin task" : "Pin task to top"}
                    className={`rounded-md p-1 transition-all duration-150 active:scale-90 ${
                      t.pinned
                        ? "text-amber-500 hover:bg-amber-100"
                        : "text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-amber-500"
                    }`}
                  >
                    <Pin size={14} className={t.pinned ? "fill-amber-400" : ""} />
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium ${t.status === "Completed" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {t.title}
                    </span>
                    {t.recurrenceRule && t.recurrenceRule !== "NONE" && (
                      <span
                        title={`Repeats ${recurrenceLabel(t.recurrenceRule as RecurrenceRule, t.recurrenceInterval)}`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-accent"
                      >
                        <Repeat size={9} />
                        {recurrenceLabel(t.recurrenceRule as RecurrenceRule, t.recurrenceInterval)}
                      </span>
                    )}
                  </div>
                  {show("code") && (
                    <div className="text-xs text-gray-400">
                      {t.code}
                      {t.subtasks.length > 0 && ` · ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} sub tasks`}
                    </div>
                  )}
                </td>
                {showProjectCol && <td className="px-4 py-2.5 text-gray-600">{projectName(t.projectId)}</td>}
                {show("assignee") && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={24} />
                      <span className="text-gray-600">{userName(t.assigneeId)}</span>
                    </div>
                  </td>
                )}
                {show("department") && (
                  <td className="px-4 py-2.5">
                    {t.departmentId ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {departmentName(t.departmentId)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                )}
                {show("dueDate") && (
                  <td className={`px-4 py-2.5 ${overdue ? "font-medium text-rose-600" : "text-gray-600"}`}>
                    {formatTaskDate(t.dueDate)}
                    {overdue && <span className="ml-1 text-xs">· overdue</span>}
                  </td>
                )}
                {/* Inline editors — change priority/status without opening the task. */}
                {show("priority") && (
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <PrioritySelect priority={t.priority} onChange={(p) => onPriority(t, p)} />
                  </td>
                )}
                {show("status") && (
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <StatusSelect status={t.status} onChange={(s) => onStatus(t, s)} />
                  </td>
                )}
                {show("progress") && (
                  <td className="px-4 py-2.5">
                    <ProgressBar value={t.progress} />
                    <div className="mt-1 text-[10px] text-gray-400">{t.progress}%</div>
                  </td>
                )}
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDelete(t)}
                    title="Delete task"
                    className="rounded-md p-1.5 text-gray-400 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                  >
                    <Trash2 size={15} />
                  </button>
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
          const dayTasks = tasks.filter((t) => t.dueDate === toIso(d));
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
