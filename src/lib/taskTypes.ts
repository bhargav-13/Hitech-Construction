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
  clientId: string | null;
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
