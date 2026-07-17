import { apiRequest } from "./api";

export type AuditActionApi = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT";

// Mirrors api-contracts/audit.yaml (audit-service). One row per state-changing API call.
export interface AuditLog {
  id: number;
  actorUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: AuditActionApi;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  httpMethod: string | null;
  path: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  content: AuditLog[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditActor {
  id: number;
  name: string;
  email: string;
}

export interface AuditFilterOptions {
  actions: AuditActionApi[];
  entityTypes: string[];
  actors: AuditActor[];
}

export interface AuditQuery {
  page?: number;
  size?: number;
  actorUserId?: number;
  action?: string;
  entityType?: string;
  from?: string; // ISO date (inclusive), e.g. 2026-07-01
  to?: string; // ISO date (inclusive)
  q?: string; // free text over summary, path and actor
}

export function getAuditLogs(query: AuditQuery = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  return apiRequest<AuditLogPage>(`/api/v1/audit-logs?${qs.toString()}`);
}

export function getAuditFilters() {
  return apiRequest<AuditFilterOptions>("/api/v1/audit-logs/filters");
}
