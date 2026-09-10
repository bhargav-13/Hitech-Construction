"use client";

import { create } from "zustand";
import * as api from "./warehouseApi";
import type {
  Checkout,
  MaterialRequest,
  StockMovement,
  StockSetting,
  Warehouse,
  WarehouseMember,
} from "./warehouseTypes";
import { MOVEMENT_META } from "./warehouseTypes";

/**
 * Warehouse state, backed by warehouse-service.
 *
 * This used to hold the data in localStorage while the screens were being built. It now holds a
 * cache of what the server said, and the shape did not have to change to make that true: every list
 * was already flat and id-keyed, and every figure was already derived from the movement rows rather
 * than stored. Swapping the seed for fetches moved no component, which was the point of building it
 * that way.
 *
 * Three things about how it works now:
 *
 *  - **Ids are strings here and numbers on the wire.** The screens were written against string ids,
 *    so the conversion happens at this edge and nowhere else. Item ids stay numbers on both sides —
 *    they are Vyapar item ids and were always numeric.
 *  - **Every mutator writes through and re-reads.** No optimistic local edit: the server applies
 *    rules the client does not know (it can refuse an issue that would go negative, and it moves a
 *    request from APPROVED to PARTIAL on its own), so the honest thing after a write is to ask what
 *    actually happened rather than to assume.
 *  - **A rejected write throws.** Callers surface it; nothing here swallows a refusal, because a
 *    refusal is usually the module working correctly and the person needs to read it.
 *
 * The one rule worth restating: **stock is never assigned, only moved.** There is no `setStock` on
 * either side. If a count disagrees with the book you post an ADJUSTMENT with a reason and the
 * ledger keeps both facts. That is the whole difference between a store you can audit and a
 * spreadsheet.
 */

const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/** null and "" both mean "no id" coming back from the server; everything else is a number. */
const numOrNull = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: number | null): string | null => (v === null ? null : String(v));

// ---------------------------------------------------------------- mapping

function toWarehouse(w: api.ApiWarehouse): Warehouse {
  return {
    id: String(w.id),
    code: w.code,
    name: w.name,
    kind: w.kind,
    projectId: strOrNull(w.projectId),
    address: w.address,
    inChargeUserId: strOrNull(w.inChargeUserId),
    isActive: w.isActive,
  };
}

function toMember(m: api.ApiMember): WarehouseMember {
  return {
    id: String(m.id),
    warehouseId: String(m.warehouseId),
    userId: String(m.userId),
    role: m.role,
  };
}

function toSetting(s: api.ApiStockSetting): StockSetting {
  return {
    id: String(s.id),
    warehouseId: String(s.warehouseId),
    itemId: s.itemId,
    reorderLevel: s.reorderLevel ?? 0,
    binLocation: s.binLocation,
  };
}

function toMovement(m: api.ApiMovement): StockMovement {
  return {
    id: String(m.id),
    number: m.number,
    warehouseId: String(m.warehouseId),
    itemId: m.itemId,
    kind: m.kind,
    quantity: m.quantity,
    rate: m.rate ?? 0,
    movedOn: m.movedOn,
    byUserId: strOrNull(m.byUserId),
    target: (m.target as StockMovement["target"]) ?? null,
    projectId: strOrNull(m.projectId),
    partyId: m.partyId,
    issuedToUserId: strOrNull(m.issuedToUserId),
    counterWarehouseId: strOrNull(m.counterWarehouseId),
    sourceDocNo: m.sourceDocNo,
    requestId: strOrNull(m.requestId),
    note: m.note,
  };
}

function toRequest(r: api.ApiMaterialRequest): MaterialRequest {
  return {
    id: String(r.id),
    number: r.number,
    warehouseId: String(r.warehouseId),
    projectId: strOrNull(r.projectId),
    requestedByUserId: strOrNull(r.requestedByUserId),
    raisedOn: r.raisedOn,
    neededBy: r.neededBy,
    status: r.status,
    decidedByUserId: strOrNull(r.decidedByUserId),
    decisionNote: r.decisionNote,
    note: r.note,
    lines: r.lines.map((l) => ({
      id: String(l.id),
      itemId: l.itemId,
      quantity: l.quantity,
      issuedQuantity: l.issuedQuantity,
    })),
  };
}

/** The full write shape the server wants for a store, built from what we hold plus a patch. */
function warehouseInput(w: Warehouse): api.ApiWarehouseInput {
  return {
    code: w.code,
    name: w.name,
    // TRANSIT is the migration's to create, and the server refuses it here — a second in-transit
    // store is one that transfers would not use.
    kind: w.kind === "TRANSIT" ? "SITE" : w.kind,
    projectId: numOrNull(w.projectId),
    address: w.address,
    inChargeUserId: numOrNull(w.inChargeUserId),
    isActive: w.isActive,
  };
}

// ---------------------------------------------------------------- store

interface WarehouseState {
  warehouses: Warehouse[];
  members: WarehouseMember[];
  settings: StockSetting[];
  movements: StockMovement[];
  requests: MaterialRequest[];

  /**
   * This member's standing in each store they can reach, keyed by warehouse id — the server's
   * answer, not one reconstructed here.
   *
   * It has to come from the server because one of the two ways to get standing leaves no membership
   * row: whoever runs a site's project can read that site's store. Working it out from `members`
   * would show those people a locked screen they are in fact allowed to read.
   */
  access: Record<string, WarehouseMember["role"]>;

  /** False until the first load finishes, so a screen can tell "empty" from "not asked yet". */
  loaded: boolean;
  loading: boolean;
  /** Set when the last load failed — the shell shows it rather than an empty store. */
  error: string | null;

  /** Fetches everything this member may see. Safe to call on every mount. */
  load: () => Promise<void>;

  // ---- warehouses ----
  addWarehouse: (w: Omit<Warehouse, "id">) => Promise<void>;
  updateWarehouse: (id: string, patch: Partial<Warehouse>) => Promise<void>;
  removeWarehouse: (id: string) => Promise<void>;

  // ---- access ----
  setMemberRole: (
    warehouseId: string,
    userId: string,
    role: WarehouseMember["role"] | null,
  ) => Promise<void>;

  // ---- per-store item settings ----
  setStockSetting: (warehouseId: string, itemId: number, patch: Partial<StockSetting>) => Promise<void>;

  // ---- movements ----
  record: (m: Omit<StockMovement, "id" | "number">) => Promise<void>;
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
  }) => Promise<void>;

  // ---- requests ----
  saveRequest: (r: MaterialRequest) => Promise<void>;
  setRequestStatus: (id: string, status: MaterialRequest["status"], note?: string) => Promise<void>;
  removeRequest: (id: string) => Promise<void>;
}

export const useWarehouseStore = create<WarehouseState>()((set, get) => ({
  warehouses: [],
  members: [],
  settings: [],
  movements: [],
  requests: [],
  access: {},
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      // The lists are fetched together; members need the store ids first, so they follow.
      const [warehouses, settings, movements, requests, access] = await Promise.all([
        api.getWarehouses(),
        api.getStockSettings(),
        api.getMovements(),
        api.getRequests(),
        api.getMyAccess(),
      ]);

      const members = (
        await Promise.all(
          warehouses.map((w) =>
            // A store whose team this member may not read is not a failed load — it is one team
            // they cannot see, and the rest of the module still works without it.
            api.getMembers(w.id).catch(() => [] as api.ApiMember[]),
          ),
        )
      ).flat();

      set({
        warehouses: warehouses.map(toWarehouse),
        members: members.map(toMember),
        settings: settings.map(toSetting),
        movements: movements.map(toMovement),
        requests: requests.map(toRequest),
        access,
        loaded: true,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : "Couldn't load the warehouse.",
      });
    }
  },

  // ---- warehouses ----

  addWarehouse: async (w) => {
    await api.createWarehouse(warehouseInput({ ...w, id: "" }));
    await get().load();
  },

  updateWarehouse: async (id, patch) => {
    const current = get().warehouses.find((w) => w.id === id);
    if (!current) return;
    await api.updateWarehouse(Number(id), warehouseInput({ ...current, ...patch }));
    await get().load();
  },

  /**
   * The server deactivates rather than deletes once a store has history — its movements are what
   * explain today's stock in the stores it transferred to, and deleting them would leave those
   * balances unexplainable. Either way the answer comes back in the reload.
   */
  removeWarehouse: async (id) => {
    await api.deleteWarehouse(Number(id));
    await get().load();
  },

  // ---- access ----

  setMemberRole: async (warehouseId, userId, role) => {
    await api.setMember(Number(warehouseId), Number(userId), role);
    await get().load();
  },

  // ---- settings ----

  setStockSetting: async (warehouseId, itemId, patch) => {
    const existing = get().settings.find((s) => s.warehouseId === warehouseId && s.itemId === itemId);
    await api.saveStockSetting({
      warehouseId: Number(warehouseId),
      itemId,
      reorderLevel: patch.reorderLevel ?? existing?.reorderLevel ?? 0,
      binLocation: patch.binLocation ?? existing?.binLocation ?? null,
    });
    await get().load();
  },

  // ---- movements ----

  record: async (m) => {
    if (m.kind === "TRANSFER_IN" || m.kind === "TRANSFER_OUT") {
      throw new Error("Use transfer() — a transfer is one act with two sides.");
    }
    await api.recordMovement({
      warehouseId: Number(m.warehouseId),
      itemId: m.itemId,
      kind: m.kind,
      quantity: m.quantity,
      rate: m.rate,
      movedOn: m.movedOn,
      target: m.target,
      projectId: numOrNull(m.projectId),
      partyId: m.partyId,
      issuedToUserId: numOrNull(m.issuedToUserId),
      sourceDocNo: m.sourceDocNo,
      requestId: numOrNull(m.requestId),
      note: m.note,
    });
    // Reloaded rather than appended: an issue against a request also moves that request's status,
    // and guessing which way is how the two end up disagreeing.
    await get().load();
  },

  transfer: async ({ fromWarehouseId, toWarehouseId, itemId, quantity, rate, movedOn, note }) => {
    await api.transferStock({
      fromWarehouseId: Number(fromWarehouseId),
      toWarehouseId: Number(toWarehouseId),
      itemId,
      quantity,
      rate,
      movedOn,
      note,
    });
    await get().load();
  },

  // ---- requests ----

  saveRequest: async (r) => {
    const body = {
      warehouseId: Number(r.warehouseId),
      projectId: numOrNull(r.projectId),
      neededBy: r.neededBy,
      note: r.note,
      lines: r.lines
        .filter((l) => l.itemId > 0 && l.quantity > 0)
        .map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    };
    // A blank id is a request that has never been saved — the numbering is the server's to assign.
    if (r.id) await api.updateRequest(Number(r.id), body);
    else await api.createRequest(body);
    await get().load();
  },

  /**
   * Approve or reject. The other statuses are not decisions anyone makes — PARTIAL and ISSUED are
   * what the server sets as material actually leaves the store, so there is nothing to send.
   */
  setRequestStatus: async (id, status, note) => {
    if (status !== "APPROVED" && status !== "REJECTED") return;
    await api.decideRequest(Number(id), status === "APPROVED" ? "APPROVE" : "REJECT", note);
    await get().load();
  },

  removeRequest: async (id) => {
    await api.deleteRequest(Number(id));
    await get().load();
  },
}));

/**
 * Shows a refused write to the person who attempted it.
 *
 * The server's refusals are written to be read — "Central Store holds 300, you cannot move more
 * than that", "a decided request is a record". Swallowing one leaves a button that silently does
 * nothing, which is the worst of the three possible outcomes; the person retries, assumes the app
 * is broken, and works around it on paper.
 */
export function reportRefusal(e: unknown) {
  alert(e instanceof Error ? e.message : "The store refused that change.");
}

// ---------------------------------------------------------------- derivations
//
// Plain functions over the arrays rather than store selectors, and the same arithmetic the server
// does — which is now a checked claim rather than an intention: WarehouseFlowIntegrationTest drives
// the same figures over HTTP and asserts them.

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
