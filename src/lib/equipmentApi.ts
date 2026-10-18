import { apiRequest } from "./api";

// Mirrors warehouse-service com.hitech.erp.equipment — the machines the sites run (mostly hired),
// where each is deployed and on what rent, and the daily usage log. Hire bills stay in Vyapar.

const BASE = "/api/v1/equipment";

export type Ownership = "RENTED" | "OWNED";

export interface Equipment {
  id: number;
  name: string;
  code: string | null;
  ownership: Ownership;
  /** What a usage entry measures — "hours" or "km". */
  unit: string;
  fuel: string | null;
  vendorPartyId: number | null;
  vendorName: string | null;
  notes: string | null;
  active: boolean;
  /** Projects it is deployed on now. */
  activeProjectIds: number[];
  usageEntries: number;
  usedHours: number;
  distance: number;
  lastUsedOn: string | null;
}

export interface Deployment {
  id: number;
  projectId: number | null;
  vendorPartyId: number | null;
  vendorName: string | null;
  rentAmount: number;
  rentType: string | null;
  startedOn: string | null;
  endedOn: string | null;
  active: boolean;
}

export interface UsageEntry {
  id: number;
  projectId: number | null;
  usedOn: string;
  startAt: string | null;
  stopAt: string | null;
  usedHours: number;
  distance: number;
  trips: number;
  fuelQty: number;
  note: string | null;
  enteredBy: string | null;
}

export interface EquipmentDetail {
  equipment: Equipment;
  deployments: Deployment[];
  usage: UsageEntry[];
}

export interface EquipmentBody {
  name: string;
  code?: string | null;
  ownership: Ownership;
  unit: string;
  fuel?: string | null;
  vendorPartyId?: number | null;
  notes?: string | null;
  active?: boolean;
}

export interface DeploymentBody {
  projectId: number;
  vendorPartyId?: number | null;
  rentAmount?: number;
  rentType?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  active?: boolean;
}

export interface UsageBody {
  projectId: number | null;
  usedOn: string;
  /** "2026-10-07T08:00", IST wall clock. */
  startAt?: string | null;
  stopAt?: string | null;
  /** Blank = worked out from start/stop. */
  usedHours?: number | null;
  distance?: number | null;
  trips?: number | null;
  fuelQty?: number | null;
  note?: string | null;
}

const q = (projectId?: number | null) => (projectId ? `?projectId=${projectId}` : "");

export const listEquipment = (projectId?: number | null) => apiRequest<Equipment[]>(`${BASE}${q(projectId)}`);
export const getEquipment = (id: number, projectId?: number | null) => apiRequest<EquipmentDetail>(`${BASE}/${id}${q(projectId)}`);
export const createEquipment = (body: EquipmentBody) => apiRequest<Equipment>(BASE, { method: "POST", body });
export const updateEquipment = (id: number, body: EquipmentBody) => apiRequest<Equipment>(`${BASE}/${id}`, { method: "PUT", body });
export const deleteEquipment = (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });

export const deployEquipment = (id: number, body: DeploymentBody) =>
  apiRequest<Deployment>(`${BASE}/${id}/deployments`, { method: "POST", body });
export const updateDeployment = (deploymentId: number, body: DeploymentBody) =>
  apiRequest<Deployment>(`${BASE}/deployments/${deploymentId}`, { method: "PUT", body });

export const logUsage = (id: number, body: UsageBody) => apiRequest<UsageEntry>(`${BASE}/${id}/usage`, { method: "POST", body });
export const deleteUsage = (usageId: number) => apiRequest<void>(`${BASE}/usage/${usageId}`, { method: "DELETE" });
