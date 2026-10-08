"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Circle,
  Columns3,
  CornerDownRight,
  List as ListIcon,
  Loader2,
  MessageCircle,
  Paperclip,
  Pin,
  Repeat,
  Search,
  Settings2,
  Trash2,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/Select";
import { DatePicker, recurrenceLabel } from "@/components/DatePicker";
import type { RecurrenceRule } from "@/components/DatePicker";
import { useUsers } from "@/lib/useUsers";
import { useDepartments } from "@/lib/useDepartments";
import { useAuthStore } from "@/lib/authStore";
import { useProjects } from "@/lib/useProjects";
import { useProjectScope } from "@/lib/projectScope";
import { useTaskStore } from "@/lib/taskStore";
import { getAccessSelf } from "@/lib/api";
import { unreadOn, useTaskSeen, useTaskUnread } from "@/lib/taskNotifications";
import { isSuperAdminRole, useTaskRights } from "@/lib/taskPermissions";
import { useCan } from "@/lib/permissions";
import { useTaskStatuses } from "@/lib/useTaskStatuses";
import type { StatusRow } from "@/lib/useTaskStatuses";
import { TaskImportDrawer, type ParsedTaskRow } from "@/components/task/TaskImportDrawer";
import type { TaskRights } from "@/lib/taskPermissions";
import { TASK_PRIORITIES, formatTaskDate, formatTaskDateTime, sameDay, toIso } from "@/lib/taskTypes";
import type { Task, TaskPriority, TaskStatus } from "@/lib/taskTypes";
import { PrioritySelect, ProgressBar, StatusRowChip, TaskStatusSelect, UserAvatar, PriorityChip } from "./TaskBits";
import { TaskDrawer } from "./TaskDrawer";
import {
  ALL_COLUMNS,
  DEFAULT_COLUMN_PREF,
  EMPTY_DATE_FILTER,
  GROUPS,
  VARIANCE_LABEL,
  groupOf,
  matchesDate,
  matchesRule,
  normaliseColumnPref,
  rowAssignee,
  rowDue,
  rowPriority,
  rowStatus,
  rowTitle,
  rowsForView,
  varianceOf,
} from "./workspace/taskFilters";
import type {
  ColumnKey,
  ColumnPref,
  DateTypeFilter,
  FilterRule,
  GroupKey,
  TaskRow,
  ViewKey,
} from "./workspace/taskFilters";
import {
  CustomizeDrawer,
  DateTypeButton,
  FilterButton,
  MoreMenu,
  StatusFilterButton,
  ViewMenuButton,
} from "./workspace/Toolbar";

type View = "List" | "Kanban" | "Calendar";
type SortKey = "title" | "dueDate" | "status" | "priority" | "createdDate";

const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };
const COLUMNS_KEY = "taskopad.listColumns.v2";
const FAV_VIEW_KEY = "taskopad.favouriteView.v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep the in-memory choice */
  }
}

/**
 * The Tasks surface. Used standalone in the Taskopad module (all accessible projects, optionally
 * narrowed by the header project dropdown) and embedded in the project workspace scoped to one
 * project via `projectId`.
 *
 * The toolbar mirrors app.taskopad.com: Search · Filter (rule builder) · Status (multi-select) ·
 * views ("Default", with a favourite) · Date Type · Add Task, then List/Kanban/Calendar · Draft Tasks
 * · Customize · More. The list is grouped Today / Overdue / Upcoming like theirs, and sub-tasks
 * handed to you show on their own lines.
 *
 * `fill`: the workspace takes its parent's full height — toolbar, filters and view tabs stay fixed
 * and only the list / board / calendar scrolls (the list keeps its column header pinned).
 */
export function TaskWorkspace({ projectId, fill = false }: { projectId?: string; fill?: boolean }) {
  const allTasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const loaded = useTaskStore((s) => s.loaded);
  const error = useTaskStore((s) => s.error);
  const load = useTaskStore((s) => s.load);
  const patchTask = useTaskStore((s) => s.patchTask);
  const patchSubtask = useTaskStore((s) => s.patchSubtask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const bulkPatch = useTaskStore((s) => s.bulkPatch);
  const bulkRemove = useTaskStore((s) => s.bulkRemove);
  const createTask = useTaskStore((s) => s.createTask);
  const authUserId = useAuthStore((s) => s.user?.id);
  const me = authUserId != null ? String(authUserId) : "";
  const roleName = useAuthStore((s) => s.user?.role?.name);
  const isSuperAdmin = isSuperAdminRole(roleName);
  // A task's details belong to its creator (and Super Admin); the assignee may only move status
  // and progress. Row controls are disabled to match, so nothing fails on click.
  const { rightsFor } = useTaskRights();
  const can = useCan();
  const canCreateTasks = can("TASKOPAD_TASKS:CREATE");
  const canSettings = can("TASKOPAD_SETTINGS:EDIT");
  const scopeMode = useTaskStore((s) => s.scope);
  const setStoreScope = useTaskStore((s) => s.setScope);
  const [hasSubtree, setHasSubtree] = useState(false);
  const [team, setTeam] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    getAccessSelf()
      .then((r) => {
        if (cancelled) return;
        setHasSubtree(!!r.hasSubtree);
        setTeam(new Set((r.teamUserIds ?? []).map(String)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const showScopeToggle = isSuperAdmin || hasSubtree;
  const scopeAll = scopeMode === "ALL";
  const setScopeAll = (v: boolean) => void setStoreScope(v ? "ALL" : "MINE");

  const { users } = useUsers();
  const { departments, departmentName } = useDepartments();
  const { projects } = useProjects();
  const { rows: statusRows, rowFor, rowForBase } = useTaskStatuses();
  const seenAt = useTaskSeen((s) => s.seenAt);
  const scope = useProjectScope((s) => s.projectId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    load();
  }, [load]);

  // Embedded (project page) → hard-scope to that project. Otherwise honour the header dropdown.
  const effectiveProjectId = projectId ?? (scope !== "all" ? scope : undefined);

  const [view, setView] = useState<View>("List");
  const [search, setSearch] = useState("");
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateTypeFilter>(EMPTY_DATE_FILTER);
  const [savedView, setSavedView] = useState<ViewKey>("default");
  const [favouriteView, setFavouriteView] = useState<ViewKey>("default");
  const [showDrafts, setShowDrafts] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState<null | "tasks" | "drafts">(null);
  const [columnPref, setColumnPref] = useState<ColumnPref>(DEFAULT_COLUMN_PREF);
  const [customizing, setCustomizing] = useState(false);
  const [bulkMode, setBulkMode] = useState<null | "edit" | "delete">(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  // Completed work is hidden until asked for. The list is a worklist: what is finished is noise
  // on it, and on a busy month it was burying everything still open.
  const [hideCompleted, setHideCompleted] = useState(true);

  // Saved column layout and favourite view.
  useEffect(() => {
    setColumnPref(normaliseColumnPref(readJson(COLUMNS_KEY)));
    const fav = readJson<ViewKey>(FAV_VIEW_KEY);
    if (fav) {
      setFavouriteView(fav);
      setSavedView(fav);
    }
  }, []);
  function updateColumns(p: ColumnPref) {
    setColumnPref(p);
    writeJson(COLUMNS_KEY, p);
  }
  function favourite(v: ViewKey) {
    setFavouriteView(v);
    writeJson(FAV_VIEW_KEY, v);
  }
  function selectView(v: ViewKey) {
    setSavedView(v);
    // "All Tasks Team" is the team-wide list; every other view reads from whatever is loaded.
    if (v === "team" && !scopeAll && showScopeToggle) setScopeAll(true);
  }

  // Drill-down: apply any filters passed in the URL (e.g. from a dashboard score card/chart).
  // Applied once per distinct query (and once more for the status filter when the server's
  // statuses land) — never on every render, or setting the filters re-renders and re-applies them
  // in a loop that blocks every navigation.
  const appliedQuery = useRef<string | null>(null);
  const appliedStatusRows = useRef<typeof statusRows | null>(null);
  useEffect(() => {
    if (!searchParams) return;
    const query = searchParams.toString();
    // statusRows is memoised, so a new array means the statuses really changed (server rows landed).
    if (appliedQuery.current === query && appliedStatusRows.current === statusRows) return;
    const firstTime = appliedQuery.current !== query;
    appliedQuery.current = query;
    appliedStatusRows.current = statusRows;
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignee = searchParams.get("assignee");
    const from = searchParams.get("dueFrom");
    const to = searchParams.get("dueTo");
    if (status) {
      const ids = statusRows.filter((r) => r.base === status || r.name === status).map((r) => r.id);
      if (ids.length) setStatusIds(ids);
      if (status === "Completed") setHideCompleted(false);
    }
    if (!firstTime) return; // only the status filter depends on the statuses having loaded
    const next: FilterRule[] = [];
    if (priority) next.push({ id: "url-p", field: "priority", values: [priority] });
    if (assignee) next.push({ id: "url-a", field: "assignee", values: [assignee] });
    if (next.length) setRules(next);
    if (from || to) setDateFilter({ fields: ["due"], mode: "range", from: from || "0000-01-01", to: to || "" });
    // statusRows changes once when the server's statuses land; re-reading the URL then is harmless.
  }, [searchParams, statusRows]);

  // Deep-link: open a specific task's drawer when arriving via ?task=<id> (e.g. from a notification).
  // Guard against re-opening: the task list refetches in the background, and without this the effect
  // would re-fire on every `allTasks` change and pop the drawer back open after the user closed it.
  const openedTaskParam = useRef<string | null>(null);
  useEffect(() => {
    const taskId = searchParams?.get("task");
    if (!taskId) {
      openedTaskParam.current = null;
      return;
    }
    if (openedTaskParam.current === taskId) return;
    const match = allTasks.find((t) => t.id === taskId);
    if (match) {
      setEditing(match);
      openedTaskParam.current = taskId;
    }
  }, [searchParams, allTasks]);

  // Close the drawer and strip ?task= from the URL so a background refetch can't reopen it.
  function closeDrawer() {
    setEditing(null);
    if (searchParams?.get("task")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("task");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  const userName = (id: string | null | undefined) => (id ? users.find((u) => u.id === id)?.name ?? "Unknown" : "—");
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  const statusRowOf = (r: TaskRow): StatusRow => (r.kind === "sub" ? rowForBase(rowStatus(r)) : rowFor(r.task));

  const rows = useMemo(() => {
    let base = allTasks.filter((t) => (effectiveProjectId ? t.projectId === effectiveProjectId : true));
    base = base.filter((t) => (showDrafts ? t.isDraft : !t.isDraft));
    for (const r of rules) base = base.filter((t) => matchesRule(t, r));

    let list = rowsForView(base, savedView, {
      me,
      team,
      unread: (t) => unreadOn(t, me, seenAt[t.id] ?? 0),
    });

    // Hide completed unless asked for, or unless the Status filter names a completed status.
    const statusWantsCompleted = statusIds.some((id) => statusRows.find((r) => r.id === id)?.base === "Completed");
    if (hideCompleted && !statusWantsCompleted) list = list.filter((r) => rowStatus(r) !== "Completed");
    if (statusIds.length) list = list.filter((r) => statusIds.includes(statusRowOf(r).id));
    list = list.filter((r) => matchesDate(r, dateFilter));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          rowTitle(r).toLowerCase().includes(q) ||
          r.task.code.toLowerCase().includes(q) ||
          (r.kind === "sub" && r.task.title.toLowerCase().includes(q))
      );
    }

    const sorted = [...list];
    if (sort) {
      const val = (r: TaskRow): string | number => {
        switch (sort.key) {
          case "title":
            return rowTitle(r).toLowerCase();
          case "dueDate":
            return rowDue(r) || "9999";
          case "status":
            return statusRowOf(r).sortOrder;
          case "priority":
            return PRIORITY_RANK[rowPriority(r)];
          case "createdDate":
            return r.task.createdAt || "";
        }
      };
      sorted.sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    // Pinned tasks always float to the top, whatever the sort; a sub-task line stays under its parent.
    sorted.sort((a, b) => Number(b.task.pinned && b.kind === "task") - Number(a.task.pinned && a.kind === "task"));
    return sorted;
    // statusRowOf reads rowFor/rowForBase, which change with statusRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, effectiveProjectId, showDrafts, rules, savedView, me, team, seenAt, hideCompleted, statusIds, statusRows, dateFilter, search, sort]);

  const activeFilterCount = rules.length + statusIds.length + (dateFilter.from ? 1 : 0) + (savedView !== "default" ? 1 : 0);

  function clearAll() {
    setRules([]);
    setStatusIds([]);
    setDateFilter(EMPTY_DATE_FILTER);
    setSavedView("default");
    setSearch("");
  }

  // ---- Row actions ----
  const onStatusRow = (r: TaskRow, row: StatusRow) => {
    if (r.kind === "sub") {
      void patchSubtask(r.task.id, r.sub.id, { status: row.base });
      return;
    }
    if (!rightsFor(r.task).canSetStatus) return;
    void patchTask(r.task.id, row.id.startsWith("base:") ? { status: row.base } : { statusId: row.id });
  };
  const onToggleDone = (r: TaskRow) => {
    const done = rowStatus(r) === "Completed";
    if (r.kind === "sub") {
      void patchSubtask(r.task.id, r.sub.id, { status: done ? "Pending" : "Completed" });
      return;
    }
    if (!rightsFor(r.task).canSetStatus) return;
    void patchTask(r.task.id, { status: done ? "Pending" : "Completed" }).catch((err: unknown) =>
      alert(err instanceof Error ? err.message : "Could not update the task.")
    );
  };
  const onPriorityRow = (r: TaskRow, priority: TaskPriority) => {
    if (r.kind === "sub") {
      void patchSubtask(r.task.id, r.sub.id, { priority });
      return;
    }
    if (!rightsFor(r.task).canEditAll) return;
    void patchTask(r.task.id, { priority });
  };
  const onDelete = (t: Task) => {
    if (!rightsFor(t).canDelete) return;
    if (confirm(`Move "${t.title}" to the recycle bin? You can restore it from More → Recycle Bin.`)) void removeTask(t.id);
  };
  const onTogglePin = (t: Task) => {
    if (!rightsFor(t).canEditAll) return;
    void patchTask(t.id, { pinned: !t.pinned });
  };

  // ---- Bulk actions ----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const visibleIds = rows.filter((r) => r.kind === "task").map((r) => r.task.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const showChecks = bulkMode !== null || selected.size > 0;

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "The bulk change failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  // A selection can mix tasks the user owns with ones they don't. Each bulk op therefore runs only
  // over the rows it's allowed to touch, and says so when it had to skip some.
  const selectedTasks = allTasks.filter((t) => selected.has(t.id));
  const bulkEditableIds = selectedTasks.filter((t) => rightsFor(t).canEditAll).map((t) => t.id);
  const bulkStatusIds = selectedTasks.filter((t) => rightsFor(t).canSetStatus).map((t) => t.id);

  function runBulkOn(ids: string[], fn: (ids: string[]) => Promise<void>) {
    const skipped = selected.size - ids.length;
    if (ids.length === 0) {
      alert("You can only change tasks you created. None of the selected tasks qualify.");
      return;
    }
    if (skipped > 0 && !confirm(`${skipped} of ${selected.size} selected task(s) aren't yours to change and will be skipped. Continue?`)) {
      return;
    }
    void runBulk(() => fn(ids));
  }

  /** Bulk Export: the rows on screen, with the columns switched on, as CSV. */
  function exportCsv() {
    const cols = columnPref.order.filter((k) => columnPref.on.includes(k));
    const head = ["Task", "Type", ...cols.map((k) => ALL_COLUMNS.find((c) => c.key === k)?.label ?? k)];
    const lines = rows.map((r) => [rowTitle(r), r.kind === "sub" ? `Sub-task of ${r.task.code}` : "Task", ...cols.map((k) => cellText(r, k))]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function cellText(r: TaskRow, k: ColumnKey): string {
    const t = r.task;
    switch (k) {
      case "dueDate":
        return rowDue(r);
      case "assignee":
        return userName(rowAssignee(r));
      case "status":
        return statusRowOf(r).name;
      case "follower":
        return t.followerIds.map((f) => userName(f)).join("; ");
      case "project":
        return projectName(t.projectId);
      case "service":
        return t.serviceName ?? "";
      case "client":
        return t.clientName ?? "";
      case "createdDate":
        return t.createdAt?.slice(0, 10) ?? "";
      case "closedDate":
        return t.closedAt?.slice(0, 10) ?? "";
      case "priority":
        return rowPriority(r);
      case "progress":
        return `${t.progress}%`;
      case "department":
        return departmentName(t.departmentId);
      case "owner":
        return userName(t.createdBy);
      case "variance": {
        const v = varianceOf(t);
        return v ? VARIANCE_LABEL[v.kind] : "";
      }
      case "code":
        return t.code;
    }
  }

  /** Bulk-create tasks from a parsed sheet — as real tasks, or as drafts ("Import Draft Tasks"). */
  async function importParsedTasks(parsed: ParsedTaskRow[], asDraft: boolean): Promise<number> {
    setBulkBusy(true);
    let created = 0;
    try {
      for (const r of parsed) {
        await createTask({
          title: r.title,
          description: r.description,
          projectId: effectiveProjectId ?? null,
          assigneeId: String(authUserId ?? users[0]?.id ?? ""),
          followerIds: [],
          clientName: null,
          status: r.status,
          priority: r.priority,
          progress: 0,
          dueDate: r.dueDate,
          subtasks: [],
          isDraft: asDraft,
        });
        created++;
      }
    } finally {
      setBulkBusy(false);
    }
    if (asDraft) setShowDrafts(true);
    return created;
  }

  const visibleColumns = columnPref.order.filter(
    (k) => columnPref.on.includes(k) && !(k === "project" && !!projectId)
  );

  return (
    <div className={fill ? "flex h-full min-h-0 flex-col gap-3 [&>*]:shrink-0" : "space-y-3"}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-sm outline-none" />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-500">
              <X size={14} />
            </button>
          )}
        </div>
        <FilterButton
          rules={rules}
          onApply={setRules}
          sources={{
            people: users.map((u) => ({ id: u.id, name: u.name })),
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
            departments: departments.map((d) => ({ id: String(d.id), name: d.name })),
          }}
        />
        <StatusFilterButton rows={statusRows.filter((r) => r.active)} values={statusIds} onApply={setStatusIds} />
        <ViewMenuButton view={savedView} favourite={favouriteView} onSelect={selectView} onFavourite={favourite} />
        <DateTypeButton value={dateFilter} onApply={setDateFilter} />
        {canCreateTasks && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            + Add Task
          </button>
        )}
      </div>

      {/* View tabs + Draft / Customize / More */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
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
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {showScopeToggle && (
            <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 text-xs">
              <button
                onClick={() => setScopeAll(false)}
                className={`px-2.5 py-1.5 font-medium transition-colors ${!scopeAll ? "bg-brand-accent text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                My Tasks
              </button>
              <button
                onClick={() => setScopeAll(true)}
                className={`px-2.5 py-1.5 font-medium transition-colors ${scopeAll ? "bg-brand-accent text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                All Users
              </button>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs text-gray-500">
            <input type="checkbox" checked={!hideCompleted} onChange={(e) => setHideCompleted(!e.target.checked)} className="accent-cyan-600" />
            Show completed
          </label>
          <button
            onClick={() => setShowDrafts((d) => !d)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${showDrafts ? "bg-cyan-50 font-medium text-brand-accent" : "text-gray-600 hover:bg-gray-50"}`}
          >
            Draft Tasks
          </button>
          <button
            onClick={() => setCustomizing(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <Settings2 size={14} /> Customize
          </button>
          <MoreMenu
            canCreate={canCreateTasks}
            canSettings={canSettings}
            onBulkEdit={() => setBulkMode("edit")}
            onBulkDelete={() => setBulkMode("delete")}
            onBulkExport={exportCsv}
            onBulkImport={() => setImporting("tasks")}
            onImportDrafts={() => setImporting("drafts")}
          />
        </div>
      </div>

      {/* Active filters summary */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>
            Showing {rows.length} {rows.length === 1 ? "line" : "lines"} ·{" "}
            {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} on
          </span>
          <button onClick={clearAll} className="flex items-center gap-1 font-medium text-gray-400 hover:text-rose-600">
            <X size={12} /> Clear all
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {(bulkMode !== null || selected.size > 0) && (
        <div className="animate-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-brand-accent bg-cyan-50/60 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-accent">
            {bulkMode === "delete" ? "Bulk Delete" : "Bulk Edit"} · {selected.size} selected
          </span>
          {bulkMode !== "delete" && (
            <>
              <BulkSelect
                label="Status"
                onPick={(id) => {
                  const row = statusRows.find((r) => r.id === id);
                  if (!row) return;
                  runBulkOn(bulkStatusIds, (ids) =>
                    bulkPatch(ids, row.id.startsWith("base:") ? { status: row.base } : { statusId: row.id })
                  );
                }}
                options={statusRows.filter((r) => r.active && r.base !== "Awaiting Approval").map((r) => ({ value: r.id, label: r.name }))}
              />
              <BulkSelect
                label="Priority"
                onPick={(v) => runBulkOn(bulkEditableIds, (ids) => bulkPatch(ids, { priority: v as TaskPriority }))}
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
              />
              <BulkSelect
                label="Assign to"
                onPick={(v) => runBulkOn(bulkEditableIds, (ids) => bulkPatch(ids, { assigneeId: v }))}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Due
                <DatePicker
                  value=""
                  onChange={(d) => d && runBulkOn(bulkEditableIds, (ids) => bulkPatch(ids, { dueDate: d }))}
                  placeholder="Set due date"
                  className="py-1"
                />
              </label>
              <button
                onClick={() => runBulkOn(bulkEditableIds, (ids) => bulkPatch(ids, { pinned: true }))}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-amber-400 hover:text-amber-600 active:scale-95"
              >
                <Pin size={12} /> Pin
              </button>
            </>
          )}
          <button
            onClick={() => {
              if (bulkEditableIds.length === 0) {
                alert("Select tasks you created to delete them.");
                return;
              }
              if (confirm(`Move ${bulkEditableIds.length} task(s) to the recycle bin?`)) {
                runBulkOn(bulkEditableIds, (ids) => bulkRemove(ids));
              }
            }}
            className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-all duration-150 hover:bg-rose-50 active:scale-95"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={() => {
              setSelected(new Set());
              setBulkMode(null);
            }}
            className="ml-auto text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-gray-800"
          >
            Done
          </button>
          {bulkBusy && <Loader2 size={14} className="animate-spin text-brand-accent" />}
        </div>
      )}

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className={fill ? "!shrink min-h-0 flex-1 overflow-y-auto" : ""}>
        {loading && !loaded ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
            <Loader2 className="mr-2 animate-spin" size={18} /> Loading tasks…
          </div>
        ) : rows.length === 0 ? (
          <EmptyTasks onAdd={canCreateTasks ? () => setCreating(true) : undefined} draft={showDrafts} filtered={activeFilterCount > 0} onClear={clearAll} />
        ) : view === "List" ? (
          <ListView
            rows={rows}
            columns={visibleColumns}
            userName={userName}
            projectName={projectName}
            departmentName={departmentName}
            statusRowOf={statusRowOf}
            onOpen={(t) => setEditing(t)}
            onToggleDone={onToggleDone}
            onStatus={onStatusRow}
            onPriority={onPriorityRow}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            rightsFor={rightsFor}
            me={me}
            showChecks={showChecks}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            allSelected={allSelected}
            stickyHeader={fill}
            sort={sort}
            onSort={(key) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))}
          />
        ) : view === "Kanban" ? (
          <KanbanView
            rows={rows.filter((r) => r.kind === "task")}
            statusRows={statusRows.filter((r) => r.active)}
            statusRowOf={statusRowOf}
            userName={userName}
            onOpen={(t) => setEditing(t)}
            onMove={onStatusRow}
            fill={fill}
          />
        ) : (
          <CalendarView rows={rows} statusRowOf={statusRowOf} onOpen={(t) => setEditing(t)} />
        )}
      </div>

      {creating && <TaskDrawer defaultProjectId={effectiveProjectId ?? null} onClose={() => setCreating(false)} />}
      {importing && (
        <TaskImportDrawer
          title={importing === "drafts" ? "Import Draft Tasks" : "Import Tasks"}
          onClose={() => setImporting(null)}
          onImport={(parsed) => importParsedTasks(parsed, importing === "drafts")}
        />
      )}
      {customizing && <CustomizeDrawer pref={columnPref} onChange={updateColumns} onClose={() => setCustomizing(false)} />}
      {editing && <TaskDrawer existing={editing} onClose={closeDrawer} />}
    </div>
  );
}

function BulkSelect({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <Select
        value=""
        onChange={(v) => v && onPick(v)}
        size="sm"
        className="min-w-[130px]"
        options={[{ value: "", label: "—" }, ...options]}
      />
    </label>
  );
}

/** A small pill on a task showing the signed-in user's relationship to it — assignee or follower. */
function MyRoleBadge({ task, me }: { task: Task; me: string }) {
  if (!me) return null;
  const isAssignee = task.assigneeId === me;
  const isCreator = task.createdBy === me;
  const isFollower = task.followerIds.includes(me);
  // Priority: assignee > creator > follower (the creator auto-follows, so show "Creator" not "Follower").
  const role = isAssignee ? "Assignee" : isCreator ? "Creator" : isFollower ? "Follower" : null;
  if (!role) return null;
  const style =
    role === "Assignee" ? "bg-emerald-50 text-emerald-700" : role === "Creator" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-600";
  return (
    <span
      title={role === "Assignee" ? "Assigned to you" : role === "Creator" ? "You created this task" : "You follow this task"}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${style}`}
    >
      You · {role}
    </span>
  );
}

/** Unread comments/attachments badge — clears when the task drawer opens. */
function UnreadBadge({ task }: { task: Task }) {
  const { comments, attachments, total } = useTaskUnread(task);
  if (total === 0) return null;
  const bits: string[] = [];
  if (comments) bits.push(`${comments} new comment${comments === 1 ? "" : "s"}`);
  if (attachments) bits.push(`${attachments} new attachment${attachments === 1 ? "" : "s"}`);
  return (
    <span title={bits.join(" · ")} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
      {comments > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <MessageCircle size={10} />
          {comments}
        </span>
      )}
      {attachments > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Paperclip size={10} />
          {attachments}
        </span>
      )}
    </span>
  );
}

function EmptyTasks({ onAdd, draft, filtered, onClear }: { onAdd?: () => void; draft: boolean; filtered: boolean; onClear: () => void }) {
  return (
    <div className="animate-fade-in flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-brand-accent">
        <ListIcon size={24} />
      </div>
      <div className="text-base font-semibold text-gray-700">
        {draft ? "No draft tasks." : filtered ? "Nothing matches these filters." : "No tasks here yet."}
      </div>
      <p className="mt-1 max-w-xs text-sm text-gray-400">
        {draft
          ? "Tasks you save as draft will appear here."
          : filtered
            ? "Try a different view or clear the filters."
            : "Create a task and assign it to your team."}
      </p>
      {filtered && !draft ? (
        <button onClick={onClear} className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          Clear filters
        </button>
      ) : (
        !draft &&
        onAdd && (
          <button
            onClick={onAdd}
            className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            + Add Task
          </button>
        )
      )}
    </div>
  );
}

const COLUMN_HEAD: Record<ColumnKey, { label: string; sort?: SortKey; width?: string }> = {
  dueDate: { label: "Due Date", sort: "dueDate" },
  assignee: { label: "Assignee(s)" },
  status: { label: "Status", sort: "status" },
  follower: { label: "Follower" },
  project: { label: "Project" },
  service: { label: "Service" },
  client: { label: "Client" },
  createdDate: { label: "Created Date", sort: "createdDate" },
  closedDate: { label: "Closed Date" },
  priority: { label: "Priority", sort: "priority" },
  progress: { label: "Progress", width: "w-28" },
  department: { label: "Department" },
  owner: { label: "Owner" },
  variance: { label: "Day Variance" },
  code: { label: "Task Code" },
};

function ListView({
  rows,
  columns,
  userName,
  projectName,
  departmentName,
  statusRowOf,
  onOpen,
  onToggleDone,
  onStatus,
  onPriority,
  onDelete,
  onTogglePin,
  rightsFor,
  me,
  showChecks,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  stickyHeader = false,
  sort,
  onSort,
}: {
  rows: TaskRow[];
  columns: ColumnKey[];
  userName: (id: string | null | undefined) => string;
  projectName: (id: string | null) => string;
  departmentName: (id: string | null) => string;
  statusRowOf: (r: TaskRow) => StatusRow;
  onOpen: (t: Task) => void;
  onToggleDone: (r: TaskRow) => void;
  onStatus: (r: TaskRow, row: StatusRow) => void;
  onPriority: (r: TaskRow, p: TaskPriority) => void;
  onDelete: (t: Task) => void;
  onTogglePin: (t: Task) => void;
  rightsFor: (t: Task) => TaskRights;
  me: string;
  showChecks: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  /** Scroll inside the card (both ways) with the column header pinned to its top. */
  stickyHeader?: boolean;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  onSort: (key: SortKey) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set());
  // Each group's own order by due date (the ↓ beside its name), unless a column sort is chosen.
  const [groupDir, setGroupDir] = useState<Partial<Record<GroupKey, 1 | -1>>>({});
  const orderInGroup = (key: GroupKey, list: TaskRow[]) => {
    if (sort) return list;
    const dir = groupDir[key] ?? 1;
    return [...list].sort((a, b) => {
      const pin = Number(b.task.pinned && b.kind === "task") - Number(a.task.pinned && a.kind === "task");
      if (pin) return pin;
      return ((rowDue(a) || "9999").localeCompare(rowDue(b) || "9999")) * dir;
    });
  };
  const groups = GROUPS.map((g) => ({ ...g, rows: orderInGroup(g.key, rows.filter((r) => groupOf(r) === g.key)) })).filter(
    (g) => g.rows.length > 0 || g.key === "today" || g.key === "overdue" || g.key === "upcoming"
  );
  const span = columns.length + (showChecks ? 4 : 3);

  const head = (k: SortKey | undefined, label: string, extra = "") => (
    <th className={`px-3 py-2 font-medium ${extra}`}>
      {k ? (
        <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-gray-800">
          {label}
          {sort?.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className={`animate-fade-in rounded-xl border border-gray-200 bg-white ${stickyHeader ? "max-h-full overflow-auto" : "overflow-x-auto"}`}>
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className={stickyHeader ? "sticky top-0 z-10" : undefined}>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
            {showChecks && (
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} title="Select all" className="h-4 w-4 accent-cyan-600" />
              </th>
            )}
            <th className="w-16 px-2 py-2" />
            {head("title", "Task Name")}
            {columns.map((k) => (
              <th key={k} className={`px-3 py-2 font-medium ${COLUMN_HEAD[k].width ?? ""}`}>
                {COLUMN_HEAD[k].sort ? (
                  <button onClick={() => onSort(COLUMN_HEAD[k].sort!)} className="inline-flex items-center gap-1 hover:text-gray-800">
                    {COLUMN_HEAD[k].label}
                    {sort?.key === COLUMN_HEAD[k].sort && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                ) : (
                  COLUMN_HEAD[k].label
                )}
              </th>
            ))}
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        {groups.map((g) => {
          const isOpen = !collapsed.has(g.key);
          return (
            <tbody key={g.key}>
              <tr className="border-b border-gray-100 bg-white">
                <td colSpan={span} className="px-3 py-2">
                  <div className="flex items-center">
                  <button
                    onClick={() =>
                      setCollapsed((s) => {
                        const n = new Set(s);
                        if (n.has(g.key)) n.delete(g.key);
                        else n.add(g.key);
                        return n;
                      })
                    }
                    className="flex items-center gap-2 text-sm font-semibold text-gray-800"
                  >
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className={g.key === "overdue" && g.rows.length ? "text-rose-600" : ""}>{g.label}</span>
                  </button>
                  <button
                    onClick={() => setGroupDir((d) => ({ ...d, [g.key]: (d[g.key] ?? 1) === 1 ? -1 : 1 }))}
                    disabled={!!sort}
                    title={
                      sort
                        ? "A column sort is on — click that column header again to clear it"
                        : (groupDir[g.key] ?? 1) === 1
                          ? "Earliest due first — click for latest first"
                          : "Latest due first — click for earliest first"
                    }
                    className="ml-1.5 inline-flex rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30"
                  >
                    {(groupDir[g.key] ?? 1) === 1 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                  </button>
                  <span className="ml-1.5 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">{g.rows.length}</span>
                  </div>
                </td>
              </tr>
              {isOpen &&
                g.rows.map((r) => (
                  <ListRow
                    key={r.key}
                    r={r}
                    columns={columns}
                    userName={userName}
                    projectName={projectName}
                    departmentName={departmentName}
                    onOpen={onOpen}
                    onToggleDone={onToggleDone}
                    onStatus={onStatus}
                    onPriority={onPriority}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    rights={rightsFor(r.task)}
                    me={me}
                    showChecks={showChecks}
                    selected={selected}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function ListRow({
  r,
  columns,
  userName,
  projectName,
  departmentName,
  onOpen,
  onToggleDone,
  onStatus,
  onPriority,
  onDelete,
  onTogglePin,
  rights,
  me,
  showChecks,
  selected,
  onToggleSelect,
}: {
  r: TaskRow;
  columns: ColumnKey[];
  userName: (id: string | null | undefined) => string;
  projectName: (id: string | null) => string;
  departmentName: (id: string | null) => string;
  onOpen: (t: Task) => void;
  onToggleDone: (r: TaskRow) => void;
  onStatus: (r: TaskRow, row: StatusRow) => void;
  onPriority: (r: TaskRow, p: TaskPriority) => void;
  onDelete: (t: Task) => void;
  onTogglePin: (t: Task) => void;
  rights: TaskRights;
  me: string;
  showChecks: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const t = r.task;
  const isSub = r.kind === "sub";
  const status = rowStatus(r);
  const done = status === "Completed";
  const due = rowDue(r);
  const group = groupOf(r);
  // A sub-task's own assignee may move its status; otherwise the parent's rules apply.
  const canStatus = isSub ? rights.canSetStatus || (r.kind === "sub" && r.sub.assigneeId === me) : rights.canSetStatus;
  const canPriority = rights.canEditAll;
  const subDone = t.subtasks.filter((s) => s.done).length;

  const cell = (k: ColumnKey) => {
    switch (k) {
      case "dueDate":
        return (
          <td key={k} className={`px-3 py-2.5 whitespace-nowrap ${group === "overdue" ? "font-medium text-rose-600" : group === "upcoming" ? "text-emerald-600" : "text-gray-600"}`}>
            {due ? formatTaskDate(due) : <span className="text-gray-300">—</span>}
          </td>
        );
      case "assignee": {
        const id = rowAssignee(r);
        return (
          <td key={k} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <UserAvatar id={id} name={userName(id)} size={24} />
              <span className="truncate whitespace-nowrap text-gray-600">{userName(id)}</span>
            </div>
          </td>
        );
      }
      case "status":
        return (
          <td key={k} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
            {isSub ? (
              <SubStatusSelect status={status} onChange={(row) => onStatus(r, row)} disabled={!canStatus} />
            ) : (
              <TaskStatusSelect task={t} onChange={(row) => onStatus(r, row)} disabled={!canStatus} />
            )}
          </td>
        );
      case "follower":
        return (
          <td key={k} className="px-3 py-2.5">
            <div className="flex -space-x-1.5">
              {t.followerIds.slice(0, 4).map((f) => (
                <UserAvatar key={f} id={f} name={userName(f)} size={22} />
              ))}
              {t.followerIds.length > 4 && <span className="pl-2 text-[10px] text-gray-400">+{t.followerIds.length - 4}</span>}
              {t.followerIds.length === 0 && <span className="text-xs text-gray-300">—</span>}
            </div>
          </td>
        );
      case "project":
        return (
          <td key={k} className="max-w-[220px] truncate whitespace-nowrap px-3 py-2.5 text-gray-600" title={projectName(t.projectId)}>
            {projectName(t.projectId)}
          </td>
        );
      case "service":
        return (
          <td key={k} className="max-w-[180px] truncate whitespace-nowrap px-3 py-2.5 text-gray-600" title={t.serviceName ?? ""}>
            {t.serviceName || <span className="text-gray-300">—</span>}
          </td>
        );
      case "client":
        return (
          <td key={k} className="max-w-[180px] truncate whitespace-nowrap px-3 py-2.5 text-gray-600" title={t.clientName ?? ""}>
            {t.clientName || <span className="text-gray-300">—</span>}
          </td>
        );
      case "createdDate":
        return (
          <td key={k} className="px-3 py-2.5 whitespace-nowrap text-gray-500" title={formatTaskDateTime(t.createdAt)}>
            {t.createdAt ? formatTaskDate(t.createdAt.slice(0, 10)) : "—"}
          </td>
        );
      case "closedDate":
        return (
          <td key={k} className="px-3 py-2.5 whitespace-nowrap text-gray-500">
            {t.closedAt ? formatTaskDate(t.closedAt.slice(0, 10)) : <span className="text-gray-300">—</span>}
          </td>
        );
      case "priority":
        return (
          <td key={k} className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
            <PrioritySelect priority={rowPriority(r)} onChange={(p) => onPriority(r, p)} disabled={!canPriority} />
          </td>
        );
      case "progress":
        return (
          <td key={k} className="px-3 py-2.5">
            {isSub ? (
              <span className="text-xs text-gray-300">—</span>
            ) : (
              <>
                <ProgressBar value={t.progress} />
                <div className="mt-1 text-[10px] text-gray-400">{t.progress}%</div>
              </>
            )}
          </td>
        );
      case "department":
        return (
          <td key={k} className="px-3 py-2.5">
            {t.departmentId ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{departmentName(t.departmentId)}</span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </td>
        );
      case "owner":
        return (
          <td key={k} className="px-3 py-2.5 text-gray-600">
            {userName(t.createdBy)}
          </td>
        );
      case "variance": {
        const v = varianceOf(t);
        const tone = !v ? "" : v.kind === "delayed" ? "bg-rose-50 text-rose-600" : v.kind === "before" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600";
        return (
          <td key={k} className="px-3 py-2.5">
            {v ? (
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                {VARIANCE_LABEL[v.kind]}
                {v.kind === "delayed" && v.days > 0 ? ` · ${v.days}d` : v.kind === "before" ? ` · ${-v.days}d` : ""}
              </span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </td>
        );
      }
      case "code":
        return (
          <td key={k} className="px-3 py-2.5 text-xs text-gray-400">
            {t.code}
          </td>
        );
    }
  };

  return (
    <tr
      className={`group cursor-pointer border-b border-gray-50 transition-colors duration-150 hover:bg-cyan-50/40 ${
        t.pinned && !isSub ? "bg-amber-50/40" : isSub ? "bg-gray-50/40" : ""
      }`}
      onClick={() => onOpen(t)}
    >
      {showChecks && (
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          {!isSub && (
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => onToggleSelect(t.id)}
              title="Select task"
              className="h-4 w-4 accent-cyan-600"
            />
          )}
        </td>
      )}
      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onToggleDone(r)}
            disabled={!canStatus}
            title={done ? "Mark as not done" : "Mark as done"}
            className="rounded-full p-0.5 text-gray-300 transition-colors hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {done ? <CircleCheck size={17} className="text-emerald-500" /> : <Circle size={17} />}
          </button>
          {!isSub && (
            <button
              onClick={() => onTogglePin(t)}
              disabled={!rights.canEditAll}
              title={!rights.canEditAll ? "Only the task's creator can pin it" : t.pinned ? "Unpin task" : "Pin task to top"}
              className={`rounded-md p-1 transition-all duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 ${
                t.pinned ? "text-amber-500 hover:bg-amber-100" : "text-gray-300 hover:bg-gray-100 hover:text-amber-500"
              }`}
            >
              <Pin size={13} className={t.pinned ? "fill-amber-400" : ""} />
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className={`flex items-center gap-1.5 ${isSub ? "pl-4" : ""}`}>
          {isSub && <CornerDownRight size={13} className="shrink-0 text-gray-400" />}
          <span className={`max-w-[360px] truncate font-medium ${done ? "text-gray-400 line-through" : "text-gray-800"}`} title={rowTitle(r)}>
            {rowTitle(r)}
          </span>
          {isSub && <span className="truncate text-[11px] text-gray-400">in {t.title}</span>}
          {!isSub && <MyRoleBadge task={t} me={me} />}
          {!isSub && <UnreadBadge task={t} />}
          {!isSub && t.subtasks.length > 0 && (
            <span
              title={`${subDone} of ${t.subtasks.length} sub-tasks done${t.subtasksMandatory ? " · mandatory" : ""}`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
            >
              {subDone}/{t.subtasks.length}
            </span>
          )}
          {!isSub && t.recurrenceRule && t.recurrenceRule !== "NONE" && (
            <span
              title={`Repeats ${recurrenceLabel(t.recurrenceRule as RecurrenceRule, t.recurrenceInterval)}${t.recurrenceStopped ? " (stopped)" : ""}`}
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                t.recurrenceStopped ? "bg-gray-100 text-gray-400" : "bg-cyan-50 text-brand-accent"
              }`}
            >
              <Repeat size={9} />
              {recurrenceLabel(t.recurrenceRule as RecurrenceRule, t.recurrenceInterval)}
            </span>
          )}
          {!isSub && t.groupId && (
            <span title="Given to several people — one copy each" className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
              Group
            </span>
          )}
          {!isSub && t.comments.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-gray-400" title={`${t.comments.length} comments`}>
              <MessageCircle size={11} /> {t.comments.length}
            </span>
          )}
        </div>
      </td>
      {columns.map(cell)}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {!isSub && (
          <button
            onClick={() => onDelete(t)}
            disabled={!rights.canDelete}
            title={rights.canDelete ? "Move to recycle bin" : "Only the task's creator can delete it"}
            className="rounded-md p-1.5 text-gray-300 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 size={15} />
          </button>
        )}
      </td>
    </tr>
  );
}

/** Sub-tasks carry a base status only — offered as the built-in rows. */
function SubStatusSelect({ status, onChange, disabled }: { status: TaskStatus; onChange: (row: StatusRow) => void; disabled?: boolean }) {
  const { rowForBase } = useTaskStatuses();
  const bases: TaskStatus[] = ["Pending", "In Progress", "On Hold", "Stuck", "Completed"];
  return (
    <TaskStatusSelectBase
      current={rowForBase(status)}
      options={bases.map((b) => rowForBase(b))}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function TaskStatusSelectBase({
  current,
  options,
  onChange,
  disabled,
}: {
  current: StatusRow;
  options: StatusRow[];
  onChange: (row: StatusRow) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={current.id}
      onChange={(id) => {
        const row = options.find((o) => o.id === id);
        if (row && row.id !== current.id) onChange(row);
      }}
      size="sm"
      disabled={disabled}
      className="min-w-[120px]"
      options={options.map((o) => ({ value: o.id, label: o.name }))}
    />
  );
}

/** How close (px) to a scroll edge a dragged card has to be before the board scrolls for it. */
const KANBAN_EDGE = 70;
const KANBAN_STEP = 18;

/**
 * Kanban board, one column per company status. Every column scrolls on its own inside a board that
 * fits the screen. Grab any empty space and drag to pan sideways; while a card is dragged the board
 * and the column under it scroll by themselves near their edges.
 */
function KanbanView({
  rows,
  statusRows,
  statusRowOf,
  userName,
  onOpen,
  onMove,
  fill = false,
}: {
  rows: TaskRow[];
  statusRows: StatusRow[];
  statusRowOf: (r: TaskRow) => StatusRow;
  userName: (id: string | null | undefined) => string;
  onOpen: (t: Task) => void;
  onMove: (r: TaskRow, row: StatusRow) => void;
  fill?: boolean;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; col: HTMLElement | null; top: number } | null>(null);
  const [panning, setPanning] = useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-kanban-card]")) return;
    const board = boardRef.current;
    if (!board) return;
    const col =
      target.closest<HTMLElement>("[data-kanban-list]") ??
      target.closest<HTMLElement>("[data-kanban-col]")?.querySelector<HTMLElement>("[data-kanban-list]") ??
      null;
    pan.current = { x: e.clientX, y: e.clientY, left: board.scrollLeft, col, top: col?.scrollTop ?? 0 };
    setPanning(true);
    board.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = pan.current;
    const board = boardRef.current;
    if (!p || !board) return;
    board.scrollLeft = p.left - (e.clientX - p.x);
    if (p.col) p.col.scrollTop = p.top - (e.clientY - p.y);
  }
  function endPan(e: React.PointerEvent<HTMLDivElement>) {
    if (!pan.current) return;
    pan.current = null;
    setPanning(false);
    boardRef.current?.releasePointerCapture(e.pointerId);
  }
  function onBoardDragOver(e: React.DragEvent<HTMLDivElement>) {
    const board = boardRef.current;
    if (!board || !dragKey) return;
    const r = board.getBoundingClientRect();
    if (e.clientX < r.left + KANBAN_EDGE) board.scrollLeft -= KANBAN_STEP;
    else if (e.clientX > r.right - KANBAN_EDGE) board.scrollLeft += KANBAN_STEP;
    const list = (e.target as HTMLElement).closest<HTMLElement>("[data-kanban-col]")?.querySelector<HTMLElement>("[data-kanban-list]");
    if (list) {
      const lr = list.getBoundingClientRect();
      if (e.clientY < lr.top + KANBAN_EDGE) list.scrollTop -= KANBAN_STEP;
      else if (e.clientY > lr.bottom - KANBAN_EDGE) list.scrollTop += KANBAN_STEP;
    }
  }

  // Awaiting Approval columns only appear while something sits in them — you can't drop into one.
  const columns = statusRows.filter((s) => s.base !== "Awaiting Approval" || rows.some((r) => statusRowOf(r).id === s.id));

  return (
    <div
      ref={boardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDragOver={onBoardDragOver}
      className={`animate-fade-in flex gap-4 overflow-x-auto pb-2 ${fill ? "h-full" : "h-[70vh]"} ${panning ? "cursor-grabbing select-none" : "cursor-grab"}`}
    >
      {columns.map((status) => {
        const col = rows.filter((r) => statusRowOf(r).id === status.id);
        return (
          <div
            key={status.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const r = rows.find((x) => x.key === dragKey);
              if (r && statusRowOf(r).id !== status.id && status.base !== "Awaiting Approval") onMove(r, status);
              setDragKey(null);
            }}
            data-kanban-col
            className="flex max-h-full min-h-0 w-[270px] shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3"
            style={{ borderTop: `3px solid ${status.color}` }}
          >
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <StatusRowChip row={status} />
              <span className="text-xs font-medium text-gray-400">{col.length}</span>
            </div>
            <div data-kanban-list className="-mr-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {col.map((r) => {
                const t = r.task;
                const overdue = groupOf(r) === "overdue";
                return (
                  <div
                    key={r.key}
                    data-kanban-card
                    draggable
                    onDragStart={() => setDragKey(r.key)}
                    onDragEnd={() => setDragKey(null)}
                    onClick={() => onOpen(t)}
                    className={`cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-shadow duration-150 hover:shadow-md ${dragKey === r.key ? "opacity-50" : ""}`}
                  >
                    <div className="mb-1.5 text-sm font-medium text-gray-800">{t.title}</div>
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <PriorityChip priority={t.priority} />
                      {overdue && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">Overdue</span>}
                      {t.subtasks.length > 0 && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                        </span>
                      )}
                    </div>
                    <ProgressBar value={t.progress} />
                    <div className="mt-2 flex items-center justify-between">
                      <UserAvatar id={t.assigneeId} name={userName(t.assigneeId)} size={22} />
                      <span className="text-[10px] text-gray-400">{formatTaskDate(t.dueDate)}</span>
                    </div>
                  </div>
                );
              })}
              {col.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-300">Drop here</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({
  rows,
  statusRowOf,
  onOpen,
}: {
  rows: TaskRow[];
  statusRowOf: (r: TaskRow) => StatusRow;
  onOpen: (t: Task) => void;
}) {
  const [month, setMonth] = useState(() => new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
          const dayRows = rows.filter((r) => rowDue(r) === toIso(d));
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
                {dayRows.slice(0, 3).map((r) => {
                  const s = statusRowOf(r);
                  return (
                    <button
                      key={r.key}
                      onClick={() => onOpen(r.task)}
                      className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] transition-opacity duration-150 hover:opacity-80"
                      style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                      title={`${rowTitle(r)} · ${s.name}`}
                    >
                      {r.kind === "sub" ? "↳ " : ""}
                      {rowTitle(r)}
                    </button>
                  );
                })}
                {dayRows.length > 3 && <div className="px-1.5 text-[10px] text-gray-400">+{dayRows.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
