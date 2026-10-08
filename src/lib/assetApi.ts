import { apiRequest } from "./api";

// Mirrors warehouse-service com.hitech.erp.asset — the Asset module (Onsite's Asset Management):
// owned, lendable things, who holds how many on which project, and the timeline of every hand-over.

const BASE = "/api/v1/assets";

export type HolderKind = "USER" | "PARTY";
export type AssetEventKind =
  | "ASSIGNED"
  | "RETURNED"
  | "TRANSFERRED_OUT"
  | "TRANSFERRED_IN"
  | "STOCK_UPDATED"
  | "ASSIGNMENT_EDITED";

export interface AssetType {
  id: number;
  name: string;
  assetCount: number;
}

export interface Asset {
  id: number;
  /** "AS-12". */
  code: string;
  codePrefix: string;
  codeNumber: number;
  name: string;
  typeId: number | null;
  typeName: string | null;
  unitRate: number;
  totalQty: number;
  assignedQty: number;
  repairQty: number;
  damagedQty: number;
  /** total − repair − damaged − assigned: free to hand out now. */
  availableQty: number;
  description: string | null;
  active: boolean;
  holderCount: number;
}

export interface AssetAssignment {
  id: number;
  assetId: number;
  projectId: number | null;
  holderKind: HolderKind;
  holderUserId: number | null;
  holderPartyId: number | null;
  holderName: string;
  qty: number;
  assignedAt: string;
  open: boolean;
}

export interface AssetEvent {
  id: number;
  assignmentId: number | null;
  kind: AssetEventKind;
  qty: number;
  projectId: number | null;
  holderName: string | null;
  happenedAt: string;
  note: string | null;
  byName: string | null;
}

export interface AssetDetail {
  asset: Asset;
  holders: AssetAssignment[];
  events: AssetEvent[];
}

export interface HeldAsset {
  assignmentId: number;
  assetId: number;
  assetCode: string;
  assetName: string;
  unitRate: number;
  qty: number;
  projectId: number | null;
  assignedAt: string;
}

export interface AssetBody {
  codePrefix?: string;
  codeNumber?: number | null;
  name: string;
  typeId?: number | null;
  unitRate?: number;
  totalQty?: number;
  description?: string | null;
  active?: boolean;
}

/** Who is taking it, and where. A staff member (USER) or a Vyapar party (PARTY). */
export interface HolderBody {
  projectId: number | null;
  holderKind: HolderKind;
  holderUserId?: number | null;
  holderPartyId?: number | null;
}

export const listAssetTypes = () => apiRequest<AssetType[]>(`${BASE}/types`);
export const createAssetType = (name: string) => apiRequest<AssetType>(`${BASE}/types`, { method: "POST", body: { name } });
export const renameAssetType = (id: number, name: string) =>
  apiRequest<AssetType>(`${BASE}/types/${id}`, { method: "PUT", body: { name } });
export const deleteAssetType = (id: number) => apiRequest<void>(`${BASE}/types/${id}`, { method: "DELETE" });

export const listAssets = () => apiRequest<Asset[]>(BASE);
export const getAsset = (id: number) => apiRequest<AssetDetail>(`${BASE}/${id}`);
export const createAsset = (body: AssetBody) => apiRequest<Asset>(BASE, { method: "POST", body });
export const updateAsset = (id: number, body: AssetBody) => apiRequest<Asset>(`${BASE}/${id}`, { method: "PUT", body });
export const deleteAsset = (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });
export const updateAssetStock = (id: number, body: { totalQty: number; repairQty: number; damagedQty: number; note?: string }) =>
  apiRequest<Asset>(`${BASE}/${id}/stock`, { method: "PUT", body });

export const assignAsset = (id: number, body: HolderBody & { qty: number; at?: string; note?: string }) =>
  apiRequest<AssetDetail>(`${BASE}/${id}/assign`, { method: "POST", body });
export const returnAsset = (assignmentId: number, body: { qty: number; at?: string; note?: string }) =>
  apiRequest<AssetDetail>(`${BASE}/assignments/${assignmentId}/return`, { method: "POST", body });
export const transferAsset = (assignmentId: number, body: HolderBody & { qty: number; at?: string; note?: string }) =>
  apiRequest<AssetDetail>(`${BASE}/assignments/${assignmentId}/transfer`, { method: "POST", body });
export const editAssignment = (assignmentId: number, body: { projectId?: number | null; qty?: number; at?: string }) =>
  apiRequest<AssetDetail>(`${BASE}/assignments/${assignmentId}`, { method: "PUT", body });
export const deleteAssignment = (assignmentId: number) =>
  apiRequest<AssetDetail>(`${BASE}/assignments/${assignmentId}`, { method: "DELETE" });

/** What a staff member or party holds right now. */
export const heldAssets = (kind: HolderKind, id: number) =>
  apiRequest<HeldAsset[]>(`${BASE}/held?kind=${kind}&id=${id}`);
