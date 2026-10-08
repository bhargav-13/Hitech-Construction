// Filtering, views, grouping and columns for the Taskopad task list — the logic half of the toolbar,
// kept apart from the JSX so each rule can be read on its own. Mirrors what app.taskopad.com offers:
// a rule-builder Filter, a multi-select Status filter, saved views ("Default"), a Date Type range,
// and a Customize drawer of columns.

import { todayIST } from "@/lib/datetime";
import { toIso } from "@/lib/taskTypes";
import type { SubTask, Task, TaskPriority, TaskStatus } from "@/lib/taskTypes";

// ---- Rows ---------------------------------------------------------------------------------------

/** A list row is a task, or one of its sub-tasks shown on its own line (as Taskopad does). */
export type TaskRow =
  | { kind: "task"; key: string; task: Task }
  | { kind: "sub"; key: string; task: Task; sub: SubTask };

export function rowDue(r: TaskRow): string {
  return r.kind === "sub" ? r.sub.dueDate || r.task.dueDate : r.task.dueDate;
}

export function rowStatus(r: TaskRow): TaskStatus {
  return r.kind === "sub" ? r.sub.status ?? (r.sub.done ? "Completed" : "Pending") : r.task.status;
}

export function rowPriority(r: TaskRow): TaskPriority {
  return r.kind === "sub" ? r.sub.priority ?? "Low" : r.task.priority;
}

export function rowAssignee(r: TaskRow): string {
  return r.kind === "sub" ? r.sub.assigneeId ?? r.task.assigneeId : r.task.assigneeId;
}

export function rowTitle(r: TaskRow): string {
  return r.kind === "sub" ? r.sub.title : r.task.title;
}

// ---- Day variance --------------------------------------------------------------------------------

export type Variance = "before" | "ontrack" | "delayed";

export const VARIANCE_LABEL: Record<Variance, string> = {
  delayed: "Delayed",
  ontrack: "On Track",
  before: "Before Time",
};

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * How a task did against its due date. Closed: finished before, on, or after the day. Still open:
 * late once the due date has passed, otherwise on track. `days` is how late (negative = early).
 */
export function varianceOf(t: Task): { kind: Variance; days: number } | null {
  if (!t.dueDate) return null;
  const end = t.closedAt ? t.closedAt.slice(0, 10) : todayIST();
  const days = daysBetween(t.dueDate, end);
  if (t.closedAt) return { kind: days < 0 ? "before" : days === 0 ? "ontrack" : "delayed", days };
  return { kind: days > 0 ? "delayed" : "ontrack", days };
}

// ---- Filter rules (the "Filter" rule builder) ----------------------------------------------------

export type RuleField =
  | "task"
  | "description"
  | "client"
  | "service"
  | "assignee"
  | "followers"
  | "owner"
  | "comment"
  | "files"
  | "project"
  | "percentage"
  | "priority"
  | "department"
  | "variance";

export const RULE_FIELDS: { value: RuleField; label: string; kind: "text" | "people" | "pick" | "variance" }[] = [
  { value: "task", label: "Task", kind: "text" },
  { value: "description", label: "Description", kind: "text" },
  { value: "client", label: "Client", kind: "text" },
  { value: "service", label: "Service", kind: "text" },
  { value: "assignee", label: "Assignee", kind: "people" },
  { value: "followers", label: "Followers", kind: "people" },
  { value: "owner", label: "Owner", kind: "people" },
  { value: "comment", label: "Comment", kind: "text" },
  { value: "files", label: "Files", kind: "text" },
  { value: "project", label: "Project", kind: "pick" },
  { value: "percentage", label: "Percentage", kind: "pick" },
  { value: "priority", label: "Priority", kind: "pick" },
  { value: "department", label: "Department", kind: "pick" },
  { value: "variance", label: "Day Variance", kind: "variance" },
];

export const PERCENT_BANDS: { value: string; label: string; test: (p: number) => boolean }[] = [
  { value: "0", label: "Not started (0%)", test: (p) => p === 0 },
  { value: "1-25", label: "1 – 25%", test: (p) => p >= 1 && p <= 25 },
  { value: "26-50", label: "26 – 50%", test: (p) => p >= 26 && p <= 50 },
  { value: "51-75", label: "51 – 75%", test: (p) => p >= 51 && p <= 75 },
  { value: "76-99", label: "76 – 99%", test: (p) => p >= 76 && p <= 99 },
  { value: "100", label: "Done (100%)", test: (p) => p === 100 },
];

export interface FilterRule {
  id: string;
  field: RuleField;
  /** Text rules: the search text. */
  text?: string;
  /** People / pick rules: chosen ids or values. */
  values?: string[];
  /** Day variance rule. */
  variance?: Variance[];
  /** Day variance rule: at least this many days late (end delay). */
  minDelay?: number | null;
}

export function ruleIsEmpty(r: FilterRule): boolean {
  const kind = RULE_FIELDS.find((f) => f.value === r.field)?.kind;
  if (kind === "text") return !r.text?.trim();
  if (kind === "variance") return !(r.variance?.length || (r.minDelay != null && r.minDelay > 0));
  return !r.values?.length;
}

const has = (hay: string | null | undefined, needle: string) => (hay ?? "").toLowerCase().includes(needle);

/** Does this task pass one rule? Sub-task rows are judged by their parent task. */
export function matchesRule(t: Task, r: FilterRule): boolean {
  const q = (r.text ?? "").trim().toLowerCase();
  const vals = r.values ?? [];
  switch (r.field) {
    case "task":
      return has(t.title, q) || has(t.code, q) || t.subtasks.some((s) => has(s.title, q));
    case "description":
      return has(t.description, q);
    case "client":
      return has(t.clientName, q);
    case "service":
      return has(t.serviceName, q);
    case "comment":
      return t.comments.some((c) => has(c.text, q));
    case "files":
      return t.attachments.some((a) => has(a.name, q));
    case "assignee":
      return vals.includes(t.assigneeId) || t.subtasks.some((s) => !!s.assigneeId && vals.includes(s.assigneeId));
    case "followers":
      return t.followerIds.some((f) => vals.includes(f));
    case "owner":
      return !!t.createdBy && vals.includes(t.createdBy);
    case "project":
      return vals.includes(t.projectId ?? "none");
    case "department":
      return vals.includes(t.departmentId ?? "none");
    case "priority":
      return vals.includes(t.priority);
    case "percentage":
      return PERCENT_BANDS.some((b) => vals.includes(b.value) && b.test(t.progress));
    case "variance": {
      const v = varianceOf(t);
      if (!v) return false;
      if (r.variance?.length && !r.variance.includes(v.kind)) return false;
      if (r.minDelay != null && r.minDelay > 0 && v.days < r.minDelay) return false;
      return true;
    }
  }
}

// ---- Date Type -----------------------------------------------------------------------------------

export type DateField = "due" | "created" | "closed";

export const DATE_FIELDS: { value: DateField; label: string }[] = [
  { value: "due", label: "Due Date" },
  { value: "created", label: "Created Date" },
  { value: "closed", label: "Closed Date" },
];

export interface DateTypeFilter {
  fields: DateField[];
  mode: "range" | "on";
  from: string;
  to: string;
}

export const EMPTY_DATE_FILTER: DateTypeFilter = { fields: [], mode: "range", from: "", to: "" };

export function dateFilterActive(d: DateTypeFilter): boolean {
  return d.fields.length > 0 && !!d.from;
}

/** A task passes when any of the chosen dates falls in the range (or on the day). */
export function matchesDate(r: TaskRow, d: DateTypeFilter): boolean {
  if (!dateFilterActive(d)) return true;
  const to = d.mode === "on" ? d.from : d.to || d.from;
  const dates: (string | null)[] = d.fields.map((f) =>
    f === "due" ? rowDue(r) || null : f === "created" ? r.task.createdAt?.slice(0, 10) || null : r.task.closedAt?.slice(0, 10) ?? null
  );
  return dates.some((x) => !!x && x >= d.from && x <= to);
}

// ---- Saved views (the "Default" menu) ------------------------------------------------------------

export type ViewKey =
  | "default"
  | "team"
  | "mine"
  | "created"
  | "dueToday"
  | "dueThisWeek"
  | "dueNextWeek"
  | "overdue"
  | "myTeam"
  | "followers"
  | "tasksSub"
  | "sub"
  | "recurring"
  | "nonRecurring"
  | "unread"
  | "awaiting";

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "team", label: "All Tasks Team" },
  { key: "mine", label: "Just My Tasks" },
  { key: "created", label: "Created By Me" },
  { key: "dueToday", label: "Due Today" },
  { key: "dueThisWeek", label: "Due This Week" },
  { key: "dueNextWeek", label: "Due Next Week" },
  { key: "overdue", label: "Over Due" },
  { key: "myTeam", label: "My Team" },
  { key: "followers", label: "Followers" },
  { key: "tasksSub", label: "Tasks-Sub Tasks" },
  { key: "sub", label: "Sub Tasks" },
  { key: "recurring", label: "Recurring Tasks" },
  { key: "nonRecurring", label: "Non Recurring Tasks" },
  { key: "unread", label: "Unread Tasks" },
  { key: "awaiting", label: "Workflow (Awaiting Approval)" },
];

function weekBounds(offsetWeeks: number): [string, string] {
  const today = new Date(`${todayIST()}T00:00:00`);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toIso(start), toIso(end)];
}

export interface ViewContext {
  me: string;
  team: Set<string>;
  unread: (t: Task) => number;
}

/**
 * Build the rows a view shows. Most views are a test on the task; the sub-task views change which
 * lines exist at all. Default shows every task plus your own sub-tasks on their own lines.
 */
export function rowsForView(tasks: Task[], view: ViewKey, ctx: ViewContext): TaskRow[] {
  const today = todayIST();
  const [wStart, wEnd] = weekBounds(0);
  const [nStart, nEnd] = weekBounds(1);
  const taskRow = (t: Task): TaskRow => ({ kind: "task", key: `t-${t.id}`, task: t });
  const subRows = (t: Task, only?: (s: SubTask) => boolean): TaskRow[] =>
    t.subtasks
      .filter((s) => (only ? only(s) : true))
      .map((s) => ({ kind: "sub" as const, key: `s-${t.id}-${s.id}`, task: t, sub: s }));
  const mySub = (t: Task) => (s: SubTask) => s.assigneeId === ctx.me && t.assigneeId !== ctx.me;

  const test: Partial<Record<ViewKey, (t: Task) => boolean>> = {
    mine: (t) => t.assigneeId === ctx.me,
    created: (t) => t.createdBy === ctx.me,
    dueToday: (t) => t.dueDate === today,
    dueThisWeek: (t) => !!t.dueDate && t.dueDate >= wStart && t.dueDate <= wEnd,
    dueNextWeek: (t) => !!t.dueDate && t.dueDate >= nStart && t.dueDate <= nEnd,
    overdue: (t) => !!t.dueDate && t.dueDate < today && t.status !== "Completed",
    myTeam: (t) => ctx.team.has(t.assigneeId),
    followers: (t) => t.followerIds.includes(ctx.me) && t.assigneeId !== ctx.me && t.createdBy !== ctx.me,
    recurring: (t) => !!t.recurrenceRule && t.recurrenceRule !== "NONE",
    nonRecurring: (t) => !t.recurrenceRule || t.recurrenceRule === "NONE",
    unread: (t) => ctx.unread(t) > 0,
    awaiting: (t) => t.status === "Awaiting Approval",
  };

  switch (view) {
    case "sub":
      return tasks.flatMap((t) => subRows(t));
    case "tasksSub":
      return tasks.flatMap((t) => [taskRow(t), ...subRows(t)]);
    case "default":
    case "team":
      return tasks.flatMap((t) => [taskRow(t), ...subRows(t, mySub(t))]);
    default: {
      const pass = test[view] ?? (() => true);
      return tasks.filter(pass).map(taskRow);
    }
  }
}

// ---- Grouping (Today / Overdue / Upcoming) -------------------------------------------------------

export type GroupKey = "today" | "overdue" | "upcoming" | "nodue" | "completed";

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "nodue", label: "No Due Date" },
  { key: "completed", label: "Completed" },
];

export function groupOf(r: TaskRow): GroupKey {
  if (rowStatus(r) === "Completed") return "completed";
  const due = rowDue(r);
  if (!due) return "nodue";
  const today = todayIST();
  if (due === today) return "today";
  return due < today ? "overdue" : "upcoming";
}

// ---- Columns (Customize) -------------------------------------------------------------------------

export type ColumnKey =
  | "dueDate"
  | "assignee"
  | "status"
  | "follower"
  | "project"
  | "service"
  | "client"
  | "createdDate"
  | "closedDate"
  | "priority"
  | "progress"
  | "department"
  | "owner"
  | "variance"
  | "code";

export const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "dueDate", label: "Due Date" },
  { key: "assignee", label: "Assignee(s)" },
  { key: "status", label: "Status" },
  { key: "follower", label: "Follower" },
  { key: "project", label: "Project" },
  { key: "service", label: "Service" },
  { key: "client", label: "Client" },
  { key: "createdDate", label: "Created Date" },
  { key: "closedDate", label: "Closed Date" },
  { key: "priority", label: "Priority" },
  { key: "progress", label: "Progress" },
  { key: "department", label: "Department" },
  { key: "owner", label: "Owner" },
  { key: "variance", label: "Day Variance" },
  { key: "code", label: "Task Code" },
];

export interface ColumnPref {
  order: ColumnKey[];
  on: ColumnKey[];
}

export const DEFAULT_COLUMN_PREF: ColumnPref = {
  order: ALL_COLUMNS.map((c) => c.key),
  on: ["dueDate", "assignee", "status", "project", "priority", "progress", "code"],
};

/** Reads a saved preference, dropping unknown keys and appending any column added since. */
export function normaliseColumnPref(raw: unknown): ColumnPref {
  const known = new Set(ALL_COLUMNS.map((c) => c.key));
  if (!raw || typeof raw !== "object") return DEFAULT_COLUMN_PREF;
  const r = raw as Partial<ColumnPref>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is ColumnKey => known.has(k as ColumnKey));
  for (const c of ALL_COLUMNS) if (!order.includes(c.key)) order.push(c.key);
  const on = (Array.isArray(r.on) ? r.on : DEFAULT_COLUMN_PREF.on).filter((k): k is ColumnKey => known.has(k as ColumnKey));
  return { order, on };
}
