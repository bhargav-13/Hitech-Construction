// Typed client for the Taskopad task API (project-service, com.hitech.erp.task).
// Shares the auth/refresh plumbing in lib/api.ts via the exported `apiRequest`.
import { apiRequest } from "./api";

export type TaskStatusApi = "PENDING" | "IN_PROGRESS" | "ON_HOLD" | "STUCK" | "COMPLETED";
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
  followerIds: number[];
  subtasks: SubtaskDto[];
  comments: CommentDto[];
  attachments: AttachmentDto[];
  activity: ActivityDto[];
  createdAt: string | null;
  updatedAt: string | null;
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
  followerIds?: number[];
  subtasks?: SubtaskInput[];
}

export interface TaskPatchRequest {
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  progress?: number;
}

export function listTasks(projectId?: number) {
  const qs = projectId != null ? `?projectId=${projectId}` : "";
  return apiRequest<TaskResponse[]>(`/api/v1/tasks${qs}`);
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
