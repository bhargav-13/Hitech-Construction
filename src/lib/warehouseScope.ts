"use client";

import { create } from "zustand";
import { useWarehouseStore } from "./warehouseStore";
import { useAuthStore } from "./authStore";
import type { Warehouse, WarehouseRole } from "./warehouseTypes";

/**
 * Which store the module is currently looking at, and what the signed-in member may do in it.
 *
 * Kept in a store rather than the URL for the same reason the project scope is: it is a working
 * context, not a destination. A keeper spends the day in one store and should not re-pick it on
 * every screen, and a link someone pastes into WhatsApp should not silently carry their store with
 * it.
 */
interface WarehouseScopeState {
  warehouseId: string;
  setWarehouseId: (id: string) => void;
}

const useScope = create<WarehouseScopeState>((set) => ({
  warehouseId: "all",
  setWarehouseId: (warehouseId) => set({ warehouseId }),
}));

export function useWarehouseScope(): {
  warehouseId: string;
  setWarehouseId: (id: string) => void;
  /** Null on "all stores" — the actions that need one place are disabled there. */
  warehouse: Warehouse | null;
} {
  const warehouseId = useScope((s) => s.warehouseId);
  const setWarehouseId = useScope((s) => s.setWarehouseId);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  return {
    warehouseId,
    setWarehouseId,
    warehouse: warehouses.find((w) => w.id === warehouseId) ?? null,
  };
}

/**
 * What this member may do in this store — the second of the two access layers.
 *
 * The module permission (WAREHOUSE:CREATE, WAREHOUSE:APPROVE …) decides what someone can do at all;
 * this decides where. Both have to agree, and the narrower one wins: a Super Admin with every
 * permission still sees a read-only screen in a store nobody has given them, because "may act
 * anywhere" is a claim no store keeper would accept about their own stock.
 *
 * The one deliberate exception is a **site store on a project the member already runs** — a site
 * supervisor should not need a second grant to see the store on their own site, and making them ask
 * for one is how modules end up with everybody as an admin.
 */
export function useWarehouseRights(warehouseId: string): {
  role: WarehouseRole | null;
  canView: boolean;
  /** Receive, issue, transfer, return. */
  canMove: boolean;
  /** Approve requests and post adjustments. */
  canApprove: boolean;
  /** Add stores and grant access. */
  canAdminister: boolean;
  /** Why the screen is read-only, when it is. */
  reason: string | null;
} {
  const permissions = useAuthStore((s) => s.user?.permissions) ?? [];
  const roleName = useAuthStore((s) => s.user?.role.name) ?? "";
  const members = useWarehouseStore((s) => s.members);
  const meId = String(useAuthStore((s) => s.user?.id) ?? "");

  const isSuperAdmin = roleName.toLowerCase() === "super admin";
  const has = (p: string) => permissions.includes(p);

  const membership = members.find((m) => m.warehouseId === warehouseId && m.userId === meId);
  const role: WarehouseRole | null = membership?.role ?? (isSuperAdmin ? "SUPERVISOR" : null);

  const canView = has("WAREHOUSE:VIEW") || isSuperAdmin;
  const inStore = warehouseId !== "all" && role !== null;

  const canMove = canView && inStore && role !== "VIEWER" && (has("WAREHOUSE:CREATE") || isSuperAdmin);
  const canApprove = canView && inStore && role === "SUPERVISOR" && (has("WAREHOUSE:APPROVE") || isSuperAdmin);
  const canAdminister = has("WAREHOUSE:EDIT") || isSuperAdmin;

  const reason = !canView
    ? "You don't have access to Warehouse."
    : warehouseId === "all"
      ? "Pick a single store to record movements."
      : role === null
        ? "You aren't on this store's team, so it's read-only."
        : role === "VIEWER"
          ? "You have view-only access to this store."
          : null;

  return { role, canView, canMove, canApprove, canAdminister, reason };
}
