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
  /** Parent role in the org ladder (this role reports to it). null = top of the hierarchy. */
  reportsToRoleId: number | null;
  permissions: PermissionResponse[];
}

export interface RoleRequest {
  name: string;
  description?: string;
  reportsToRoleId?: number | null;
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
  staffType: "OFFICE" | "SITE" | null;
  onPayroll: boolean;
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
  staffType?: "OFFICE" | "SITE" | null;
  onPayroll?: boolean;
}

export interface UserUpdateRequest {
  fullName?: string;
  phoneNumber?: string;
  roleId?: number;
  departmentId?: number | null;
  staffType?: "OFFICE" | "SITE" | null;
  onPayroll?: boolean;
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

// ---- Payroll: setup policies (Shifts, Holiday Policy, Leave Policy) + member profiles ----
// Mirrors api-contracts-less payroll-service (hand-written DTOs, no OpenAPI codegen — see api/v1/payroll).

export interface ShiftResponse {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  weeklyOffs: number[];
  graceMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  overtimeEnabled: boolean;
}
export type ShiftRequest = Omit<ShiftResponse, "id">;

export interface HolidayResponse {
  date: string;
  name: string;
  type: "PUBLIC" | "OPTIONAL";
}
export interface HolidayPolicyResponse {
  id: number;
  name: string;
  year: number;
  holidays: HolidayResponse[];
}
export type HolidayPolicyRequest = Omit<HolidayPolicyResponse, "id">;

export interface LeaveTypeResponse {
  name: string;
  annualCount: number;
  accrual: "ALL_AT_ONCE" | "MONTHLY";
  paid: boolean;
}
export interface LeavePolicyResponse {
  id: number;
  name: string;
  cycle: "YEARLY" | "MONTHLY";
  types: LeaveTypeResponse[];
}
export type LeavePolicyRequest = Omit<LeavePolicyResponse, "id">;

export interface PayrollSalaryStructure {
  monthlyCtc: number;
  basic: number;
  hra: number;
  otherAllowances: number;
  workType: "DAILY" | "HOURLY" | "PIECE" | null;
  workRate: number;
  pf: boolean;
  esic: boolean;
  pt: boolean;
}
export interface PayrollProfileResponse {
  userId: number;
  category: "REGULAR" | "CONTRACTOR" | "WORK_BASIS";
  designation: string | null;
  joiningDate: string | null;
  salary: PayrollSalaryStructure;
  bankAccount: string | null;
  ifsc: string | null;
  bankName: string | null;
  pan: string | null;
  shiftId: number | null;
  holidayPolicyId: number | null;
  leavePolicyId: number | null;
}
export type PayrollProfileRequest = PayrollProfileResponse;

export function getShifts() {
  return request<ShiftResponse[]>("/api/v1/payroll/shifts");
}
export function createShift(body: ShiftRequest) {
  return request<ShiftResponse>("/api/v1/payroll/shifts", { method: "POST", body });
}
export function updateShift(id: number, body: ShiftRequest) {
  return request<ShiftResponse>(`/api/v1/payroll/shifts/${id}`, { method: "PUT", body });
}
export function deleteShift(id: number) {
  return request<void>(`/api/v1/payroll/shifts/${id}`, { method: "DELETE" });
}

export function getHolidayPolicies() {
  return request<HolidayPolicyResponse[]>("/api/v1/payroll/holiday-policies");
}
export function createHolidayPolicy(body: HolidayPolicyRequest) {
  return request<HolidayPolicyResponse>("/api/v1/payroll/holiday-policies", { method: "POST", body });
}
export function updateHolidayPolicy(id: number, body: HolidayPolicyRequest) {
  return request<HolidayPolicyResponse>(`/api/v1/payroll/holiday-policies/${id}`, { method: "PUT", body });
}
export function deleteHolidayPolicy(id: number) {
  return request<void>(`/api/v1/payroll/holiday-policies/${id}`, { method: "DELETE" });
}

export function getLeavePolicies() {
  return request<LeavePolicyResponse[]>("/api/v1/payroll/leave-policies");
}
export function createLeavePolicy(body: LeavePolicyRequest) {
  return request<LeavePolicyResponse>("/api/v1/payroll/leave-policies", { method: "POST", body });
}
export function updateLeavePolicy(id: number, body: LeavePolicyRequest) {
  return request<LeavePolicyResponse>(`/api/v1/payroll/leave-policies/${id}`, { method: "PUT", body });
}
export function deleteLeavePolicy(id: number) {
  return request<void>(`/api/v1/payroll/leave-policies/${id}`, { method: "DELETE" });
}

export function getPayrollProfiles(userIds?: number[]) {
  const qs = userIds && userIds.length ? `?userIds=${userIds.join(",")}` : "";
  return request<PayrollProfileResponse[]>(`/api/v1/payroll/profiles${qs}`);
}
export function getPayrollProfile(userId: number) {
  return request<PayrollProfileResponse>(`/api/v1/payroll/profiles/${userId}`);
}
export function savePayrollProfile(body: PayrollProfileRequest) {
  return request<PayrollProfileResponse>("/api/v1/payroll/profiles", { method: "POST", body });
}
export function deletePayrollProfile(userId: number) {
  return request<void>(`/api/v1/payroll/profiles/${userId}`, { method: "DELETE" });
}

// ---- Payroll: attendance (real backend, replaces the localStorage attendanceOverrides) ----
export type AttendanceCodeApi = "P" | "A" | "HD" | "PL" | "WO" | "NM";

export interface AttendanceApiResponse {
  id: number | null;
  userId: number;
  memberName: string;
  date: string; // YYYY-MM-DD
  code: AttendanceCodeApi;
  inTime: string | null;
  outTime: string | null;
  overtimeHours: number;
  fineHours: number;
  projectId: number | null;
  punchInLat: number | null;
  punchInLng: number | null;
  punchOutLat: number | null;
  punchOutLng: number | null;
  faceScoreIn: number | null;
  faceScoreOut: number | null;
  punchInPhoto: string | null;
  punchOutPhoto: string | null;
}

export interface PunchRequestBody {
  direction: "IN" | "OUT";
  lat: number | null;
  lng: number | null;
  faceScore: number | null;
  projectId?: number | null;
  photo?: string | null;
}

// ---- Payroll: face enrolment (self-service, for the punch page) ----
export interface FaceEnrollmentApi {
  descriptor: number[] | null;
  photo: string | null;
  enrolled: boolean;
}
export function getMyFace() {
  return request<FaceEnrollmentApi>("/api/v1/payroll/attendance/face");
}
export function saveMyFace(body: { descriptor: number[]; photo: string | null }) {
  return request<FaceEnrollmentApi>("/api/v1/payroll/attendance/face", { method: "POST", body });
}

// ---- Payroll: work locations (geofences) ----
export interface GeoPointApi {
  lat: number;
  lng: number;
}
export interface LocationApi {
  id: number;
  name: string;
  points: GeoPointApi[];
  memberIds: number[];
  projectId: number | null;
  projectName: string | null;
}
export type LocationRequestApi = { name: string; points: GeoPointApi[]; memberIds: number[]; projectId: number | null };

export function getLocations() {
  return request<LocationApi[]>("/api/v1/payroll/locations");
}
export function getMyLocations() {
  return request<LocationApi[]>("/api/v1/payroll/locations/mine");
}
export function createLocation(body: LocationRequestApi) {
  return request<LocationApi>("/api/v1/payroll/locations", { method: "POST", body });
}
export function updateLocation(id: number, body: LocationRequestApi) {
  return request<LocationApi>(`/api/v1/payroll/locations/${id}`, { method: "PUT", body });
}
export function deleteLocation(id: number) {
  return request<void>(`/api/v1/payroll/locations/${id}`, { method: "DELETE" });
}
/** Admin housekeeping — clear all attendance rows in a date range (e.g. to reset before a test). */
export function clearAttendanceRange(from: string, to: string) {
  return request<void>(`/api/v1/payroll/attendance/range?from=${from}&to=${to}`, { method: "DELETE" });
}

export interface AttendanceEditRequestBody {
  userId: number;
  date: string;
  code?: AttendanceCodeApi;
  inTime?: string | null;
  outTime?: string | null;
  overtimeHours?: number;
  fineHours?: number;
  projectId?: number | null;
}

export function punchAttendance(body: PunchRequestBody) {
  return request<AttendanceApiResponse>("/api/v1/payroll/attendance/punch", { method: "POST", body });
}
export function getTodayAttendance() {
  return request<AttendanceApiResponse>("/api/v1/payroll/attendance/today");
}
export function getMemberAttendance(userId: number, from: string, to: string) {
  return request<AttendanceApiResponse[]>(`/api/v1/payroll/attendance/member/${userId}?from=${from}&to=${to}`);
}
export function getMuster(from: string, to: string) {
  return request<AttendanceApiResponse[]>(`/api/v1/payroll/attendance/muster?from=${from}&to=${to}`);
}
export function getProjectAttendance(projectId: number, from: string, to: string) {
  return request<AttendanceApiResponse[]>(`/api/v1/payroll/attendance/project/${projectId}?from=${from}&to=${to}`);
}
export function editAttendance(body: AttendanceEditRequestBody) {
  return request<AttendanceApiResponse>("/api/v1/payroll/attendance/edit", { method: "POST", body });
}

// ---- Payroll: leave ----
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveRequestApi {
  id: number;
  userId: number;
  memberName: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  approverId: number | null;
  approverName: string | null;
  approvedAt: string | null;
  decisionNote: string | null;
  createdAt: string | null;
}

export interface LeaveBalanceApi {
  leaveTypeName: string;
  annualCount: number;
  taken: number;
  remaining: number;
  paid: boolean;
}

export function myLeave() {
  return request<LeaveRequestApi[]>("/api/v1/payroll/leave/mine");
}
export function myLeaveBalance() {
  return request<LeaveBalanceApi[]>("/api/v1/payroll/leave/balance");
}
export function memberLeave(userId: number) {
  return request<LeaveRequestApi[]>(`/api/v1/payroll/leave/member/${userId}`);
}
export function pendingLeave() {
  return request<LeaveRequestApi[]>("/api/v1/payroll/leave/pending");
}
export function applyLeave(body: { leaveTypeName: string; fromDate: string; toDate: string; reason?: string }) {
  return request<LeaveRequestApi>("/api/v1/payroll/leave/apply", { method: "POST", body });
}
export function decideLeave(id: number, body: { action: "APPROVE" | "REJECT"; note?: string }) {
  return request<LeaveRequestApi>(`/api/v1/payroll/leave/${id}/decide`, { method: "POST", body });
}
export function cancelLeave(id: number) {
  return request<LeaveRequestApi>(`/api/v1/payroll/leave/${id}/cancel`, { method: "POST" });
}

// ---- Payroll: loans ----
export interface LoanApi {
  id: number;
  userId: number;
  memberName: string;
  name: string;
  description: string | null;
  principal: number;
  tenureMonths: number;
  annualRate: number;
  interestType: "FLAT" | "SIMPLE" | "COMPOUND";
  disbursementDate: string;
  startMonth: string;
  emi: number;
  outstanding: number;
}
export type LoanRequestApi = Omit<LoanApi, "id" | "memberName">;

export function getLoansApi() {
  return request<LoanApi[]>("/api/v1/payroll/loans");
}
export function myLoansApi() {
  return request<LoanApi[]>("/api/v1/payroll/loans/mine");
}
export function createLoanApi(body: LoanRequestApi) {
  return request<LoanApi>("/api/v1/payroll/loans", { method: "POST", body });
}
export function updateLoanApi(id: number, body: LoanRequestApi) {
  return request<LoanApi>(`/api/v1/payroll/loans/${id}`, { method: "PUT", body });
}
export function deleteLoanApi(id: number) {
  return request<void>(`/api/v1/payroll/loans/${id}`, { method: "DELETE" });
}

// ---- Payroll: reimbursements ----
export type ReimbStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";
export interface ReimbursementApi {
  id: number;
  userId: number;
  memberName: string;
  expenseType: string;
  claimId: string;
  expenseDate: string;
  appliedAt: string;
  approvedAt: string | null;
  settlementDate: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  approverId: number | null;
  approverName: string | null;
  status: ReimbStatus;
}
export interface ReimbursementCreateBody {
  userId?: number | null;
  expenseType: string;
  claimId?: string;
  expenseDate: string;
  requestedAmount: number;
}
export function getReimbursementsApi() {
  return request<ReimbursementApi[]>("/api/v1/payroll/reimbursements");
}
export function myReimbursementsApi() {
  return request<ReimbursementApi[]>("/api/v1/payroll/reimbursements/mine");
}
export function createReimbursementApi(body: ReimbursementCreateBody) {
  return request<ReimbursementApi>("/api/v1/payroll/reimbursements", { method: "POST", body });
}
export function decideReimbursementApi(id: number, body: { action: "APPROVE" | "REJECT" | "PAY"; approvedAmount?: number }) {
  return request<ReimbursementApi>(`/api/v1/payroll/reimbursements/${id}/decide`, { method: "POST", body });
}

// ---- Payroll: runs & payslips ----
export interface PayslipApi {
  id: number;
  userId: number;
  memberName: string;
  gross: number;
  pf: number;
  esic: number;
  pt: number;
  loanEmi: number;
  reimbursements: number;
  net: number;
  payableDays: number;
  totalDays: number;
  month: string | null;
}
export interface PayrollRunApi {
  id: number;
  month: string;
  status: "DRAFT" | "LOCKED" | "PAID";
  totalGross: number;
  totalNet: number;
  personCount: number;
  lockedBy: number | null;
  lockedByName: string | null;
  lockedAt: string | null;
  createdAt: string | null;
  paidAt: string | null;
  paidByName: string | null;
  payslips: PayslipApi[];
}
export interface PayrollRunSummaryApi {
  id: number;
  month: string;
  status: "DRAFT" | "LOCKED" | "PAID";
  totalGross: number;
  totalNet: number;
  personCount: number;
  createdAt: string | null;
  paidAt: string | null;
}

export function listPayrollRuns() {
  return request<PayrollRunSummaryApi[]>("/api/v1/payroll/runs");
}
export function getPayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}`);
}
export function generatePayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/generate`, { method: "POST" });
}
export function lockPayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/lock`, { method: "POST" });
}
export function unlockPayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/unlock`, { method: "POST" });
}
export function markPayrollRunPaid(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/pay`, { method: "POST" });
}
export function myPayslips() {
  return request<PayslipApi[]>("/api/v1/payroll/payslips/mine");
}
