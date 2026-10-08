// Thin client for the real Spring Boot backend (hitech-backend, user-management-service).
// Base URL points at the local backend by default — override with NEXT_PUBLIC_API_BASE_URL.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const ACCESS_TOKEN_KEY = "hitech_access_token";
const REFRESH_TOKEN_KEY = "hitech_refresh_token";
/**
 * Who this browser is signed in as, written beside the tokens. Every open tab compares it with the
 * user it loaded for (components/SessionGuard.tsx), so signing in as someone else in one tab
 * reloads the others instead of leaving the previous person's data on screen.
 */
export const SESSION_USER_KEY = "hitech_session_user";

export function getSessionUser(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_USER_KEY);
}

export function setSessionUser(userId: number | string | null) {
  if (typeof window === "undefined") return;
  if (userId == null) localStorage.removeItem(SESSION_USER_KEY);
  else localStorage.setItem(SESSION_USER_KEY, String(userId));
}

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
  localStorage.removeItem(SESSION_USER_KEY);
}

// ---- Active company ----
// The group trades as two firms behind one login. Which one a call is for rides on every request
// as a header, and it lives here rather than in companyScope.ts for two reasons: `request()` below
// is not a component and so can't read a hook (same reason the token helpers are here), and
// companyScope imports `apiRequest` — putting the getter there instead would make the two modules
// import each other. See lib/companyScope.ts for the store and the switcher.
const COMPANY_ID_KEY = "hitech.companyId.v1";

export function getActiveCompanyId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(COMPANY_ID_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setActiveCompanyId(id: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COMPANY_ID_KEY, String(id));
}

export function clearActiveCompanyId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COMPANY_ID_KEY);
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
  /**
   * Set on a feature: the module it belongs to (VYAPAR_SALE → VYAPAR). Null on a module, whose VIEW
   * is its ON/OFF switch in Roles & Access.
   */
  parentCode?: string | null;
  sortOrder?: number;
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
  /** Null for members who don't sign in — site labour on the payroll with no app access. */
  email: string | null;
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
  role: RoleSummary;
  departmentId: number | null;
  departmentName: string | null;
  staffType: "OFFICE" | "SITE" | null;
  onPayroll: boolean;
  /** False = payroll/directory entry only; no credentials are held for this member. */
  isLoginUser: boolean;
  /** Profile photo as a data URL (or hosted URL); null until one is uploaded. */
  photoUrl: string | null;
}

export interface UserPageResponse {
  content: UserResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface UserCreateRequest {
  /** Required only when isLoginUser is true (the default). */
  email?: string;
  /** Required only when isLoginUser is true (the default). */
  password?: string;
  isLoginUser?: boolean;
  fullName: string;
  phoneNumber?: string;
  roleId: number;
  departmentId?: number | null;
  staffType?: "OFFICE" | "SITE" | null;
  onPayroll?: boolean;
  photoUrl?: string | null;
}

export interface UserUpdateRequest {
  email?: string | null;
  isLoginUser?: boolean;
  fullName?: string;
  phoneNumber?: string;
  roleId?: number;
  departmentId?: number | null;
  staffType?: "OFFICE" | "SITE" | null;
  onPayroll?: boolean;
  isActive?: boolean;
  photoUrl?: string | null;
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
      // Which of the group's two firms this call is on behalf of. Read from a module variable
      // rather than a hook because this isn't a component — same reason as getAccessToken above —
      // so the header is right from the very first request of a page load. The backend validates
      // it against the caller's grants; absent means "not scoped", which is what every endpoint
      // did before companies existed. See lib/companyScope.ts.
      const companyId = getActiveCompanyId();
      if (companyId != null) headers["X-Company-Id"] = String(companyId);
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
  /** On payroll — can punch, has a payroll profile. The Payroll roster is these people, not all of them. */
  onPayroll: boolean;
  staffType: "OFFICE" | "SITE" | null;
}

/**
 * Everyone Payroll works with (same shape as getUsers, never paged). Payroll screens use this, not
 * getUsers — that one needs User Management access and pages at a few hundred people.
 */
export function getPayrollPeople() {
  return request<UserPageResponse>("/api/v1/payroll/people");
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

/** Super Admin only. `password` is null until the member's password is set or used to sign in. */
export function getStoredPassword(id: number) {
  return request<{ password: string | null; loginUser: boolean }>(`/api/v1/users/${id}/stored-password`);
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
  /**
   * @deprecated Stale cache columns. These were editable fields on the settings modal, which meant
   * the project dashboard could never disagree with whatever someone last typed. The backend now
   * ignores them on update — read `getProjectSummary(id).finance` and `.tasks` instead, which are
   * derived from the documents and tasks actually filed against the project.
   */
  inAmount: number;
  /** @deprecated See {@link ProjectResponse.inAmount}. */
  outAmount: number;
  /** @deprecated See {@link ProjectResponse.inAmount}. */
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

// ---- Project workspace rollups (web-app/ProjectWorkspaceController) ----
// Every figure below is DERIVED from the module that owns the underlying records. Nothing here is
// typed in by a human, which is exactly the point: the old dashboard read projects.in_amount and
// friends, which were free-text fields on the settings modal.

export interface ProjectFinance {
  billed: number;
  received: number;
  outstanding: number;
  spent: number;
  payable: number;
  paidOut: number;
  saleCount: number;
  purchaseCount: number;
  paymentCount: number;
  partyCount: number;
}

export interface ProjectWorkload {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueThisWeek: number;
  awaitingApproval: number;
  completionPercent: number;
}

export interface ProjectManpowerDay {
  date: string;
  workers: number;
  manDays: number;
}

export interface ProjectManpower {
  assignedMembers: number;
  activeMembers: number;
  presentToday: number;
  manDays: number;
  overtimeHours: number;
  labourCost: number;
  /** True when someone who worked has no payroll profile, so labourCost understates the real bill. */
  costIncomplete: boolean;
  trend: ProjectManpowerDay[];
}

export interface ProjectStaffRow {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
  staffType: string | null;
  department: string | null;
  roleName: string | null;
  photoUrl: string | null;
  designation: string | null;
  category: string | null;
  workType: string | null;
  /** null unless the caller holds PAYROLL:VIEW. */
  dailyRate: number | null;
  presentDays: number;
  absentDays: number;
  manDays: number;
  overtimeHours: number;
  /** null unless the caller holds PAYROLL:VIEW. */
  labourCost: number | null;
  lastSeen: string | null;
}

export interface ProjectMaterialRow {
  invoiceId: number;
  date: string | null;
  itemName: string;
  movement: "IN" | "OUT" | "PLANNED";
  quantity: number;
  unit: string | null;
  rate: number;
  amount: number;
  partyName: string;
  docNo: string | null;
}

export interface ProjectProgress {
  /** What the site manager entered. */
  reported: number;
  /** What the task completion rate implies. */
  derivedFromTasks: number;
  diverges: boolean;
}

/** Sections are null when the signed-in user lacks that module's VIEW permission. */
export interface ProjectSummary {
  projectId: number;
  finance: ProjectFinance | null;
  tasks: ProjectWorkload | null;
  manpower: ProjectManpower | null;
  tenders: unknown[] | null;
  progress: ProjectProgress;
  from: string;
  to: string;
}

export function getProjectSummary(projectId: number, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ProjectSummary>(`/api/v1/projects/${projectId}/summary${suffix}`);
}

export function getProjectStaff(projectId: number, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ProjectStaffRow[]>(`/api/v1/projects/${projectId}/staff${suffix}`);
}

export function getProjectMaterials(projectId: number) {
  return request<ProjectMaterialRow[]>(`/api/v1/projects/${projectId}/materials`);
}

/** Money for every project at once — one call for the whole projects list. */
export function getProjectsFinance() {
  return request<Record<string, ProjectFinance>>("/api/v1/projects/finance");
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
  /** Alternate weekly offs by week of month — "6:2,4" = 2nd & 4th Saturday; ";" separates days. */
  alternateOffs?: string;
  /** Late-entry fine: NONE, FIXED (₹ per late day) or MULTIPLIER (late hours × hourly rate × value). */
  lateFineMode?: "NONE" | "FIXED" | "MULTIPLIER";
  lateFineValue?: number;
  earlyFineMode?: "NONE" | "FIXED" | "MULTIPLIER";
  earlyFineValue?: number;
  /** OT pay = hours × hourly rate × this. 0 = OT converts into extra days (legacy). */
  otMultiplier?: number;
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

export type LeaveAccrual = "ALL_AT_ONCE" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY";
export interface LeaveTypeResponse {
  name: string;
  annualCount: number;
  accrual: LeaveAccrual;
  paid: boolean;
  // ---- Rules (PagarBook Leave Configuration). Optional so older callers keep the defaults. ----
  halfDayAllowed?: boolean;
  /** Balance never grows above this; null = no cap. */
  maxBalance?: number | null;
  /** Unused balance moves to the next cycle (up to the cap). */
  carryForward?: boolean;
  /** How far back / ahead a leave may be applied for, in days; null = any. */
  pastDaysLimit?: number | null;
  futureDaysLimit?: number | null;
  minNoticeDays?: number | null;
  /** May staff on probation use it? */
  probationAllowed?: boolean;
  /** Days after joining before it can be used. */
  waitingDays?: number | null;
  /** Leave earning: `earnCount` days for every `earnAfterDays` days present. */
  earnAfterDays?: number | null;
  earnCount?: number | null;
  /** Unused balance paid out at exit. */
  encashable?: boolean;
}
export interface LeavePolicyResponse {
  id: number;
  name: string;
  cycle: "YEARLY" | "MONTHLY";
  types: LeaveTypeResponse[];
  /** Weekly offs / holidays inside a leave count as leave too. */
  sandwich?: boolean;
}
export type LeavePolicyRequest = Omit<LeavePolicyResponse, "id">;

export interface PayrollSalaryStructure {
  monthlyCtc: number;
  basic: number;
  hra: number;
  otherAllowances: number;
  workType: "DAILY" | "HOURLY" | "PIECE" | null;
  workRate: number;
  /**
   * How a worked day converts into pay. SHIFT — a marked day is a full day (what everyone is on
   * today). PUNCH — the day is worth the hours between punch-in and punch-out.
   */
  salaryBasis: "SHIFT" | "PUNCH";
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
  /** Identity documents as a JSON string: an array of { type, number }. */
  documents: string | null;
  /** Salary components (earnings + deductions) as delimited text — see salaryComponents.ts. */
  components: string | null;
  shiftId: number | null;
  holidayPolicyId: number | null;
  leavePolicyId: number | null;
  /** PagarBook-style staff details. Omit (or null) to leave what is stored untouched. */
  details?: StaffDetailsApi | null;
  /**
   * Home office/site (project id) — its approval rules apply to this person's leave. On save:
   * omit/null leaves it unchanged, 0 clears it (back to automatic, from project membership).
   */
  homeProjectId?: number | null;
}
export type PayrollProfileRequest = PayrollProfileResponse;

export interface StaffDetailsApi {
  staffCode: string | null;
  reportingManagerId: number | null;
  probationDays: number | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  upiId: string | null;
  accountHolder: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  emergencyContact: string | null;
  fatherName: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  /** Whether the member sees their own payslips / payments in self-service. */
  salaryAccess: boolean | null;
  /** ACTIVE or DEACTIVATED — deactivated staff are left out of new runs. */
  staffStatus: "ACTIVE" | "DEACTIVATED" | null;
  /** Opening leave balances "type|days;…". */
  openingLeave: string | null;
  /** JSON object {fieldId: value} of the org's custom staff fields. Omit to leave untouched. */
  customFields?: string | null;
  taxProfileId?: string | null;
  taxRegime?: "OLD" | "NEW" | null;
  /** TDS deducted every month. */
  monthlyTds?: number | null;
  /** Read-only — set through exitStaff(). */
  exitDate?: string | null;
  exitReason?: string | null;
}

export function setStaffStatus(userIds: number[], status: "ACTIVE" | "DEACTIVATED") {
  return request<{ updated: number }>("/api/v1/payroll/profiles/status", { method: "POST", body: { userIds, status } });
}

/** Org-wide default salary components (delimited text; null when never set up). */
export interface SalaryTemplateApi {
  components: string | null;
}
export function getSalaryTemplate() {
  return request<SalaryTemplateApi>("/api/v1/payroll/salary-template");
}
export function saveSalaryTemplate(components: string | null) {
  return request<SalaryTemplateApi>("/api/v1/payroll/salary-template", { method: "PUT", body: { components } });
}

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
/** OD on duty · H holiday · OH optional holiday · L unpaid leave, on top of the original six. */
export type AttendanceCodeApi = "P" | "A" | "HD" | "PL" | "WO" | "NM" | "OD" | "H" | "OH" | "L";

export interface AttendanceApiResponse {
  /** Hours the punch pair came to, derived against the member's shift. Null = never punched out. */
  workedHours: number | null;
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
  /** Back-camera site photo at punch-in (punchInPhoto is the front / face one). */
  punchInBackPhoto?: string | null;
  /**
   * Days this row pays, as the payroll run counts it: P / PL / WO 1, HD ½, and a short day (punched
   * in and out for less than the half-day mark) its hours ÷ the shift's full day.
   */
  payableDays?: number | null;
  note?: string | null;
  /** Half day: 1 = first half worked, 2 = second half worked. */
  halfDaySession?: number | null;
  /** What the other half of a half day was: UNPAID, OTHER or a paid leave type's name. */
  halfDayLeave?: string | null;
  otAmount?: number;
  /** "kind|hours|rateType|value|amount;…" — kind AFTER / BEFORE / WEEKLY_OFF. */
  otDetail?: string | null;
  fineAmount?: number;
  /** "kind|hours|rateType|value|amount;…" — kind LATE / EARLY / BREAK. */
  fineDetail?: string | null;
  /** PENDING / APPROVED / REJECTED for a punch made outside every site; null otherwise. */
  punchStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  /** Site photos taken at the punches (thumbnails). Wide date ranges leave the selfies out. */
  sitePhotos?: SitePhotoMetaApi[];
}

export interface PunchRequestBody {
  direction: "IN" | "OUT";
  lat: number | null;
  lng: number | null;
  faceScore: number | null;
  projectId?: number | null;
  photo?: string | null;
  /** Legacy single back-camera site photo (older clients). */
  backPhoto?: string | null;
  /** Site photos for this punch — camera or gallery, up to 5; full JPEG + small thumbnail. */
  sitePhotos?: { photo: string; thumb: string }[];
}

/** A site photo as lists carry it — the thumbnail; fetch the full one with getSitePhoto. */
export interface SitePhotoMetaApi {
  id: number;
  direction: "IN" | "OUT";
  thumb: string | null;
  takenAt: string | null;
}
export function getSitePhoto(id: number) {
  return request<{ id: number; userId: number; date: string; direction: "IN" | "OUT"; photo: string; takenAt: string | null }>(
    `/api/v1/payroll/attendance/site-photos/${id}`,
  );
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
  /** A punch outside every site goes for approval instead of being refused. */
  approvalRequired?: boolean;
}
export type LocationRequestApi = {
  name: string; points: GeoPointApi[]; memberIds: number[]; projectId: number | null; approvalRequired?: boolean;
};
/** Punches made outside every site, waiting for an admin. */
export function getPendingPunches() {
  return request<AttendanceApiResponse[]>("/api/v1/payroll/attendance/pending-punches");
}
export function decidePunch(userId: number, date: string, approve: boolean) {
  return request<AttendanceApiResponse>("/api/v1/payroll/attendance/punch-decision", { method: "POST", body: { userId, date, approve } });
}

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
  note?: string;
  halfDaySession?: number;
  halfDayLeave?: string;
  otAmount?: number;
  otDetail?: string;
  fineAmount?: number;
  fineDetail?: string;
}

export interface AttendanceLogApi {
  id: number;
  userId: number;
  date: string;
  action: string;
  actorName: string | null;
  at: string | null;
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
/** Mark many rows in one round trip (bulk mark, XLSX import). */
export function bulkEditAttendance(rows: AttendanceEditRequestBody[]) {
  return request<AttendanceApiResponse[]>("/api/v1/payroll/attendance/bulk", { method: "POST", body: { rows } });
}
export function getAttendanceLogs(userId: number, date: string) {
  return request<AttendanceLogApi[]>(`/api/v1/payroll/attendance/logs?userId=${userId}&date=${date}`);
}
export function getAttendanceLogsBetween(from: string, to: string) {
  return request<AttendanceLogApi[]>(`/api/v1/payroll/attendance/logs?from=${from}&to=${to}`);
}
/** One hour of a member's pay on a date — prices fine and overtime lines. */
export function getHourlyRate(userId: number, date: string) {
  return request<{ hourlyRate: number }>(`/api/v1/payroll/attendance/hourly-rate?userId=${userId}&date=${date}`);
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
  /** Multi-level chain state, or null when this request never went through one. */
  approval: ApprovalState | null;
  /** True when the signed-in user can decide this request right now. Drives the action buttons. */
  canActNow: boolean;
  halfDay?: boolean;
  /** 1 = first half, 2 = second half. */
  halfSession?: number | null;
}

// ---- Multi-level approval framework (user-management-service, com.hitech.erp.approval) ----

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalMode = "EXPLICIT" | "REPORTING_CHAIN";

/** One entry in the audit trail rendered by the approval sidebar. */
export interface ApprovalAction {
  id: number;
  levelOrder: number | null;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  note: string | null;
  at: string | null;
}

/** One rung of the ladder, and where it stands. */
export interface ApprovalLevelState {
  levelOrder: number;
  roleNames: string[];
  /** APPROVED | REJECTED | PENDING (this rung's turn) | WAITING (an earlier rung hasn't cleared) | CANCELLED */
  state: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface ApprovalState {
  requestId: number;
  entityType: string;
  entityId: number;
  status: ApprovalStatus;
  currentLevel: number;
  totalLevels: number;
  canActNow: boolean;
  /** Roles the request is currently waiting on, pre-joined for display. */
  awaitingRoleNames: string | null;
  levels: ApprovalLevelState[];
  trail: ApprovalAction[];
}

/** Who may approve a step: anyone with the role, or only role holders on the applicant's office/site. */
export type ApprovalScope = "ANY" | "SAME_PROJECT";

export interface ApprovalChainLevel {
  levelOrder: number;
  roleIds: number[];
  roleNames: string[];
  scope: ApprovalScope;
}

export interface ApprovalChain {
  id: number | null;
  entityType: string;
  entityLabel: string;
  mode: ApprovalMode;
  published: boolean;
  levels: ApprovalChainLevel[];
  /** Leave a step out when nobody (at the office/site) holds its role. */
  skipEmpty: boolean;
  /** Null = the company default; set = the rule for this office/site (project). */
  projectId: number | null;
  projectName: string | null;
}

export interface ApprovalChainInput {
  mode?: ApprovalMode;
  published?: boolean;
  skipEmpty?: boolean;
  levels?: { roleIds: number[]; scope: ApprovalScope }[];
}

export function getApprovalChains() {
  return request<ApprovalChain[]>("/api/v1/approval-chains");
}

export function saveApprovalChain(entityType: string, body: ApprovalChainInput) {
  return request<ApprovalChain>(`/api/v1/approval-chains/${entityType}`, { method: "PUT", body });
}

/** Office/site rules for one approval type. */
export function getApprovalRules(entityType: string) {
  return request<ApprovalChain[]>(`/api/v1/approval-chains/${entityType}/rules`);
}

export function saveApprovalRule(entityType: string, projectId: number, body: ApprovalChainInput) {
  return request<ApprovalChain>(`/api/v1/approval-chains/${entityType}/rules/${projectId}`, { method: "PUT", body });
}

export function deleteApprovalRule(entityType: string, projectId: number) {
  return request<void>(`/api/v1/approval-chains/${entityType}/rules/${projectId}`, { method: "DELETE" });
}

export interface ApprovalPreviewStep {
  levelOrder: number;
  roleNames: string;
  from: string;
  approvers: string[];
  skipped: boolean;
  note: string | null;
}

export interface ApprovalPreview {
  userId: number;
  userName: string;
  projectId: number | null;
  projectName: string | null;
  chainUsed: string | null;
  steps: ApprovalPreviewStep[];
  message: string | null;
}

/** "Test a chain" for any approval type, on a chosen office/site. */
export function previewApprovalChain(entityType: string, userId: number, projectId?: number | null) {
  const q = new URLSearchParams({ userId: String(userId) });
  if (projectId) q.set("projectId", String(projectId));
  return request<ApprovalPreview>(`/api/v1/approval-chains/${entityType}/preview?${q}`);
}

/** Who a person's leave would go to — their home office/site worked out by the server. Omit userId for yourself. */
export function previewLeaveApproval(userId?: number) {
  return request<ApprovalPreview>(`/api/v1/payroll/leave/approval-preview${userId ? `?userId=${userId}` : ""}`);
}

export interface HomeSite {
  userId: number;
  projectId: number | null;
  projectName: string | null;
  /** True when worked out from project membership rather than set on the profile. */
  auto: boolean;
  projectCount: number;
}

export function getHomeSites(userIds: number[]) {
  if (!userIds.length) return Promise.resolve([] as HomeSite[]);
  return request<HomeSite[]>(`/api/v1/payroll/home-sites?userIds=${userIds.join(",")}`);
}

// ---- Running approvals across every feature (/api/v1/approvals) ----

/** One row of the approvals inbox. `link` is the route that opens the record. */
export interface ApprovalInboxItem {
  entityType: string;
  entityLabel: string;
  entityId: number;
  title: string;
  subtitle: string | null;
  amount: number | null;
  link: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  state: ApprovalState;
}

export function getApprovalInbox(scope: "mine" | "raised" | "all" = "mine") {
  return request<ApprovalInboxItem[]>(`/api/v1/approvals/inbox?scope=${scope}`);
}

/** Ladder state for a list's rows, keyed by record id. Records with no request are absent. */
export function getApprovalStates(entityType: string, ids: number[]) {
  if (ids.length === 0) return Promise.resolve({} as Record<number, ApprovalState>);
  return request<Record<number, ApprovalState>>(
    `/api/v1/approvals/states?type=${entityType}&ids=${ids.join(",")}`
  );
}

export function decideApproval(entityType: string, entityId: number, action: "APPROVE" | "REJECT", note?: string) {
  return request<ApprovalState | null>(`/api/v1/approvals/${entityType}/${entityId}/decide`, {
    method: "POST",
    body: { action, note: note ?? null },
  });
}

export function withdrawApproval(entityType: string, entityId: number) {
  return request<ApprovalState | null>(`/api/v1/approvals/${entityType}/${entityId}/cancel`, { method: "POST" });
}

export interface LeaveBalanceApi {
  leaveTypeName: string;
  annualCount: number;
  taken: number;
  remaining: number;
  paid: boolean;
  /** Accrued so far + earned + opening + carried forward (capped). */
  entitled?: number;
  earned?: number;
  halfDayAllowed?: boolean;
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
/**
 * Every leave request — pending and decided — in one call, each row carrying its approval chain.
 * Replaces fanning out one memberLeave() call per member just to build an org-wide list.
 */
export function allLeave() {
  return request<LeaveRequestApi[]>("/api/v1/payroll/leave/all");
}
export function applyLeave(body: {
  leaveTypeName: string; fromDate: string; toDate: string; reason?: string; halfDay?: boolean; halfSession?: number;
}) {
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
  /** ACTIVE, PAUSED, CLOSED or WRITTEN_OFF — only ACTIVE loans deduct an EMI. */
  status?: "ACTIVE" | "PAUSED" | "CLOSED" | "WRITTEN_OFF";
}
export type LoanRequestApi = Omit<LoanApi, "id" | "memberName" | "status">;

export function loanActionApi(id: number, action: "PAUSE" | "RESUME" | "CLOSE" | "WRITE_OFF") {
  return request<LoanApi>(`/api/v1/payroll/loans/${id}/action`, { method: "POST", body: { action } });
}

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
  /** The cycle (yyyy-MM) whose salary paid it; null when unpaid or paid on its own. */
  paidMonth?: string | null;
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
/** REOPEN puts a rejected or approved claim back to PENDING; a paid one can't be unwound here. */
export function decideReimbursementApi(
  id: number,
  body: { action: "APPROVE" | "REJECT" | "PAY" | "REOPEN"; approvedAmount?: number },
) {
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
  otherDeductions: number;
  /** Delimited "name|amount;…" breakdown of every deduction component, for the payslip. */
  deductionsDetail: string | null;
  loanEmi: number;
  reimbursements: number;
  net: number;
  payableDays: number;
  totalDays: number;
  month: string | null;
  /** Overtime pay — part of gross. */
  otAmount?: number;
  /** Fines — deducted. */
  fineAmount?: number;
  /** One-off earnings (allowance, bonus) — part of gross. */
  variableEarnings?: number;
  variableDeductions?: number;
  /** Advance salary paid in the month, recovered here. */
  advanceDeduction?: number;
  /** Piece-rate work — part of gross. */
  workAmount?: number;
  earningsDetail?: string | null;
  lopDays?: number;
  lopOverride?: number | null;
  lopReason?: string | null;
  /** HOLD (pay later) or STOP (not paid this cycle). */
  holdStatus?: "HOLD" | "STOP" | null;
  holdReason?: string | null;
  payStatus?: "UNPAID" | "PAID";
  paidAmount?: number;
  paidAt?: string | null;
  /** Income tax deducted at source. */
  tds?: number;
  /** Leave in the month: paid (PL + leave half-days), unpaid (L), and approved leave by type. */
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  leaveDetail?: string | null;
  /** The expense claims this slip reimbursed — "Travel ₹500 (CLM-12); Food ₹200 (CLM-14)". */
  claimDetail?: string | null;
  /** Hour-based view, display only (never paid): punch hours that month, hourly rate, their value. */
  workedHours?: number | null;
  hourRate?: number | null;
  hourBasedAmount?: number | null;
  /** How the rate was worked out, e.g. "₹30000 ÷ (26 working days × 8 h)". */
  hourBasis?: string | null;
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
  /** Attendance taken as actual up to this date; later days follow `assumption`. */
  cutoffDate?: string | null;
  assumption?: RunAssumption | null;
  unmarkedPolicy?: UnmarkedDayPolicy | null;
}
/** How days after the cut-off are projected. */
export type RunAssumption = "PRESENT" | "ABSENT" | "EXTRAPOLATE";
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
/** How days with no attendance mark are paid when a run is generated. */
/** ABSENT = pay marked days only; ABSENT_PAY_OFFS = also blank weekly offs / holidays in weeks worked. */
export type UnmarkedDayPolicy = "PRESENT" | "ABSENT" | "ABSENT_PAY_OFFS";

export function generatePayrollRun(
  month: string,
  unmarked: UnmarkedDayPolicy = "ABSENT",
  cutoff?: string | null,
  assumption?: RunAssumption | null,
) {
  const extra = cutoff ? `&cutoff=${cutoff}&assumption=${assumption ?? "PRESENT"}` : "";
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/generate?unmarked=${unmarked}${extra}`, { method: "POST" });
}
/** Payroll inputs for one member: LOP override (draft only) and salary hold / stop. */
export function setPayslipInputs(
  month: string,
  userId: number,
  body: { lopOverride?: number | null; clearLopOverride?: boolean; lopReason?: string; holdStatus?: "HOLD" | "STOP" | "NONE"; holdReason?: string },
) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/inputs/${userId}`, { method: "PUT", body });
}
/** Record that members were paid offline — no money moves. */
export function payRunMembers(month: string, body: { userIds: number[]; mode?: string; date?: string; note?: string; bankAccountId?: number | null }) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/pay-members`, { method: "POST", body });
}
export function unpayRunMember(month: string, userId: number) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/unpay/${userId}`, { method: "POST" });
}

// ---- Payroll: payments ledger ----
export type PaymentCategoryApi = "SALARY" | "ADVANCE" | "GENERAL" | "BONUS" | "ADJUSTMENT" | "FNF";
export type PaymentModeApi = "CASH" | "BANK" | "UPI" | "CHEQUE" | "OTHER";
export interface PaymentApi {
  id: number;
  userId: number;
  memberName: string;
  month: string;
  category: PaymentCategoryApi;
  mode: PaymentModeApi;
  amount: number;
  recordDate: string;
  description: string | null;
  createdByName: string | null;
  createdAt: string | null;
}
export function getPaymentsApi(params: { month?: string; userId?: number } = {}) {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.userId) q.set("userId", String(params.userId));
  const qs = q.toString();
  return request<PaymentApi[]>(`/api/v1/payroll/payments${qs ? `?${qs}` : ""}`);
}
export function myPaymentsApi() {
  return request<PaymentApi[]>("/api/v1/payroll/payments/mine");
}
export function addPaymentApi(body: {
  userId: number; month?: string; category: PaymentCategoryApi; mode?: PaymentModeApi;
  amount: number; recordDate?: string; description?: string;
  /** The Vyapar cash / bank account it was paid from; null = cash in hand. */
  bankAccountId?: number | null;
}) {
  return request<PaymentApi>("/api/v1/payroll/payments", { method: "POST", body });
}

/**
 * Re-post every payroll entry onto the staff members' Vyapar party ledgers. Idempotent — also the
 * one-off backfill for entries recorded before payroll and Vyapar were connected.
 */
export function syncPayrollToVyapar() {
  return request<Record<string, number>>("/api/v1/payroll/vyapar-sync", { method: "POST" });
}
export function deletePaymentApi(id: number) {
  return request<void>(`/api/v1/payroll/payments/${id}`, { method: "DELETE" });
}

// ---- Payroll: variable earnings / deductions ----
export interface VariableApi {
  id: number;
  userId: number;
  memberName: string;
  month: string;
  kind: "EARNING" | "DEDUCTION";
  name: string;
  amount: number;
  entryDate: string;
  description: string | null;
}
export function getVariablesApi(params: { month?: string; userId?: number }) {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.userId) q.set("userId", String(params.userId));
  return request<VariableApi[]>(`/api/v1/payroll/variables?${q.toString()}`);
}
export function addVariablesApi(body: {
  userIds: number[]; month: string; kind: "EARNING" | "DEDUCTION"; name: string;
  amount: number; entryDate?: string; description?: string;
}) {
  return request<VariableApi[]>("/api/v1/payroll/variables", { method: "POST", body });
}
export function deleteVariableApi(id: number) {
  return request<void>(`/api/v1/payroll/variables/${id}`, { method: "DELETE" });
}

// ---- Payroll: piece-rate work ----
export interface WorkItemApi {
  id: number;
  name: string;
  unit: string | null;
  rate: number;
  active: boolean;
}
export interface WorkLogApi {
  id: number;
  userId: number;
  memberName: string;
  date: string;
  itemId: number | null;
  itemName: string;
  units: number;
  rate: number;
  amount: number;
  note: string | null;
  projectId: number | null;
  loggedByName: string | null;
}
export function getWorkItemsApi() {
  return request<WorkItemApi[]>("/api/v1/payroll/work/items");
}
export function saveWorkItemApi(id: number | null, body: { name: string; unit?: string; rate: number; active?: boolean }) {
  return id
    ? request<WorkItemApi>(`/api/v1/payroll/work/items/${id}`, { method: "PUT", body })
    : request<WorkItemApi>("/api/v1/payroll/work/items", { method: "POST", body });
}
export function deleteWorkItemApi(id: number) {
  return request<void>(`/api/v1/payroll/work/items/${id}`, { method: "DELETE" });
}
export function getWorkLogsApi(from: string, to: string, userId?: number) {
  return request<WorkLogApi[]>(`/api/v1/payroll/work/logs?from=${from}&to=${to}${userId ? `&userId=${userId}` : ""}`);
}
export function addWorkLogApi(body: {
  userId: number; date: string; itemId?: number | null; itemName?: string; units: number;
  rate?: number; note?: string; projectId?: number | null;
}) {
  return request<WorkLogApi>("/api/v1/payroll/work/logs", { method: "POST", body });
}
export function deleteWorkLogApi(id: number) {
  return request<void>(`/api/v1/payroll/work/logs/${id}`, { method: "DELETE" });
}
export function editPayslip(month: string, userId: number, body: { gross: number; otherDeductions: number }) {
  return request<PayslipApi>(`/api/v1/payroll/runs/${month}/payslips/${userId}`, { method: "PUT", body });
}
export function lockPayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/lock`, { method: "POST" });
}
export function unlockPayrollRun(month: string) {
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/unlock`, { method: "POST" });
}
export function markPayrollRunPaid(month: string, bankAccountId?: number | null) {
  const qs = bankAccountId ? `?bankAccountId=${bankAccountId}` : "";
  return request<PayrollRunApi>(`/api/v1/payroll/runs/${month}/pay${qs}`, { method: "POST" });
}
export function myPayslips() {
  return request<PayslipApi[]>("/api/v1/payroll/payslips/mine");
}
/** One member's payslips across every run (managers; self-service reads its own). */
export function getMemberPayslips(userId: number) {
  return request<PayslipApi[]>(`/api/v1/payroll/payslips/member/${userId}`);
}

// ---- Access introspection ----
export interface AccessSelfApi {
  superAdmin: boolean;
  hasSubtree: boolean;
  /** Everyone below me in the role ladder (excludes me; empty for Super Admin, whose team is everyone). */
  teamUserIds?: number[];
}

export function getAccessSelf() {
  return request<AccessSelfApi>("/api/v1/access/me");
}

// ---- Payroll: org settings (payslip template, custom staff fields, tax profiles) ----
export type PayrollSettingKey = "PAYSLIP_TEMPLATE" | "CUSTOM_FIELDS" | "TAX_PROFILES";
export function getPayrollSetting(key: PayrollSettingKey) {
  return request<{ key: string; value: string | null }>(`/api/v1/payroll/settings/${key}`);
}
export function savePayrollSetting(key: PayrollSettingKey, value: string | null) {
  return request<{ key: string; value: string | null }>(`/api/v1/payroll/settings/${key}`, { method: "PUT", body: { value } });
}

// ---- Payroll: broadcasts ----
export interface BroadcastApi {
  id: number;
  title: string | null;
  message: string;
  all: boolean;
  userIds: number[];
  recipientCount: number;
  status: string;
  sentAt: string | null;
  attachmentName: string | null;
  hasAttachment: boolean;
  createdBy: number | null;
  createdByName: string | null;
}
export function getBroadcasts() {
  return request<BroadcastApi[]>("/api/v1/payroll/broadcasts");
}
export function myBroadcasts() {
  return request<BroadcastApi[]>("/api/v1/payroll/broadcasts/mine");
}
export function getBroadcastAttachment(id: number) {
  return request<{ dataUrl: string }>(`/api/v1/payroll/broadcasts/${id}/attachment`);
}
export function sendBroadcast(body: {
  title?: string; message: string; all?: boolean; userIds?: number[]; attachmentName?: string | null; attachment?: string | null;
}) {
  return request<BroadcastApi>("/api/v1/payroll/broadcasts", { method: "POST", body });
}
export function deleteBroadcast(id: number) {
  return request<void>(`/api/v1/payroll/broadcasts/${id}`, { method: "DELETE" });
}

// ---- Payroll: organisation documents ----
export interface OrgDocumentApi {
  id: number;
  title: string;
  fileName: string;
  createdAt: string | null;
  createdByName: string | null;
  /** Only filled by getOrgDocument(). */
  dataUrl: string | null;
}
export function getOrgDocuments() {
  return request<OrgDocumentApi[]>("/api/v1/payroll/org-documents");
}
export function getOrgDocument(id: number) {
  return request<OrgDocumentApi>(`/api/v1/payroll/org-documents/${id}`);
}
export function addOrgDocument(body: { title: string; fileName: string; dataUrl: string }) {
  return request<OrgDocumentApi>("/api/v1/payroll/org-documents", { method: "POST", body });
}
export function deleteOrgDocument(id: number) {
  return request<void>(`/api/v1/payroll/org-documents/${id}`, { method: "DELETE" });
}

// ---- Payroll: staff exit & full-and-final ----
export interface SettlementApi {
  userId: number;
  joiningDate: string | null;
  exitDate: string;
  exitReason: string | null;
  yearsOfService: number;
  monthlyCtc: number;
  basic: number;
  dailyRate: number;
  /** Unused balance of encashable leave types. */
  encashDays: number;
  encashAmount: number;
  gratuityEligible: boolean;
  gratuity: number;
  loanOutstanding: number;
}
export function getSettlement(userId: number, exitDate?: string) {
  return request<SettlementApi>(`/api/v1/payroll/profiles/${userId}/settlement${exitDate ? `?exitDate=${exitDate}` : ""}`);
}
export function exitStaff(userId: number, body: { exitDate: string; reason?: string }) {
  return request<SettlementApi>(`/api/v1/payroll/profiles/${userId}/exit`, { method: "POST", body });
}
export function cancelStaffExit(userId: number) {
  return request<void>(`/api/v1/payroll/profiles/${userId}/exit`, { method: "DELETE" });
}
