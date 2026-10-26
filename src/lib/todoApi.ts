// Typed client for the private to-do list (project-service, com.hitech.erp.todo). Every call works on
// the signed-in person's own items only — there is no user parameter anywhere.

import { apiRequest } from "./api";

export type TodoStatus = "TODO" | "DOING" | "DONE";
export type TodoPriority = "HIGH" | "MEDIUM" | "LOW";

export interface TodoDto {
  id: number;
  title: string;
  note: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  /** `yyyy-MM-dd`. */
  dueDate: string | null;
  /** `yyyy-MM-ddTHH:mm`, IST wall clock. */
  remindAt: string | null;
  /** The reminder has already gone to the bell. */
  reminded: boolean;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string | null;
}

export interface TodoInput {
  title: string;
  note?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string | null;
  remindAt?: string | null;
}

export function listTodos() {
  return apiRequest<TodoDto[]>("/api/v1/todos");
}

export function createTodo(body: TodoInput) {
  return apiRequest<TodoDto>("/api/v1/todos", { method: "POST", body });
}

export function updateTodo(id: number, body: TodoInput) {
  return apiRequest<TodoDto>(`/api/v1/todos/${id}`, { method: "PUT", body });
}

export function deleteTodo(id: number) {
  return apiRequest<void>(`/api/v1/todos/${id}`, { method: "DELETE" });
}

/** Puts `ids` into `status`, top to bottom. Returns the whole list afterwards. */
export function reorderTodos(status: TodoStatus, ids: number[]) {
  return apiRequest<TodoDto[]>("/api/v1/todos/reorder", { method: "POST", body: { status, ids } });
}

/** The fields a PUT needs to leave an item as it is, with `patch` laid on top. */
export function toInput(t: TodoDto, patch: Partial<TodoInput> = {}): TodoInput {
  return {
    title: t.title,
    note: t.note,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    remindAt: t.remindAt,
    ...patch,
  };
}
