import { apiRequest } from "./api";

/**
 * A project's BOQ and the targets that measure it being built — mirrors project-service.
 *
 * <p>The two halves have deliberately different shapes, and the difference is the point:
 *
 *  - **The BOQ is a document.** It arrives whole and is replaced whole, because re-running the
 *    handover from a won tender means "build this again from the bid".
 *  - **A target is edited one field at a time**, by people on site, from phones. Making them PUT the
 *    whole BOQ to change a due date would mean the last save of the day silently wins over
 *    everything typed before it.
 *
 * <p>**One target measures one BOQ line.** A target used to be able to span a family, and progress
 * was logged against the family — "3,026 of 25,000 RMT" across nine items with different units and
 * rates, which is a number nobody can act on. A family is now a heading the screen draws by grouping
 * on `groupKey`; it holds no quantity and nothing can be reported against it.
 */

const base = (projectId: number) => `/api/v1/projects/${projectId}/boq`;

// ---------------------------------------------------------------- shapes

export type TargetStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
export type ResourceKind = "MATERIAL" | "WORKFORCE" | "EQUIPMENT";
/** Finish-to-start is the only one site staff use; the rest exist so the field never has to grow. */
export type DependencyKind = "FS" | "SS" | "FF" | "SF";

export interface ApiBoqItem {
  id: number;
  srNo: string;
  groupKey: string;
  groupLabel: string | null;
  description: string;
  qty: number;
  unit: string;
  saleRate: number;
  costRate: number;
  overheadRate: number;
  sourceLineId: number | null;
}

export interface ApiTargetAssignee {
  userId: number;
  name: string | null;
  photoUrl: string | null;
}

export interface ApiTargetDependency {
  id: number;
  dependsOn: number;
  dependsOnName: string | null;
  kind: DependencyKind;
  lagDays: number;
}

export interface ApiTargetResource {
  id: number;
  kind: ResourceKind;
  refId: number | null;
  name: string;
  unit: string | null;
  quantity: number;
  rate: number;
  /** quantity × rate, sent because every screen that shows a resource shows its cost. */
  amount: number;
  note: string | null;
}

export interface ApiTargetDelayLog {
  id: number;
  reason: string;
  days: number;
  note: string | null;
  loggedOn: string;
  byName: string | null;
}

export interface ApiTargetStatusLog {
  id: number;
  fromStatus: TargetStatus | null;
  toStatus: TargetStatus;
  note: string | null;
  byName: string | null;
  at: string;
}

export interface ApiTargetEntry {
  id: number;
  date: string;
  qty: number;
  note: string | null;
  /** Where on site — "MH-14", "Ch. 1200–1400". Turns a running total into a checkable record. */
  location: string | null;
  reportedBy: string | null;
  createdAt: string;
}

export interface ApiTarget {
  id: number;
  /** The one line this measures. A subtask carries its parent's. */
  boqItemId: number;
  parentId: number | null;
  name: string;
  unit: string;
  targetQty: number;
  doneQty: number;
  status: TargetStatus;
  startDate: string | null;
  dueDate: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  forecastEnd: string | null;
  tag: string | null;
  /** Legacy free-text assignee, superseded by `assignees`. Shown only when there are no rows. */
  assignee: string | null;
  sortOrder: number;
  assignees: ApiTargetAssignee[];
  dependencies: ApiTargetDependency[];
  resources: ApiTargetResource[];
  delayLogs: ApiTargetDelayLog[];
  statusLogs: ApiTargetStatusLog[];
  entries: ApiTargetEntry[];
}

export interface ApiProjectBoq {
  id: number;
  projectId: number;
  tenderRef: number | null;
  analysisId: number | null;
  title: string | null;
  clientName: string | null;
  boqNo: string | null;
  boqDate: string | null;
  bidPct: number;
  items: ApiBoqItem[];
  targets: ApiTarget[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- the BOQ

/** 204 when a project has no BOQ, which the client sees as null — not every project came from a tender. */
export const getBoq = (projectId: number) =>
  apiRequest<ApiProjectBoq | undefined>(base(projectId)).then((b) => b ?? null);

export const saveBoq = (projectId: number, body: unknown) =>
  apiRequest<ApiProjectBoq>(base(projectId), { method: "PUT", body });

export const deleteBoq = (projectId: number) =>
  apiRequest<void>(base(projectId), { method: "DELETE" });

// ---------------------------------------------------------------- families

/**
 * An item family — "Earthwork", "Pipe laying".
 *
 * <p>A record of its own, not a grouping derived from the lines, so it can exist with nothing in it.
 * That is how a job is actually set up: the families are laid out first and filled in over the
 * following days.
 */
export interface ApiBoqFamily {
  id: number;
  /** Stable handle the lines point at. Derived from the label once, never shown, never changed. */
  key: string;
  label: string;
  sortOrder: number;
  lineCount: number;
  /** Contract value of the lines inside it. */
  value: number;
}

export const getFamilies = (projectId: number) =>
  apiRequest<ApiBoqFamily[]>(`${base(projectId)}/families`);

/** Omit `key` to create a family; pass it to rename one. A new family starts empty. */
export const saveFamily = (projectId: number, body: { key?: string; label: string }) =>
  apiRequest<ApiBoqFamily[]>(`${base(projectId)}/families`, { method: "PUT", body });

export const reorderFamilies = (projectId: number, keys: string[]) =>
  apiRequest<ApiBoqFamily[]>(`${base(projectId)}/families/reorder`, { method: "PUT", body: { keys } });

/**
 * Delete a family. `moveLinesTo` is required while it still holds lines — the server refuses
 * rather than destroying priced work as a side effect of tidying up a heading.
 */
export const deleteFamily = (projectId: number, key: string, moveLinesTo?: string) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/families/${encodeURIComponent(key)}/delete`, {
    method: "POST",
    body: { moveLinesTo: moveLinesTo ?? null },
  });

// ---------------------------------------------------------------- lines

export interface BoqItemUpsert {
  srNo?: string | null;
  /** Required when adding: a line has to name the family it belongs to. */
  groupKey?: string | null;
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  saleRate?: number | null;
  costRate?: number | null;
  overheadRate?: number | null;
  sourceLineId?: number | null;
  /** Create the target measuring this line at the same time. Defaults to true server-side. */
  withTarget?: boolean;
}

export const addBoqItem = (projectId: number, body: BoqItemUpsert) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/items`, { method: "POST", body });

export const updateBoqItem = (projectId: number, itemId: number, body: BoqItemUpsert) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/items/${itemId}`, { method: "PUT", body });

export const deleteBoqItem = (projectId: number, itemId: number) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/items/${itemId}`, { method: "DELETE" });

// ---------------------------------------------------------------- targets

export interface TargetUpsert {
  boqItemId?: number | null;
  parentId?: number | null;
  name?: string | null;
  unit?: string | null;
  targetQty?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  forecastEnd?: string | null;
  tag?: string | null;
  status?: TargetStatus | null;
  /** Omit to leave assignees alone; an empty array clears them. */
  assigneeUserIds?: number[] | null;
}

export const getTargets = (projectId: number) =>
  apiRequest<ApiTarget[]>(`${base(projectId)}/targets`);

export const createTarget = (projectId: number, body: TargetUpsert) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets`, { method: "POST", body });

export const updateTarget = (projectId: number, targetId: number, body: TargetUpsert) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}`, { method: "PUT", body });

export const deleteTarget = (projectId: number, targetId: number) =>
  apiRequest<void>(`${base(projectId)}/targets/${targetId}`, { method: "DELETE" });

export const duplicateTarget = (projectId: number, targetId: number) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/duplicate`, { method: "POST" });

export const setTargetStatus = (
  projectId: number,
  targetId: number,
  status: TargetStatus,
  note?: string,
) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/status`, {
    method: "POST",
    body: { status, note: note ?? null },
  });

export const reorderTargets = (projectId: number, targetIds: number[]) =>
  apiRequest<void>(`${base(projectId)}/targets/reorder`, { method: "PUT", body: { targetIds } });

// ---- progress ----

export const logProgress = (
  projectId: number,
  targetId: number,
  body: { qty: number; date?: string | null; note?: string | null; location?: string | null },
) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/targets/${targetId}/progress`, {
    method: "POST",
    body,
  });

export const removeProgress = (projectId: number, targetId: number, entryId: number) =>
  apiRequest<ApiProjectBoq>(`${base(projectId)}/targets/${targetId}/progress/${entryId}`, {
    method: "DELETE",
  });

// ---- dependencies ----

export const addDependency = (
  projectId: number,
  targetId: number,
  body: { dependsOn: number; kind?: DependencyKind; lagDays?: number },
) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/dependencies`, {
    method: "POST",
    body,
  });

export const removeDependency = (projectId: number, targetId: number, dependencyId: number) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/dependencies/${dependencyId}`, {
    method: "DELETE",
  });

// ---- resources ----

export const addResource = (
  projectId: number,
  targetId: number,
  body: {
    kind: ResourceKind;
    refId?: number | null;
    name: string;
    unit?: string | null;
    quantity?: number;
    rate?: number;
    note?: string | null;
  },
) => apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/resources`, { method: "POST", body });

export const removeResource = (projectId: number, targetId: number, resourceId: number) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/resources/${resourceId}`, {
    method: "DELETE",
  });

// ---- delay ----

export const addDelay = (
  projectId: number,
  targetId: number,
  body: { reason: string; days?: number; note?: string | null; loggedOn?: string | null },
) => apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/delays`, { method: "POST", body });

export const removeDelay = (projectId: number, targetId: number, delayId: number) =>
  apiRequest<ApiTarget>(`${base(projectId)}/targets/${targetId}/delays/${delayId}`, {
    method: "DELETE",
  });
