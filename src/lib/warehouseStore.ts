"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Checkout,
  MaterialRequest,
  MovementKind,
  StockMovement,
  StockSetting,
  Warehouse,
  WarehouseMember,
} from "./warehouseTypes";
import { MOVEMENT_META } from "./warehouseTypes";

/**
 * Warehouse state, UI-first.
 *
 * The module is being built screen-first and wired to `warehouse-service` after, so this holds the
 * data locally — but it is shaped as the API will be, not as a screen finds convenient. Every list
 * is flat and id-keyed, every derivation (`stockOf`, `checkouts`) is a function over movements
 * rather than a stored number, and nothing here computes a total that a server would later compute
 * differently. Swapping the seed for fetches should not move a single component.
 *
 * The one rule worth stating: **stock is never assigned, only moved.** There is no `setStock`. If a
 * count disagrees with the book you post an ADJUSTMENT with a reason, and the ledger keeps both
 * facts. That is the whole difference between a store you can audit and a spreadsheet.
 */

const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/** "GRN-2026-0007" — running per prefix, mirroring how the rest of the app numbers documents. */
function nextNumber(prefix: string, existing: string[]): string {
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const used = existing
    .filter((n) => n.startsWith(stem))
    .map((n) => Number(n.slice(stem.length)))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${stem}${String(next).padStart(4, "0")}`;
}

const NUMBER_PREFIX: Record<MovementKind, string> = {
  RECEIPT: "GRN",
  ISSUE: "ISS",
  TRANSFER_OUT: "TRF",
  TRANSFER_IN: "TRF",
  RETURN: "RTN",
  ADJUSTMENT: "ADJ",
};

// ---------------------------------------------------------------- seed
//
// Enough to read every screen as a real store rather than an empty one, and no more. Item ids are
// left to be matched against the live Vyapar catalogue — a seeded item *name* would be a second
// catalogue, which is exactly what this module must not have.

const SEED_WAREHOUSES: Warehouse[] = [
  {
    id: "wh-central",
    code: "CS",
    name: "Central Store — Rajkot",
    kind: "CENTRAL",
    projectId: null,
    address: "150 Feet Ring Road, Rajkot",
    inChargeUserId: null,
    isActive: true,
  },
  {
    id: "wh-transit",
    code: "TRN",
    name: "In Transit",
    kind: "TRANSIT",
    projectId: null,
    address: null,
    inChargeUserId: null,
    isActive: true,
  },
];

interface WarehouseState {
  warehouses: Warehouse[];
  members: WarehouseMember[];
  settings: StockSetting[];
  movements: StockMovement[];
  requests: MaterialRequest[];

  // ---- warehouses ----
  addWarehouse: (w: Omit<Warehouse, "id">) => Warehouse;
  updateWarehouse: (id: string, patch: Partial<Warehouse>) => void;
  removeWarehouse: (id: string) => void;

  // ---- access ----
  setMemberRole: (warehouseId: string, userId: string, role: WarehouseMember["role"] | null) => void;

  // ---- per-store item settings ----
  setStockSetting: (warehouseId: string, itemId: number, patch: Partial<StockSetting>) => void;

  // ---- movements ----
  record: (m: Omit<StockMovement, "id" | "number">) => StockMovement;
  /** A transfer is one act and two rows, so both stores' ledgers read correctly. */
  transfer: (input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    itemId: number;
    quantity: number;
    rate: number;
    movedOn: string;
    note: string | null;
    byUserId: string | null;
  }) => void;
  removeMovement: (id: string) => void;

  // ---- requests ----
  saveRequest: (r: MaterialRequest) => void;
  setRequestStatus: (id: string, status: MaterialRequest["status"], note?: string) => void;
  removeRequest: (id: string) => void;
}

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set, get) => ({
      warehouses: SEED_WAREHOUSES,
      members: [],
      settings: [],
      movements: [],
      requests: [],

      addWarehouse: (w) => {
        const created: Warehouse = { ...w, id: uid("wh") };
        set((s) => ({ warehouses: [...s.warehouses, created] }));
        return created;
      },

      updateWarehouse: (id, patch) =>
        set((s) => ({ warehouses: s.warehouses.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),

      /**
       * Deactivates rather than deletes once a store has history. A store that has issued material
       * cannot be removed without orphaning the movements that explain today's stock elsewhere.
       */
      removeWarehouse: (id) =>
        set((s) => {
          const used = s.movements.some((m) => m.warehouseId === id || m.counterWarehouseId === id);
          return used
            ? { warehouses: s.warehouses.map((w) => (w.id === id ? { ...w, isActive: false } : w)) }
            : {
                warehouses: s.warehouses.filter((w) => w.id !== id),
                members: s.members.filter((m) => m.warehouseId !== id),
                settings: s.settings.filter((x) => x.warehouseId !== id),
              };
        }),

      setMemberRole: (warehouseId, userId, role) =>
        set((s) => {
          const rest = s.members.filter((m) => !(m.warehouseId === warehouseId && m.userId === userId));
          return role === null
            ? { members: rest }
            : { members: [...rest, { id: uid("whm"), warehouseId, userId, role }] };
        }),

      setStockSetting: (warehouseId, itemId, patch) =>
        set((s) => {
          const existing = s.settings.find((x) => x.warehouseId === warehouseId && x.itemId === itemId);
          if (existing) {
            return { settings: s.settings.map((x) => (x.id === existing.id ? { ...x, ...patch } : x)) };
          }
          return {
            settings: [
              ...s.settings,
              { id: uid("ss"), warehouseId, itemId, reorderLevel: 0, binLocation: null, ...patch },
            ],
          };
        }),

      record: (m) => {
        const created: StockMovement = {
          ...m,
          id: uid("mv"),
          number: nextNumber(
            NUMBER_PREFIX[m.kind],
            get().movements.map((x) => x.number),
          ),
        };
        set((s) => ({ movements: [created, ...s.movements] }));
        return created;
      },

      transfer: ({ fromWarehouseId, toWarehouseId, itemId, quantity, rate, movedOn, note, byUserId }) => {
        const number = nextNumber("TRF", get().movements.map((x) => x.number));
        const base = {
          itemId,
          quantity,
          rate,
          movedOn,
          byUserId,
          target: null,
          projectId: null,
          partyId: null,
          issuedToUserId: null,
          sourceDocNo: null,
          requestId: null,
          note,
        };
        // Both halves carry the same number: it is one document, and reconciling a transfer means
        // finding its other end.
        const out: StockMovement = {
          ...base,
          id: uid("mv"),
          number,
          warehouseId: fromWarehouseId,
          kind: "TRANSFER_OUT",
          counterWarehouseId: toWarehouseId,
        };
        const inn: StockMovement = {
          ...base,
          id: uid("mv"),
          number,
          warehouseId: toWarehouseId,
          kind: "TRANSFER_IN",
          counterWarehouseId: fromWarehouseId,
        };
        set((s) => ({ movements: [out, inn, ...s.movements] }));
      },

      removeMovement: (id) => set((s) => ({ movements: s.movements.filter((m) => m.id !== id) })),

      saveRequest: (r) =>
        set((s) => ({
          requests: s.requests.some((x) => x.id === r.id)
            ? s.requests.map((x) => (x.id === r.id ? r : x))
            : [{ ...r, id: r.id || uid("mr"), number: r.number || nextNumber("MR", s.requests.map((x) => x.number)) }, ...s.requests],
        })),

      setRequestStatus: (id, status, note) =>
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id ? { ...r, status, decisionNote: note ?? r.decisionNote } : r,
          ),
        })),

      removeRequest: (id) => set((s) => ({ requests: s.requests.filter((r) => r.id !== id) })),
    }),
    {
      // Bumped on every schema change — persisted state otherwise shadows a changed seed.
      name: "hitech.warehouse.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ---------------------------------------------------------------- derivations
//
// Kept as plain functions over the arrays rather than store selectors: they are the same arithmetic
// the server will do, and a component that reads them is one that will keep working when the data
// arrives over HTTP instead.

/** Signed quantity for one movement — the direction lives in the metadata, not in the number. */
export const signedQty = (m: StockMovement) => m.quantity * MOVEMENT_META[m.kind].sign;

/** What one item stands at in one store: opening (there is none yet) plus every movement. */
export function stockOf(movements: StockMovement[], warehouseId: string, itemId: number): number {
  return movements
    .filter((m) => m.warehouseId === warehouseId && m.itemId === itemId)
    .reduce((total, m) => total + signedQty(m), 0);
}

/** Every item that has ever moved through a store, with its balance. Zero balances included —
 *  "we hold none of this" is a different and more useful answer than the item not being listed. */
export function stockByItem(movements: StockMovement[], warehouseId: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of movements) {
    if (m.warehouseId !== warehouseId) continue;
    out.set(m.itemId, (out.get(m.itemId) ?? 0) + signedQty(m));
  }
  return out;
}

/** The same, across every store — the figure that should agree with Vyapar's `stockQty`. */
export function stockAcrossStores(movements: StockMovement[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of movements) out.set(m.itemId, (out.get(m.itemId) ?? 0) + signedQty(m));
  return out;
}

/**
 * Quantity promised to approved requests that have not been issued yet.
 *
 * Without this, two sites can both be told there are 90 bags and both be right until the first one
 * collects. Reserved stock is the difference between what is on the floor and what can be promised.
 */
export function reservedByItem(requests: MaterialRequest[], warehouseId: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of requests) {
    if (r.warehouseId !== warehouseId) continue;
    if (r.status !== "APPROVED" && r.status !== "PARTIAL") continue;
    for (const l of r.lines) {
      const pending = Math.max(0, l.quantity - l.issuedQuantity);
      if (pending > 0) out.set(l.itemId, (out.get(l.itemId) ?? 0) + pending);
    }
  }
  return out;
}

/**
 * Returnables still with someone.
 *
 * Grouped by item + person + store, because "who has the breaker" is the question, not "which
 * movement row". An issue with `issuedToUserId` opens a checkout; RETURNs against the same three
 * close it down.
 */
export function checkoutsOf(movements: StockMovement[], warehouseId?: string): Checkout[] {
  const key = (m: StockMovement) => `${m.warehouseId}|${m.itemId}|${m.issuedToUserId ?? ""}`;
  const acc = new Map<string, Checkout>();

  for (const m of movements) {
    if (warehouseId && m.warehouseId !== warehouseId) continue;
    if (m.kind !== "ISSUE" && m.kind !== "RETURN") continue;
    // Only a personal issue is a checkout. Material consumed on site is gone, not lent.
    if (m.kind === "ISSUE" && !m.issuedToUserId) continue;

    const k = key(m);
    const row =
      acc.get(k) ??
      ({
        itemId: m.itemId,
        warehouseId: m.warehouseId,
        issuedToUserId: m.issuedToUserId,
        projectId: m.projectId,
        issuedQuantity: 0,
        returnedQuantity: 0,
        outstanding: 0,
        issuedOn: m.movedOn,
        daysOut: 0,
      } satisfies Checkout);

    if (m.kind === "ISSUE") {
      row.issuedQuantity += m.quantity;
      // The oldest issue is the one worth ageing from.
      if (m.movedOn < row.issuedOn) row.issuedOn = m.movedOn;
    } else {
      row.returnedQuantity += m.quantity;
    }
    acc.set(k, row);
  }

  const now = Date.now();
  return [...acc.values()]
    .map((r) => ({
      ...r,
      outstanding: r.issuedQuantity - r.returnedQuantity,
      daysOut: Math.max(0, Math.round((now - new Date(`${r.issuedOn}T00:00:00`).getTime()) / 86_400_000)),
    }))
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.daysOut - a.daysOut);
}

/** A blank request, so every caller starts from the same shape. */
export function emptyRequest(warehouseId: string, projectId: string | null): MaterialRequest {
  return {
    id: "",
    number: "",
    warehouseId,
    projectId,
    requestedByUserId: null,
    raisedOn: today(),
    neededBy: null,
    status: "PENDING",
    decidedByUserId: null,
    decisionNote: null,
    note: null,
    lines: [],
  };
}

export { today as warehouseToday, uid as warehouseUid };
