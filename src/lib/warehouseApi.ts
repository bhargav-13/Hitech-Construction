import { apiRequest } from "./api";

/**
 * Mirrors warehouse-service (com.hitech.erp.warehouse). Stores, the movement ledger behind them,
 * material requests, and who may do what where.
 *
 * Two shapes carry the design, and both are deliberate absences:
 *
 *  - **There is no quantity field.** Nothing in this file writes a balance, because the server does
 *    not store one — `StockRow.onHand` is the sum of the movement rows, computed per request. A
 *    `setStock` would be the one call that could put the ledger and the balance out of step, so it
 *    does not exist on either side.
 *  - **There is no delete for a movement.** A correction is an `ADJUSTMENT` carrying a reason, which
 *    leaves both facts in the book. A ledger you can quietly delete rows from is a spreadsheet.
 *
 * Every id here is a number, as the server sends it. The store maps them to strings at its own edge
 * so the screens keep the ids they were written against.
 */

const BASE = "/api/v1/warehouse";

// ---------------------------------------------------------------- stores

export type ApiWarehouseKind = "CENTRAL" | "SITE" | "TRANSIT";
export type ApiWarehouseRole = "VIEWER" | "KEEPER" | "SUPERVISOR";

export interface ApiWarehouse {
  id: number;
  code: string;
  name: string;
  kind: ApiWarehouseKind;
  projectId: number | null;
  address: string | null;
  inChargeUserId: number | null;
  inChargeName: string | null;
  isActive: boolean;
  /** The caller's own standing here. The server sends it so a screen never has to work it out. */
  myRole: ApiWarehouseRole | null;
  teamSize: number;
  itemsHeld: number;
}

export interface ApiWarehouseInput {
  code: string;
  name: string;
  kind: ApiWarehouseKind;
  projectId: number | null;
  address: string | null;
  inChargeUserId: number | null;
  isActive: boolean;
}

export const getWarehouses = () => apiRequest<ApiWarehouse[]>(`${BASE}/warehouses`);

export const createWarehouse = (body: ApiWarehouseInput) =>
  apiRequest<ApiWarehouse>(`${BASE}/warehouses`, { method: "POST", body });

export const updateWarehouse = (id: number, body: ApiWarehouseInput) =>
  apiRequest<ApiWarehouse>(`${BASE}/warehouses/${id}`, { method: "PUT", body });

/** Closes a store that has history rather than removing it; deletes an unused one outright. */
export const deleteWarehouse = (id: number) =>
  apiRequest<void>(`${BASE}/warehouses/${id}`, { method: "DELETE" });

// ---------------------------------------------------------------- access

export interface ApiMember {
  id: number;
  warehouseId: number;
  userId: number;
  userName: string | null;
  role: ApiWarehouseRole;
}

export const getMembers = (warehouseId: number) =>
  apiRequest<ApiMember[]>(`${BASE}/warehouses/${warehouseId}/members`);

/** A null role removes the grant. */
export const setMember = (warehouseId: number, userId: number, role: ApiWarehouseRole | null) =>
  apiRequest<void>(`${BASE}/warehouses/${warehouseId}/members`, {
    method: "PUT",
    body: { userId, role: role ?? "" },
  });

/**
 * The caller's standing in every store they can reach, keyed by warehouse id.
 *
 * Worth fetching even though `ApiWarehouse.myRole` carries the same answer: this includes the
 * read-only standing someone inherits from running a site's project, which no membership row shows.
 */
export const getMyAccess = () => apiRequest<Record<string, ApiWarehouseRole>>(`${BASE}/access`);

// ---------------------------------------------------------------- stock

export interface ApiStockRow {
  itemId: number;
  itemName: string | null;
  unit: string | null;
  itemCode: string | null;
  warehouseId: number;
  onHand: number;
  /** Claimed by an approved request that has not been issued yet. */
  reserved: number;
  /** onHand − reserved: the only figure safe to promise to the next person who asks. */
  available: number;
  reorderLevel: number;
  binLocation: string | null;
  rate: number;
  value: number;
}

export const getStock = (warehouseId?: number) =>
  apiRequest<ApiStockRow[]>(`${BASE}/stock${warehouseId ? `?warehouseId=${warehouseId}` : ""}`);

/**
 * The saved reorder levels and bin locations.
 *
 * Read separately from `getStock` because that one is built from the movement ledger and so only
 * mentions items that have moved. A reorder level set on something the store has not received yet —
 * which is exactly when you would set one — appears nowhere in it.
 */
export interface ApiStockSetting {
  id: number;
  warehouseId: number;
  itemId: number;
  reorderLevel: number | null;
  binLocation: string | null;
}

export const getStockSettings = (warehouseId?: number) =>
  apiRequest<ApiStockSetting[]>(
    `${BASE}/stock/settings${warehouseId ? `?warehouseId=${warehouseId}` : ""}`,
  );

export const saveStockSetting = (body: {
  warehouseId: number;
  itemId: number;
  reorderLevel: number;
  binLocation: string | null;
}) => apiRequest<void>(`${BASE}/stock/settings`, { method: "PUT", body });

// ---------------------------------------------------------------- movements

export type ApiMovementKind =
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "RETURN"
  | "ADJUSTMENT";

export interface ApiMovement {
  id: number;
  number: string;
  warehouseId: number;
  warehouseCode: string | null;
  itemId: number;
  itemName: string | null;
  kind: ApiMovementKind;
  /** Always positive — the direction is in `kind`. */
  quantity: number;
  rate: number;
  movedOn: string;
  byUserId: number | null;
  byUserName: string | null;
  target: string | null;
  projectId: number | null;
  partyId: number | null;
  partyName: string | null;
  issuedToUserId: number | null;
  issuedToName: string | null;
  counterWarehouseId: number | null;
  counterWarehouseCode: string | null;
  sourceDocNo: string | null;
  requestId: number | null;
  note: string | null;
}

export interface ApiMovementInput {
  warehouseId: number;
  itemId: number;
  kind: Exclude<ApiMovementKind, "TRANSFER_IN" | "TRANSFER_OUT">;
  quantity: number;
  rate: number;
  movedOn: string;
  target: string | null;
  projectId: number | null;
  partyId: number | null;
  issuedToUserId: number | null;
  sourceDocNo: string | null;
  /** Set when this issue fills a request — the line's issued quantity moves with it. */
  requestId: number | null;
  note: string | null;
}

export const getMovements = (warehouseId?: number) =>
  apiRequest<ApiMovement[]>(`${BASE}/movements${warehouseId ? `?warehouseId=${warehouseId}` : ""}`);

export const recordMovement = (body: ApiMovementInput) =>
  apiRequest<ApiMovement>(`${BASE}/movements`, { method: "POST", body });

/** Two rows, one number, one transaction — the two stores can never disagree about what moved. */
export const transferStock = (body: {
  fromWarehouseId: number;
  toWarehouseId: number;
  itemId: number;
  quantity: number;
  rate: number;
  movedOn: string;
  note: string | null;
}) => apiRequest<void>(`${BASE}/movements/transfer`, { method: "POST", body });

// ---------------------------------------------------------------- requests

export type ApiRequestStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "PARTIAL"
  | "ISSUED"
  | "REJECTED";

export interface ApiRequestLine {
  id: number;
  itemId: number;
  itemName: string | null;
  unit: string | null;
  quantity: number;
  issuedQuantity: number;
  /** What the store holds right now, so a decision can be made without leaving the screen. */
  onHand: number;
}

export interface ApiMaterialRequest {
  id: number;
  number: string;
  warehouseId: number;
  warehouseCode: string | null;
  projectId: number | null;
  requestedByUserId: number | null;
  requestedByName: string | null;
  raisedOn: string;
  neededBy: string | null;
  status: ApiRequestStatus;
  decidedByUserId: number | null;
  decidedByName: string | null;
  decisionNote: string | null;
  note: string | null;
  lines: ApiRequestLine[];
}

export interface ApiMaterialRequestInput {
  warehouseId: number;
  projectId: number | null;
  neededBy: string | null;
  note: string | null;
  lines: { itemId: number; quantity: number }[];
}

export const getRequests = (warehouseId?: number) =>
  apiRequest<ApiMaterialRequest[]>(`${BASE}/requests${warehouseId ? `?warehouseId=${warehouseId}` : ""}`);

export const createRequest = (body: ApiMaterialRequestInput) =>
  apiRequest<ApiMaterialRequest>(`${BASE}/requests`, { method: "POST", body });

export const updateRequest = (id: number, body: ApiMaterialRequestInput) =>
  apiRequest<ApiMaterialRequest>(`${BASE}/requests/${id}`, { method: "PUT", body });

export const decideRequest = (id: number, action: "APPROVE" | "REJECT", note?: string) =>
  apiRequest<ApiMaterialRequest>(`${BASE}/requests/${id}/decide`, {
    method: "POST",
    body: { action, note: note ?? null },
  });

export const deleteRequest = (id: number) =>
  apiRequest<void>(`${BASE}/requests/${id}`, { method: "DELETE" });

// ---------------------------------------------------------------- checkouts

export interface ApiCheckout {
  itemId: number;
  itemName: string | null;
  warehouseId: number;
  warehouseCode: string | null;
  issuedToUserId: number | null;
  issuedToName: string | null;
  projectId: number | null;
  issuedQuantity: number;
  returnedQuantity: number;
  outstanding: number;
  issuedOn: string;
  daysOut: number;
}

export const getCheckouts = (warehouseId?: number) =>
  apiRequest<ApiCheckout[]>(`${BASE}/checkouts${warehouseId ? `?warehouseId=${warehouseId}` : ""}`);
