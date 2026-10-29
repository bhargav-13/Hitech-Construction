import { apiRequest } from "./api";

// Mirrors payroll-service HrDeskController — Others lists on the server, letters shared with staff,
// and Self Service → Query / Problem.

// ---- Others → shared lists ----

export interface RegisterApi {
  name: string;
  /** JSON array of rows, or null when the list has never been saved. */
  rows: string | null;
  updatedAt: string | null;
}

export const getRegister = (name: string) => apiRequest<RegisterApi>(`/api/v1/payroll/registers/${name}`);
export const saveRegister = (name: string, rows: unknown[]) =>
  apiRequest<RegisterApi>(`/api/v1/payroll/registers/${name}`, { method: "PUT", body: { rows: JSON.stringify(rows) } });

// ---- Letters shared with staff ----

export interface IssuedLetterApi {
  id: number;
  userId: number;
  memberName: string | null;
  kind: string;
  title: string;
  refNo: string | null;
  fileName: string;
  issuedAt: string | null;
  issuedBy: number | null;
  issuedByName: string | null;
  /** When the employee first opened it. */
  seenAt: string | null;
}

export const issueLetter = (body: { userId: number; kind: string; title: string; refNo?: string | null; fileName: string; dataUrl: string }) =>
  apiRequest<IssuedLetterApi>("/api/v1/payroll/letters", { method: "POST", body });
export const getIssuedLetters = (userId?: number) =>
  apiRequest<IssuedLetterApi[]>(`/api/v1/payroll/letters${userId ? `?userId=${userId}` : ""}`);
export const getMyLetters = () => apiRequest<IssuedLetterApi[]>("/api/v1/payroll/letters/mine");
export const getLetterFile = (id: number) => apiRequest<{ dataUrl: string }>(`/api/v1/payroll/letters/${id}/file`);
export const deleteIssuedLetter = (id: number) => apiRequest<void>(`/api/v1/payroll/letters/${id}`, { method: "DELETE" });

// ---- Queries to HR ----

export type QueryStatus = "OPEN" | "ANSWERED" | "CLOSED";
export type QueryLanguage = "en" | "gu" | "hi";

export interface QueryMessageApi {
  id: number;
  authorId: number;
  authorName: string | null;
  fromHr: boolean;
  body: string | null;
  language: string | null;
  attachmentName: string | null;
  hasAttachment: boolean;
  hasVoice: boolean;
  voiceSeconds: number | null;
  createdAt: string | null;
}

export interface QueryApi {
  id: number;
  userId: number;
  memberName: string | null;
  subject: string;
  category: string | null;
  status: QueryStatus;
  assignedTo: number | null;
  assignedToName: string | null;
  createdAt: string | null;
  lastMessageAt: string | null;
  /** The last word in the thread was HR's. */
  lastFromHr: boolean;
  messageCount: number;
  messages: QueryMessageApi[] | null;
}

export interface MessageBody {
  body?: string | null;
  language?: QueryLanguage | null;
  attachmentName?: string | null;
  attachment?: string | null;
  voice?: string | null;
  voiceSeconds?: number | null;
}

export interface HrPersonApi {
  id: number;
  fullName: string;
  roleName: string;
}

export const getHrPeople = () => apiRequest<HrPersonApi[]>("/api/v1/payroll/queries/hr-people");
export const getMyQueries = () => apiRequest<QueryApi[]>("/api/v1/payroll/queries/mine");
export const getAllQueries = () => apiRequest<QueryApi[]>("/api/v1/payroll/queries");
export const getQuery = (id: number) => apiRequest<QueryApi>(`/api/v1/payroll/queries/${id}`);
export const raiseQuery = (body: { subject: string; category?: string | null; assignedTo?: number | null; message: MessageBody }) =>
  apiRequest<QueryApi>("/api/v1/payroll/queries", { method: "POST", body });
export const replyQuery = (id: number, body: MessageBody) =>
  apiRequest<QueryApi>(`/api/v1/payroll/queries/${id}/messages`, { method: "POST", body });
export const setQueryStatus = (id: number, status: "OPEN" | "CLOSED") =>
  apiRequest<QueryApi>(`/api/v1/payroll/queries/${id}/status`, { method: "PUT", body: { status } });
export const getQueryMedia = (messageId: number, which: "attachment" | "voice") =>
  apiRequest<{ dataUrl: string }>(`/api/v1/payroll/queries/messages/${messageId}/${which}`);

export const QUERY_CATEGORIES = ["Salary / Payslip", "Attendance", "Leave", "Reimbursement", "Loan / Advance", "Documents", "Other"];
