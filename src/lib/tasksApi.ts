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
  status?: string | null;
  priority?: string | null;
  dueDate?: string | null;
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
  /** Null on list responses (contents are left out to keep lists light); filled on getTask(). */
  dataUrl: string | null;
  at: string;
  /** Whether the file has contents — when dataUrl is null, fetch the task to get them. */
  hasData?: boolean;
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
  statusId?: number | null;
  closedAt?: string | null;
  groupId?: number | null;
  serviceName?: string | null;
  subtasksMandatory?: boolean;
  recurrenceDays?: string | null;
  recurrenceExcludeDays?: string | null;
  recurrenceStopped?: boolean;
  reminderRecipients?: string | null;
  reminderFrequency?: string | null;
  reminderDays?: string | null;
}

export interface SubtaskInput {
  id?: number | null;
  title: string;
  done: boolean;
  assigneeId?: number | null;
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  dueDate?: string | null;
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
  /** Create only: several people → one linked copy each. */
  assigneeIds?: number[];
  statusId?: number | null;
  serviceName?: string | null;
  subtasksMandatory?: boolean;
  recurrenceDays?: string | null;
  recurrenceExcludeDays?: string | null;
  reminderRecipients?: string;
  reminderFrequency?: string;
  reminderDays?: string | null;
}

export interface TaskPatchRequest {
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  progress?: number;
  pinned?: boolean;
  reminderAt?: string | null;
  statusId?: number;
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
  statusId?: number;
  dueDate?: string;
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

// ---- Taskopad parity ----

export interface SubtaskPatchRequest {
  title?: string;
  status?: TaskStatusApi;
  priority?: TaskPriorityApi;
  dueDate?: string | null;
  /** 0 clears the assignee. */
  assigneeId?: number;
}

export function patchSubtask(taskId: number, subtaskId: number, body: SubtaskPatchRequest) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${taskId}/subtasks/${subtaskId}`, { method: "PATCH", body });
}

export function stopRecurrence(id: number) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/recurrence/stop`, { method: "POST" });
}

export function resumeRecurrence(id: number) {
  return apiRequest<TaskResponse>(`/api/v1/tasks/${id}/recurrence/resume`, { method: "POST" });
}

export interface DeletedTaskDto {
  id: number;
  code: string;
  title: string;
  projectId: number | null;
  assigneeId: number | null;
  createdBy: number | null;
  status: TaskStatusApi;
  dueDate: string | null;
  deletedAt: string | null;
  deletedBy: number | null;
}

export function getRecycleBin() {
  return apiRequest<DeletedTaskDto[]>("/api/v1/tasks/recycle-bin");
}

export function restoreTasks(ids: number[]) {
  return apiRequest<void>("/api/v1/tasks/recycle-bin/restore", { method: "POST", body: { ids } });
}

export function purgeTasks(ids: number[]) {
  return apiRequest<void>("/api/v1/tasks/recycle-bin/purge", { method: "POST", body: { ids } });
}

export interface TaskDocumentDto {
  fileId: number;
  name: string;
  sizeBytes: number;
  contentType: string | null;
  uploadedBy: number | null;
  createdAt: string | null;
  taskId: number;
  taskCode: string;
  taskTitle: string;
  projectId: number | null;
  hasThumb: boolean;
}

export function getTaskDocuments() {
  return apiRequest<TaskDocumentDto[]>("/api/v1/tasks/documents");
}

export interface TaskStatusDto {
  id: number;
  name: string;
  color: string;
  baseStatus: TaskStatusApi;
  sortOrder: number;
  system: boolean;
  active: boolean;
}

export interface TaskStatusInput {
  name: string;
  color: string;
  baseStatus: TaskStatusApi;
  sortOrder?: number;
  active?: boolean;
}

export function getTaskStatuses() {
  return apiRequest<TaskStatusDto[]>("/api/v1/task-statuses");
}

export function createTaskStatus(body: TaskStatusInput) {
  return apiRequest<TaskStatusDto>("/api/v1/task-statuses", { method: "POST", body });
}

export function updateTaskStatus(id: number, body: TaskStatusInput) {
  return apiRequest<TaskStatusDto>(`/api/v1/task-statuses/${id}`, { method: "PUT", body });
}

export function deleteTaskStatus(id: number) {
  return apiRequest<void>(`/api/v1/task-statuses/${id}`, { method: "DELETE" });
}

export interface QuickReplyDto {
  id: number;
  title: string;
  message: string;
}

export function getQuickReplies() {
  return apiRequest<QuickReplyDto[]>("/api/v1/task-quick-replies");
}

export function saveQuickReply(id: number | null, body: { title: string; message: string }) {
  return id == null
    ? apiRequest<QuickReplyDto>("/api/v1/task-quick-replies", { method: "POST", body })
    : apiRequest<QuickReplyDto>(`/api/v1/task-quick-replies/${id}`, { method: "PUT", body });
}

export function deleteQuickReply(id: number) {
  return apiRequest<void>(`/api/v1/task-quick-replies/${id}`, { method: "DELETE" });
}

// ---- Notifications (server-side, all modules) ----

export interface NotificationDto {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  taskId: number | null;
  actorId: number | null;
  read: boolean;
  createdAt: string;
}

export function getNotifications(limit = 40) {
  return apiRequest<NotificationDto[]>(`/api/v1/notifications?limit=${limit}`);
}

export function getUnreadNotificationCount() {
  return apiRequest<{ count: number }>("/api/v1/notifications/unread-count");
}

export function markNotificationRead(id: number) {
  return apiRequest<void>(`/api/v1/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiRequest<void>("/api/v1/notifications/read-all", { method: "POST" });
}
