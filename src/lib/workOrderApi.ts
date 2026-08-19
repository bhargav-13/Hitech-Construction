import { apiRequest } from "./api";

/**
 * Mirrors procurement-service's work orders — subcontracts.
 *
 * An RFQ buys material; a work order buys *work*. Same spine (a party, priced lines, a total that
 * ends in a Vyapar bill), three differences that shape this file:
 *
 *  - **Quantity is measured.** `dimN/L/W/H` are the four numbers a site clerk writes down, and the
 *    server derives `quantity` from their product whenever any of them is given. Send the
 *    dimensions and let it compute; a `quantity` sent alongside them is ignored on purpose.
 *  - **Billed in instalments.** `bills` is a running list, and `outstanding` is what is left of the
 *    order value. It can go negative — a subcontractor who has billed past his order should show
 *    that, not be clamped to zero.
 *  - **We issue him material.** `materialSummary` rolls the movements up per material, because the
 *    question on site is "he has had 200 bags, how many does he still hold".
 *
 * Every derived figure is computed server-side, so twenty rows of the list agree to the paisa with
 * the detail screen.
 */

export type WorkOrderStatus = "Draft" | "Approved" | "In Progress" | "Completed" | "Closed";

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "Draft",
  "Approved",
  "In Progress",
  "Completed",
  "Closed",
];

export interface WorkOrderItem {
  id: number;
  itemId: number | null;
  itemName: string;
  description: string | null;
  unit: string | null;
  /** N × L × W × H, as measured. Null where the line was never measured that way. */
  dimN: number | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  quantity: number;
  rate: number;
  amount: number;
  progressPercent: number;
  sortOrder: number;
}

export interface SubconBill {
  id: number;
  billNo: string | null;
  billDate: string | null;
  amount: number;
  /** Held back on the face of the bill. */
  retention: number;
  /** Value of material we issued him, recovered on this bill. */
  materialRecovery: number;
  /** What he is actually paid: amount less retention and recovery. */
  netPayable: number;
  note: string | null;
  /** The Vyapar purchase bill this became, once booked. */
  vyaparInvoiceId: number | null;
}

export type MaterialMovement = "ISSUE" | "RETURN" | "CONSUMED";

export interface SubconMaterial {
  id: number;
  itemId: number | null;
  itemName: string;
  unit: string | null;
  movement: MaterialMovement;
  quantity: number;
  rate: number;
  movedOn: string | null;
  note: string | null;
}

/** One material rolled up across its movements — what the Materials tab actually shows. */
export interface SubconMaterialSummary {
  itemName: string;
  unit: string | null;
  totalIssued: number;
  returned: number;
  consumed: number;
  /** What he still holds. */
  inHand: number;
  /** Value of what was issued, at the recovery rate. */
  issuedValue: number;
}

export interface WorkOrder {
  id: number;
  woNo: string;
  title: string;
  projectId: number | null;
  vendorPartyId: number;
  vendorName: string;
  vendorPhone: string | null;
  status: WorkOrderStatus;
  woDate: string | null;
  startDate: string | null;
  endDate: string | null;
  taxPercent: number;
  discount: number;
  charges: number;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  terms: string | null;
  notes: string | null;
  // ---- derived, server-side ----
  itemSubTotal: number;
  taxAmount: number;
  orderValue: number;
  /** Weighted by line value, not an average of percentages. */
  physicalProgress: number;
  workDoneValue: number;
  billedValue: number;
  /** Order value not yet billed. Negative = billed past the order. */
  outstanding: number;
  retentionHeld: number;
  materialIssuedValue: number;
  items: WorkOrderItem[];
  bills: SubconBill[];
  materials: SubconMaterial[];
  materialSummary: SubconMaterialSummary[];
}

export interface WorkOrderItemInput {
  /** Present when editing an existing line — keeps the progress recorded against it. */
  id?: number;
  itemId?: number | null;
  itemName: string;
  description?: string | null;
  unit?: string | null;
  dimN?: number | null;
  dimL?: number | null;
  dimW?: number | null;
  dimH?: number | null;
  /** Used only when no dimension is given; the measurement wins otherwise. */
  quantity?: number | null;
  rate?: number | null;
  progressPercent?: number | null;
}

export interface WorkOrderInput {
  title: string;
  woNo?: string | null;
  projectId?: number | null;
  vendorPartyId: number;
  status?: WorkOrderStatus;
  woDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  taxPercent?: number;
  discount?: number;
  charges?: number;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  terms?: string | null;
  notes?: string | null;
  items: WorkOrderItemInput[];
}

export interface SubconBillInput {
  id?: number;
  billNo?: string | null;
  billDate?: string | null;
  amount: number;
  retention?: number;
  materialRecovery?: number;
  note?: string | null;
  vyaparInvoiceId?: number | null;
}

export interface SubconMaterialInput {
  id?: number;
  itemId?: number | null;
  itemName: string;
  unit?: string | null;
  movement?: MaterialMovement;
  quantity: number;
  rate?: number;
  movedOn?: string | null;
  note?: string | null;
}

const BASE = "/api/v1/procurement/work-orders";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const parts = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return parts.length ? `?${parts.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
};

export const getWorkOrders = (projectId?: number) => apiRequest<WorkOrder[]>(`${BASE}${qs({ projectId })}`);
export const getWorkOrder = (id: number) => apiRequest<WorkOrder>(`${BASE}/${id}`);

export const createWorkOrder = (body: WorkOrderInput) => apiRequest<WorkOrder>(BASE, { method: "POST", body });
export const updateWorkOrder = (id: number, body: WorkOrderInput) =>
  apiRequest<WorkOrder>(`${BASE}/${id}`, { method: "PUT", body });
export const deleteWorkOrder = (id: number) => apiRequest<void>(`${BASE}/${id}`, { method: "DELETE" });

/** Record how much of one line is physically done. The order's progress is derived from these. */
export const setItemProgress = (id: number, itemId: number, progressPercent: number) =>
  apiRequest<WorkOrder>(`${BASE}/${id}/items/${itemId}/progress`, { method: "PUT", body: { progressPercent } });

export const saveSubconBill = (id: number, body: SubconBillInput) =>
  apiRequest<WorkOrder>(`${BASE}/${id}/bills`, { method: "PUT", body });
export const deleteSubconBill = (id: number, billId: number) =>
  apiRequest<WorkOrder>(`${BASE}/${id}/bills/${billId}`, { method: "DELETE" });

export const saveSubconMaterial = (id: number, body: SubconMaterialInput) =>
  apiRequest<WorkOrder>(`${BASE}/${id}/materials`, { method: "PUT", body });
export const deleteSubconMaterial = (id: number, materialId: number) =>
  apiRequest<WorkOrder>(`${BASE}/${id}/materials/${materialId}`, { method: "DELETE" });

/**
 * The measured quantity, mirrored from the server so the form can show it as it is typed.
 *
 * A blank box among filled ones is a 1, not a zero: `4 × 12.5` with no width or height is 50, which
 * is how a running-metre line gets measured. No dimensions at all means the row was not measured
 * and whatever quantity was typed stands.
 */
export function measuredQuantity(d: {
  dimN?: number | null;
  dimL?: number | null;
  dimW?: number | null;
  dimH?: number | null;
}): number | null {
  const dims = [d.dimN, d.dimL, d.dimW, d.dimH];
  if (!dims.some((x) => x != null && x > 0)) return null;
  return dims.reduce<number>((q, x) => q * (x != null && x > 0 ? x : 1), 1);
}
