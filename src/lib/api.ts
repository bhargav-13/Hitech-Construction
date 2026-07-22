// Thin client for the real Spring Boot backend (hitech-backend, user-management-service).
// Base URL points at the local backend by default — override with NEXT_PUBLIC_API_BASE_URL.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const ACCESS_TOKEN_KEY = "hitech_access_token";
const REFRESH_TOKEN_KEY = "hitech_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ---- DTO shapes (mirror api-contracts/user-management.yaml) ----
export interface RoleSummary {
  id: number | null;
  name: string;
}

export interface PermissionResponse {
  id: number;
  moduleCode: string;
  moduleName: string;
  action: "VIEW" | "CREATE" | "EDIT" | "DELETE" | "APPROVE";
  code: string;
}

export interface ModuleResponse {
  id: number;
  code: string;
  name: string;
  permissions: PermissionResponse[];
}

export interface RoleResponse {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionResponse[];
}

export interface RoleRequest {
  name: string;
  description?: string;
  permissionIds?: number[];
}

export interface UserResponse {
  id: number;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  role: RoleSummary;
  departmentId: number | null;
  departmentName: string | null;
}

export interface UserPageResponse {
  content: UserResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface UserCreateRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  roleId: number;
  departmentId?: number | null;
}

export interface UserUpdateRequest {
  fullName?: string;
  phoneNumber?: string;
  roleId?: number;
  departmentId?: number | null;
  isActive?: boolean;
}

export interface CurrentUserResponse {
  id: number;
  email: string;
  fullName: string;
  role: RoleSummary;
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: CurrentUserResponse;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Access tokens are short-lived (30 min). A single in-flight refresh is shared across
// concurrent 401s so we don't fire multiple /auth/refresh calls at once.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function redirectToLogin() {
  clearTokens();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  return request<T>(path, options);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const send = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const token = getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await send();

  // Transparently refresh an expired access token once, then retry the original request.
  if (res.status === 401 && auth && getRefreshToken()) {
    const refresh = (refreshInFlight ??= refreshTokens());
    const ok = await refresh.finally(() => {
      refreshInFlight = null;
    });
    if (ok) {
      res = await send();
    } else {
      redirectToLogin();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = data?.errors?.[0]?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

// ---- Auth ----
export function login(email: string, password: string) {
  return request<AuthResponse>("/api/v1/auth/login", { method: "POST", body: { email, password }, auth: false });
}

export function refreshAccessToken(refreshToken: string) {
  return request<AuthResponse>("/api/v1/auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
}

export function logoutApi(refreshToken: string) {
  return request<void>("/api/v1/auth/logout", { method: "POST", body: { refreshToken }, auth: false });
}

export function getCurrentUser() {
  return request<CurrentUserResponse>("/api/v1/auth/me");
}

// ---- Roles ----
export function getRoles() {
  return request<RoleResponse[]>("/api/v1/roles");
}

export function createRole(body: RoleRequest) {
  return request<RoleResponse>("/api/v1/roles", { method: "POST", body });
}

export function updateRole(id: number, body: RoleRequest) {
  return request<RoleResponse>(`/api/v1/roles/${id}`, { method: "PUT", body });
}

export function deleteRole(id: number) {
  return request<void>(`/api/v1/roles/${id}`, { method: "DELETE" });
}

// ---- Modules & permissions ----
export function getModules() {
  return request<ModuleResponse[]>("/api/v1/modules");
}

export function getPermissions() {
  return request<PermissionResponse[]>("/api/v1/permissions");
}

// ---- Team directory (minimal, any authenticated user) ----
export interface TeamMemberResponse {
  id: number;
  fullName: string;
  roleName: string;
  active: boolean;
  departmentId: number | null;
  departmentName: string | null;
}

export function getTeam() {
  return request<TeamMemberResponse[]>("/api/v1/team");
}

// ---- Users (admin User Management, gated by USER_MANAGEMENT:VIEW) ----
export function getUsers(page = 0, size = 20) {
  return request<UserPageResponse>(`/api/v1/users?page=${page}&size=${size}`);
}

export function createUser(body: UserCreateRequest) {
  return request<UserResponse>("/api/v1/users", { method: "POST", body });
}

export function updateUser(id: number, body: UserUpdateRequest) {
  return request<UserResponse>(`/api/v1/users/${id}`, { method: "PUT", body });
}

export function deactivateUser(id: number) {
  return request<void>(`/api/v1/users/${id}`, { method: "DELETE" });
}

// Hard delete — permanently removes the user account (backend guards against self/system accounts).
export function deleteUserPermanently(id: number) {
  return request<void>(`/api/v1/users/${id}/permanent`, { method: "DELETE" });
}

export function updateUserPassword(id: number, newPassword: string) {
  return request<void>(`/api/v1/users/${id}/password`, { method: "PUT", body: { newPassword } });
}

// ---- Projects (project-service, mirrors api-contracts/project.yaml) ----
export type ProjectStatus = "NOT_STARTED" | "ONGOING" | "ONHOLD" | "COMPLETED";
export type ProjectHealth = "HEALTHY" | "AT_RISK";

export interface ProjectResponse {
  id: number;
  projectCode: string | null;
  name: string;
  category: string | null;
  stage: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  customerName: string | null;
  keyPersonnel: string | null;
  address: string | null;
  city: string | null;
  companyBranch: string | null;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  attendanceRadius: number;
  projectValue: number;
  orientation: string | null;
  dimension: string | null;
  scopeOfWork: string | null;
  inAmount: number;
  outAmount: number;
  todoCount: number;
}

export interface ProjectPageResponse {
  content: ProjectResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ProjectCreateRequest {
  name: string;
  address?: string;
  city?: string;
}

export type ProjectUpdateRequest = Partial<Omit<ProjectResponse, "id">>;

export function getProjects(params: { page?: number; size?: number; status?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 0));
  qs.set("size", String(params.size ?? 100));
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  return request<ProjectPageResponse>(`/api/v1/projects?${qs.toString()}`);
}

export function getProjectById(id: number) {
  return request<ProjectResponse>(`/api/v1/projects/${id}`);
}

export function createProject(body: ProjectCreateRequest) {
  return request<ProjectResponse>("/api/v1/projects", { method: "POST", body });
}

export function updateProject(id: number, body: ProjectUpdateRequest) {
  return request<ProjectResponse>(`/api/v1/projects/${id}`, { method: "PUT", body });
}

export function deleteProject(id: number) {
  return request<void>(`/api/v1/projects/${id}`, { method: "DELETE" });
}

// ---- Project locations (hierarchical location structure) ----
export interface ProjectLocationResponse {
  id: number;
  projectId: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
}

export function getProjectLocations(projectId: number) {
  return request<ProjectLocationResponse[]>(`/api/v1/projects/${projectId}/locations`);
}

export function createProjectLocation(projectId: number, body: { name: string; parentId?: number }) {
  return request<ProjectLocationResponse>(`/api/v1/projects/${projectId}/locations`, { method: "POST", body });
}

export function updateProjectLocation(projectId: number, locationId: number, body: { name: string }) {
  return request<ProjectLocationResponse>(`/api/v1/projects/${projectId}/locations/${locationId}`, { method: "PUT", body });
}

export function deleteProjectLocation(projectId: number, locationId: number) {
  return request<void>(`/api/v1/projects/${projectId}/locations/${locationId}`, { method: "DELETE" });
}
