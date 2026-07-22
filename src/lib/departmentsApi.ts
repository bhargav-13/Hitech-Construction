import { apiRequest } from "./api";

/**
 * Departments are the org grouping a user belongs to (Civil, Electrical, Accounts…), which is
 * distinct from their ROLE — a role controls permissions, a department says which team they're on.
 */
export interface Department {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  headUserId: number | null;
  isActive: boolean;
  memberCount: number;
}

export interface DepartmentUpsertRequest {
  name?: string;
  code?: string | null;
  description?: string | null;
  headUserId?: number | null;
  isActive?: boolean;
}

export function getDepartments() {
  return apiRequest<Department[]>("/api/v1/departments");
}

export function createDepartment(body: DepartmentUpsertRequest) {
  return apiRequest<Department>("/api/v1/departments", { method: "POST", body });
}

export function updateDepartment(id: number, body: DepartmentUpsertRequest) {
  return apiRequest<Department>(`/api/v1/departments/${id}`, { method: "PUT", body });
}

export function deleteDepartment(id: number) {
  return apiRequest<void>(`/api/v1/departments/${id}`, { method: "DELETE" });
}
