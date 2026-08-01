// Typed client for the Taskopad task API (project-service, com.hitech.erp.task).
// Shares the auth/refresh plumbing in lib/api.ts via the exported `apiRequest`.
import { apiRequest } from "./api";

export type TaskStatusApi = "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "STUCK" | "COMPLETED" | "AWAITING_APPROVAL";
export type TaskPriorityApi = "LOW" | "MEDIUM" | "HIGH";

export interface SubtaskDto {
  id: number | null;
  title: string;
  done: boolean;
  assigneeId: number | null;
  sortOrder: number;
}

export interface CommentDto {
  id: number;
  authorId: number;
  text: string;
  at: string; // ISO datetime
}

export interface AttachmentDto {
  id: number;
  uploadedBy: number;
  name: string;
  sizeLabel: string | null;
  contentType: string | null;
  dataUrl: string | null;
  at: string;
}

export interface ActivityDto {
  id: number;
  actorId: number | null;
  text: string;
  at: string;
}

export interface TaskResponse {
  id: number;
  code: string;
  title: string;
  description: string | null;
  projectId: number | null;
  assigneeId: number;
  createdBy: number | null;
  clientName: string | null;
  status: TaskStatusApi;
  priority: TaskPriorityApi;
  progress: number;
  dueDate: string | null;
  draft: boolean;
  pinned: boolean;
  reminderAt: string | null;
  recurrenceRule: string;
  recurrenceInterval: number;
  recurrenceUntil: string | null;
  seriesId: number | null;
  departmentId: number | null;
  followerIds: number[];
  subtasks: SubtaskDto[];
  comments: CommentDto[];
  attachments: AttachmentDto[];
  activity: ActivityDto[];
  createdAt: string | null;
  updatedAt: string | null;
  completionRequestedBy?: number | null;
  completionNote?: string | null;
}

export interface SubtaskInput {
  id?: number | null;
  title: string;
  done: boolean;
  assigneeId?: number | null;
}

export interface TaskUpsertRequest {
  title: string;
  description?: string | null;
  projectId?: number | null;
  assigneeId: number;
  clientName?: string | null;
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  progress?: number;
  dueDate?: string | null;
  draft?: boolean;
  pinned?: boolean;
  reminderAt?: string | null;
  recurrenceRule?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string | null;
  departmentId?: number | null;
  followerIds?: number[];
  subtasks?: SubtaskInput[];
}

export interface TaskPatchRequest {
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  progress?: number;
  pinned?: boolean;
  reminderAt?: string | null;
}

export type TaskScope = "MINE" | "ALL";

export function listTasks(opts?: { projectId?: number; scope?: TaskScope }) {
  const params = new URLSearchParams();
  if (opts?.projectId != null) params.set("projectId", String(opts.projectId));
  if (opts?.scope) params.set("scope", opts.scope);
  const qs = params.toString();
  return apiRequest<TaskResponse[]>(`/api/v1/tasks${qs ? "?" + qs : ""}`);
}

export function getTask(id: number) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}`);
}

export function createTask(body: TaskUpsertRequest) {
  return apiRequest<TaskResponse>("/api/v1/tasks", { method: "POST", body });
}

export function updateTask(id: number, body: TaskUpsertRequest) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}`, { method: "PUT", body });
}

export function patchTask(id: number, body: TaskPatchRequest) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}`, { method: "PATCH", body });
}

export function deleteTask(id: number) {
  return apiRequest<void>(`/api/v1/tasks/${id}`, { method: "DELETE" });
}

// ---- Completion approval workflow ----
export function getPendingApprovals() {
  return apiRequest<TaskResponse[]>("/api/v1/tasks/approvals");
}

export function approveTaskCompletion(id: number) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/approve`, { method: "POST" });
}

export function rejectTaskCompletion(id: number, note?: string) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/reject`, {
    method: "POST",
    body: note ? { note } : undefined,
  });
}

// ---- Bulk actions on the task list ----
export interface BulkPatchRequest {
  taskIds: number[];
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  pinned?: boolean;
  assigneeId?: number;
}

export function bulkPatchTasks(body: BulkPatchRequest) {
  return apiRequest<TaskResponse[]>("/api/v1/tasks/bulk", { method: "PATCH", body });
}

export function bulkDeleteTasks(taskIds: number[]) {
  return apiRequest<void>("/api/v1/tasks/bulk-delete", { method: "POST", body: { taskIds } });
}

export function addComment(id: number, text: string) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/comments`, { method: "POST", body: { text } });
}

export function addAttachment(
  id: number,
  body: { name: string; sizeLabel?: string; contentType?: string; dataUrl?: string }
) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/attachments`, { method: "POST", body });
}

export function toggleSubtask(id: number, subtaskId: number) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/subtasks/${subtaskId}/toggle`, { method: "POST" });
}

// ---- Project members (access control) ----
export function getProjectMembers(projectId: number) {
  return apiRequest<number[]>(`/api/v1/projects/${projectId}/members`);
}

export function setProjectMembers(projectId: number, userIds: number[]) {
  return apiRequest<number[]>(`/api/v1/projects/${projectId}/members`, { method: "PUT", body: { userIds } });
}
