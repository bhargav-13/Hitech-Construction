// TaskOPad-style task model. Richer than the legacy `TodoTask` in types.ts (which is left
// untouched for the existing project To-Do screens) — this one backs the Taskopad module.

export type TaskStatus = "Pending" | "In Progress" | "On Hold" | "Stuck" | "Completed";
export type TaskPriority = "Low" | "Medium" | "High";

export const TASK_STATUSES: TaskStatus[] = ["Pending", "In Progress", "On Hold", "Stuck", "Completed"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

/** Status chip colours — mirrors TaskOPad's semantics, restyled to our palette. */
export const STATUS_STYLE: Record<TaskStatus, { dot: string; chip: string }> = {
  Pending: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  "In Progress": { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700" },
  "On Hold": { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
  Stuck: { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700" },
  Completed: { dot: "bg-green-500", chip: "bg-green-50 text-green-700" },
};

export const PRIORITY_STYLE: Record<TaskPriority, { text: string; chip: string; hex: string }> = {
  Low: { text: "text-green-600", chip: "bg-green-50 text-green-700", hex: "#0ca30c" },
  Medium: { text: "text-amber-600", chip: "bg-amber-50 text-amber-700", hex: "#eda100" },
  High: { text: "text-rose-600", chip: "bg-rose-50 text-rose-700", hex: "#d03b3b" },
};

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: string;
}

export interface TaskComment {
  id: string;
  userId: string;
  text: string;
  at: string; // ISO
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: string;
  at: string;
}

export interface TaskActivity {
  id: string;
  text: string;
  at: string;
  userId: string;
}

export interface Task {
  id: string;
  code: string;
  title: string;
  description: string;
  projectId: string | null;
  assigneeId: string;
  followerIds: string[];
  clientName: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  dueDate: string; // ISO yyyy-mm-dd
  createdAt: string;
  isDraft: boolean;
  subtasks: SubTask[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  activity: TaskActivity[];
}

// ---- Backend enum <-> UI label conversions (project-service com.hitech.erp.task) ----
export type TaskStatusApi = "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "STUCK" | "COMPLETED";
export type TaskPriorityApi = "LOW" | "MEDIUM" | "HIGH";

const STATUS_TO_API: Record<TaskStatus, TaskStatusApi> = {
  Pending: "PENDING",
  "In Progress": "IN_PROGRESS",
  "On Hold": "ON_HOLD",
  Stuck: "STUCK",
  Completed: "COMPLETED",
};
const STATUS_FROM_API: Record<TaskStatusApi, TaskStatus> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  STUCK: "Stuck",
  COMPLETED: "Completed",
};
const PRIORITY_TO_API: Record<TaskPriority, TaskPriorityApi> = { Low: "LOW", Medium: "MEDIUM", High: "HIGH" };
const PRIORITY_FROM_API: Record<TaskPriorityApi, TaskPriority> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export const statusToApi = (s: TaskStatus): TaskStatusApi => STATUS_TO_API[s];
export const statusFromApi = (s: TaskStatusApi): TaskStatus => STATUS_FROM_API[s];
export const priorityToApi = (p: TaskPriority): TaskPriorityApi => PRIORITY_TO_API[p];
export const priorityFromApi = (p: TaskPriorityApi): TaskPriority => PRIORITY_FROM_API[p];

/** yyyy-MM-dd out of an ISO datetime (backend timestamps) or a plain date string. */
function toDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.length > 10 ? iso.slice(0, 10) : iso;
}

// Deferred import type only — the concrete shape lives in tasksApi.ts.
type ApiTask = import("./tasksApi").TaskResponse;

/** Map a backend TaskResponse into the UI Task shape (string ids, label enums). */
export function taskFromApi(t: ApiTask): Task {
  return {
    id: String(t.id),
    code: t.code,
    title: t.title,
    description: t.description ?? "",
    projectId: t.projectId != null ? String(t.projectId) : null,
    assigneeId: String(t.assigneeId),
    followerIds: (t.followerIds ?? []).map(String),
    clientName: t.clientName ?? null,
    status: statusFromApi(t.status),
    priority: priorityFromApi(t.priority),
    progress: t.progress,
    dueDate: toDateOnly(t.dueDate),
    createdAt: toDateOnly(t.createdAt),
    isDraft: t.draft,
    subtasks: (t.subtasks ?? []).map((s) => ({
      id: String(s.id),
      title: s.title,
      done: s.done,
      assigneeId: s.assigneeId != null ? String(s.assigneeId) : undefined,
    })),
    comments: (t.comments ?? []).map((c) => ({
      id: String(c.id),
      userId: String(c.authorId),
      text: c.text,
      at: c.at,
    })),
    attachments: (t.attachments ?? []).map((a) => ({
      id: String(a.id),
      name: a.name,
      size: a.sizeLabel ?? "",
      at: a.at,
    })),
    activity: (t.activity ?? []).map((a) => ({
      id: String(a.id),
      text: a.text,
      at: a.at,
      userId: a.actorId != null ? String(a.actorId) : "",
    })),
  };
}

export function isOverdue(task: Task, today = new Date()): boolean {
  if (task.status === "Completed") return false;
  return new Date(task.dueDate) < startOfDay(today);
}

export function isDueToday(task: Task, today = new Date()): boolean {
  return sameDay(new Date(task.dueDate), today);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTaskDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
