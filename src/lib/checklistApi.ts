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
}

export interface RoutineRequest {
  period: ChecklistPeriodApi;
  name: string;
  assigneeId: number;
  note: string | null;
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
