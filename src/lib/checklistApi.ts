// Typed client for Taskopad's recurring checklist (project-service, com.hitech.erp.checklist).
// Shares the auth/refresh plumbing in lib/api.ts via the exported `apiRequest`.
import { apiRequest } from "./api";

export type ChecklistPeriodApi = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

/** The caller's place in the role ladder. `teamUserIds` = everyone below them (empty for Super Admin, who may pick anyone). */
export interface ChecklistScopeDto {
  meId: number;
  superAdmin: boolean;
  teamUserIds: number[];
}

export interface RoutineDto {
  id: number;
  period: ChecklistPeriodApi;
  name: string;
  assigneeId: number;
  note: string | null;
  createdBy: number | null;
  /** Ticked box keys — "2026-09-16", "2026-09-W3", "2026-09", "FY2026-Q2", "FY2026-H1", "FY2026". */
  ticks: string[];
  /** The caller sits above the assignee (or is Super Admin): may edit and delete. */
  canManage: boolean;
  /** The caller is the assignee or sits above them: may tick. */
  canTick: boolean;
  /** KAN-124: the scheduled pop-up, or null. */
  popup: PopupSettingsDto | null;
}

/** KAN-124: when a routine pops up on people's screens. Times are IST. */
export interface PopupSettingsDto {
  enabled: boolean;
  repeat: "ONCE" | "DAILY" | "WEEKLY" | null;
  /** "HH:mm" */
  time: string | null;
  /** ONCE: yyyy-MM-dd */
  date: string | null;
  /** WEEKLY: 0 = Sunday … 6 = Saturday */
  weekday: number | null;
  /** Can't be closed until marked done. */
  lock: boolean;
  /** Empty = the routine's assignee. */
  userIds: number[];
}

export interface DuePopupDto {
  routineId: number;
  name: string;
  note: string | null;
  period: ChecklistPeriodApi;
  occurrenceKey: string;
  dueAt: string;
  lock: boolean;
}

export interface PopupLogRowDto {
  occurrenceKey: string;
  userId: number;
  shownAt: string | null;
  doneAt: string | null;
}

export function getDuePopups() {
  return apiRequest<DuePopupDto[]>("/api/v1/checklist/popups/due");
}

export function completePopup(routineId: number, occurrenceKey: string) {
  return apiRequest<void>(`/api/v1/checklist/popups/${routineId}/${occurrenceKey}/done`, { method: "POST" });
}

export function getPopupLog(routineId: number) {
  return apiRequest<PopupLogRowDto[]>(`/api/v1/checklist/routines/${routineId}/popup-log`);
}

export interface RoutineRequest {
  period: ChecklistPeriodApi;
  name: string;
  assigneeId: number;
  note: string | null;
  /** Super Admin only; undefined leaves it unchanged. */
  popup?: PopupSettingsDto;
}

export function getChecklistScope() {
  return apiRequest<ChecklistScopeDto>("/api/v1/checklist/scope");
}

export function listRoutines() {
  return apiRequest<RoutineDto[]>("/api/v1/checklist/routines");
}

export function createRoutine(body: RoutineRequest) {
  return apiRequest<RoutineDto>("/api/v1/checklist/routines", { method: "POST", body });
}

export function updateRoutine(id: number, body: RoutineRequest) {
  return apiRequest<RoutineDto>(`/api/v1/checklist/routines/${id}`, { method: "PUT", body });
}

export function deleteRoutine(id: number) {
  return apiRequest<void>(`/api/v1/checklist/routines/${id}`, { method: "DELETE" });
}

export function toggleRoutineTick(id: number, periodKey: string) {
  return apiRequest<RoutineDto>(
    `/api/v1/checklist/routines/${id}/ticks/${encodeURIComponent(periodKey)}/toggle`,
    { method: "POST" }
  );
}
