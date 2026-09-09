/**
 * The Warehouse domain.
 *
 * Three decisions shape everything here, and they are the ones that separate this from the demo
 * module it replaces:
 *
 * 1. **Stock is per location, and the catalogue is shared.** An item is a Vyapar item — the same
 *    record the invoice grid, the RFQ and the purchase bill use. Warehouse does not keep its own
 *    item names. What it keeps is *where* the stock is: the central store holds 400 bags, Pedak Road
 *    holds 90. Vyapar's single `stockQty` is the sum of those, not a rival figure.
 *
 * 2. **Stock on hand is derived, never stored.** There is no editable "current quantity" anywhere.
 *    Every change is a {@link StockMovement} — received, issued, transferred, returned, adjusted —
 *    and the balance is the opening figure plus the movements. That is what makes a store
 *    auditable: you can always answer "why is it 90?" by reading the rows, and nobody can quietly
 *    type over a shortage.
 *
 * 3. **Access has two layers.** The module permission (WAREHOUSE:VIEW / CREATE / EDIT / APPROVE)
 *    says what a person may *do*; {@link WarehouseMember} says which stores they may do it *in*. A
 *    store keeper at the central store must not be able to issue from a site store three hours
 *    away, and today nothing would stop them.
 */

import type { Item } from "./vyaparApi";

// ---------------------------------------------------------------- locations

/**
 * CENTRAL — the main store, not tied to a site. SITE — a store on a project, which is where most
 * material actually sits. TRANSIT is not a place anyone visits: it holds stock that has left one
 * store and not yet been received at another, so a lorry-load in transit is never invisible.
 */
export type WarehouseKind = "CENTRAL" | "SITE" | "TRANSIT";

export interface Warehouse {
  id: string;
  /** Short code used on documents — "CS", "PDK". Unique. */
  code: string;
  name: string;
  kind: WarehouseKind;
  /** Site stores belong to a project; a central store does not. */
  projectId: string | null;
  address: string | null;
  /** The member accountable for what is in it. Not the same as who may issue from it. */
  inChargeUserId: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------- access

/**
 * What a member may do inside one store.
 *
 * Deliberately a small ladder rather than a permission matrix. The module permission already
 * decides whether someone can touch Warehouse at all; this only answers "which stores, and how
 * deeply" — and three answers cover every real case in this business.
 */
export type WarehouseRole = "KEEPER" | "SUPERVISOR" | "VIEWER";

export const WAREHOUSE_ROLE_META: Record<WarehouseRole, { label: string; hint: string }> = {
  KEEPER: {
    label: "Store Keeper",
    hint: "Receives, issues and transfers stock in this store. The person holding the keys.",
  },
  SUPERVISOR: {
    label: "Supervisor",
    hint: "Everything a keeper can do, plus approving requests and signing off stock adjustments.",
  },
  VIEWER: {
    label: "Viewer",
    hint: "Reads stock and movements. Cannot change anything.",
  },
};

export interface WarehouseMember {
  id: string;
  warehouseId: string;
  userId: string;
  role: WarehouseRole;
}

// ---------------------------------------------------------------- items

/**
 * A catalogue item as this module needs it, plus the per-store settings the catalogue has nowhere
 * to put: what counts as "low" *here*, and where on the racks it lives.
 *
 * Reorder level is per store on purpose. Two hundred bags is comfortable at the central store and
 * a crisis at a site that gets one delivery a week.
 */
export interface StockSetting {
  id: string;
  warehouseId: string;
  itemId: number;
  reorderLevel: number;
  /** Free text — "Rack B3", "Yard, north end". */
  binLocation: string | null;
}

/** An item resolved against one store: the catalogue record plus what is on hand there. */
export interface StockRow {
  item: Item;
  warehouseId: string;
  onHand: number;
  /** Committed to an approved-but-not-yet-issued request. */
  reserved: number;
  /** onHand − reserved: what can actually be promised to the next request. */
  available: number;
  reorderLevel: number;
  binLocation: string | null;
  /** onHand × the item's purchase price. */
  value: number;
}

// ---------------------------------------------------------------- movements

/**
 * Why stock moved.
 *
 * RECEIPT and ISSUE are the two that carry money and paperwork. TRANSFER_OUT/TRANSFER_IN are a pair
 * — one document, two rows, so both stores' ledgers read correctly and the difference between them
 * is what is on the lorry. RETURN is a returnable coming back. ADJUSTMENT is the honest admission
 * that a count disagreed with the book, and it always carries a reason.
 */
export type MovementKind =
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "RETURN"
  | "ADJUSTMENT";

export const MOVEMENT_META: Record<MovementKind, { label: string; sign: 1 | -1; chip: string }> = {
  RECEIPT: { label: "Received", sign: 1, chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  ISSUE: { label: "Issued", sign: -1, chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  TRANSFER_OUT: { label: "Transfer out", sign: -1, chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  TRANSFER_IN: { label: "Transfer in", sign: 1, chip: "bg-cyan-50 text-cyan-700 ring-cyan-600/20" },
  RETURN: { label: "Returned", sign: 1, chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  ADJUSTMENT: { label: "Adjusted", sign: 1, chip: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

/** Who or what the stock went to. An issue always has one; a receipt never does. */
export type IssueTarget = "PROJECT" | "SUBCONTRACTOR" | "WORKER" | "SCRAP";

export const ISSUE_TARGET_META: Record<IssueTarget, { label: string; hint: string }> = {
  PROJECT: { label: "Site / project", hint: "Consumed on the works — the usual case." },
  SUBCONTRACTOR: {
    label: "Subcontractor",
    hint: "Issued against a work order, and recoverable from his bill.",
  },
  WORKER: { label: "Worker", hint: "A returnable handed to a person, expected back." },
  SCRAP: { label: "Scrap / written off", hint: "Damaged or unusable. Leaves stock, recovers nothing." },
};

export interface StockMovement {
  id: string;
  /** Running document number — GRN-2026-0007, ISS-2026-0041. */
  number: string;
  warehouseId: string;
  itemId: number;
  kind: MovementKind;
  /** Always positive; {@link MOVEMENT_META} carries the direction. */
  quantity: number;
  /** Rate at which it came in or is recovered. Zero on a free issue. */
  rate: number;
  movedOn: string;
  /** Who recorded it. */
  byUserId: string | null;

  // ---- where it came from / went to ----
  target: IssueTarget | null;
  projectId: string | null;
  /** Vyapar party — the supplier on a receipt, the subcontractor on an issue. */
  partyId: number | null;
  /** The person holding a returnable. */
  issuedToUserId: string | null;
  /** The other store on a transfer. */
  counterWarehouseId: string | null;

  // ---- what it answers to ----
  /** The Vyapar purchase order or bill this receipt came in against. */
  sourceDocNo: string | null;
  /** The request this issue satisfies. */
  requestId: string | null;
  /** Supplier's challan / vehicle, or the reason on an adjustment. */
  note: string | null;
}

// ---------------------------------------------------------------- requests

/**
 * A material request — the site asking the store for something. The front of the buying chain: what
 * the store cannot fill becomes an enquiry, and the client already runs sixty of these a month
 * through the tool they have.
 */
export type RequestStatus = "DRAFT" | "PENDING" | "APPROVED" | "PARTIAL" | "ISSUED" | "REJECTED";

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; chip: string }> = {
  DRAFT: { label: "Draft", chip: "bg-gray-100 text-gray-600 ring-gray-500/20" },
  PENDING: { label: "Pending approval", chip: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  APPROVED: { label: "Approved", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  PARTIAL: { label: "Part issued", chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  ISSUED: { label: "Issued", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  REJECTED: { label: "Rejected", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

export interface RequestLine {
  id: string;
  itemId: number;
  quantity: number;
  /** How much of it has actually left the store. */
  issuedQuantity: number;
}

export interface MaterialRequest {
  id: string;
  number: string;
  /** The store being asked. */
  warehouseId: string;
  /** The site asking. */
  projectId: string | null;
  requestedByUserId: string | null;
  raisedOn: string;
  neededBy: string | null;
  status: RequestStatus;
  /** Set on approval or rejection. */
  decidedByUserId: string | null;
  decisionNote: string | null;
  note: string | null;
  lines: RequestLine[];
}

// ---------------------------------------------------------------- checkouts

/**
 * A returnable that is out.
 *
 * Tools, shuttering, safety gear — issued to a person and expected back. Derived from movements
 * rather than stored as its own truth: an ISSUE with a `issuedToUserId` opens one, and RETURNs
 * against it close it. What matters on screen is what is still out and how long it has been.
 */
export interface Checkout {
  itemId: number;
  warehouseId: string;
  issuedToUserId: string | null;
  projectId: string | null;
  issuedQuantity: number;
  returnedQuantity: number;
  outstanding: number;
  issuedOn: string;
  /** Whole days since it went out, for the ageing column. */
  daysOut: number;
}
