"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  IndianRupee,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Truck,
  User,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WarehouseModal } from "@/components/WarehouseModal";
import { WarehouseItemModal } from "@/components/WarehouseItemModal";
import { StockMovementModal } from "@/components/StockMovementModal";
import { ReturnModal } from "@/components/ReturnModal";
import { MaterialRequestModal } from "@/components/MaterialRequestModal";
import { FulfillRequestModal } from "@/components/FulfillRequestModal";
import { ReturnRequestModal } from "@/components/ReturnRequestModal";
import { useAppStore } from "@/lib/store";
import { formatRupee } from "@/lib/projectHelpers";
import { itemStock } from "@/lib/warehouseHelpers";
import {
  ITEM_CATEGORIES,
  type Checkout,
  type ItemKind,
  type MaterialRequest,
  type RequestStatus,
  type Warehouse,
} from "@/lib/types";

const TABS = ["Stock", "Requests", "Warehouses", "Movements", "Checkouts"] as const;
type Tab = (typeof TABS)[number];

const REQUEST_BADGE: Record<RequestStatus, string> = {
  Pending: "bg-amber-50 text-amber-600",
  Dispatched: "bg-blue-50 text-blue-600",
  "Partially Returned": "bg-violet-50 text-violet-600",
  Closed: "bg-green-50 text-green-600",
  Rejected: "bg-rose-50 text-rose-600",
};

const KIND_BADGE: Record<ItemKind, string> = {
  Consumable: "bg-blue-50 text-blue-600",
  Returnable: "bg-violet-50 text-violet-600",
};

const MOVE_BADGE: Record<string, string> = {
  Received: "bg-green-50 text-green-600",
  Issued: "bg-rose-50 text-rose-600",
  Returned: "bg-cyan-50 text-cyan-600",
};

const CHECKOUT_BADGE: Record<Checkout["status"], string> = {
  Out: "bg-amber-50 text-amber-600",
  "Partially Returned": "bg-blue-50 text-blue-600",
  Returned: "bg-green-50 text-green-600",
};

export default function WarehousePage() {
  const warehouses = useAppStore((s) => s.warehouses);
  const items = useAppStore((s) => s.warehouseItems);
  const movements = useAppStore((s) => s.stockMovements);
  const checkouts = useAppStore((s) => s.checkouts);
  const projects = useAppStore((s) => s.projects);
  const requests = useAppStore((s) => s.materialRequests);
  const users = useAppStore((s) => s.users);
  const currentUserId = useAppStore((s) => s.currentUserId);

  const currentUser = users.find((u) => u.id === currentUserId);
  const role = currentUser?.role;
  const canManageStock = role === "Admin" || role === "Store Keeper";
  const canRequest = role === "Admin" || role === "Site In-charge";

  const [tab, setTab] = useState<Tab>("Stock");
  const [warehouseFilter, setWarehouseFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [kindFilter, setKindFilter] = useState("All");
  const [search, setSearch] = useState("");

  // modal state
  const [whModal, setWhModal] = useState<{ warehouse?: Warehouse } | null>(null);
  const [showItem, setShowItem] = useState(false);
  const [moveModal, setMoveModal] = useState<{ mode: "Received" | "Issued"; itemId?: string } | null>(null);
  const [returnModal, setReturnModal] = useState<Checkout | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [fulfillReq, setFulfillReq] = useState<MaterialRequest | null>(null);
  const [returnReq, setReturnReq] = useState<MaterialRequest | null>(null);

  const warehouseName = (id?: string) => warehouses.find((w) => w.id === id)?.name ?? "—";
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? "—";
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? "—";
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  // Requests visible to the signed-in role.
  const visibleRequests = useMemo(() => {
    if (role === "Store Keeper") return requests.filter((r) => r.warehouseId === currentUser?.warehouseId);
    if (role === "Site In-charge")
      return requests.filter(
        (r) => r.requestedById === currentUser?.id || r.projectId === currentUser?.projectId
      );
    return requests; // Admin sees all
  }, [requests, role, currentUser]);

  const canFulfil = (r: MaterialRequest) =>
    role === "Admin" || (role === "Store Keeper" && r.warehouseId === currentUser?.warehouseId);

  const kpis = useMemo(() => {
    let value = 0;
    let lowStock = 0;
    for (const it of items) {
      const stock = itemStock(it, movements);
      value += Math.max(0, stock.closing) * it.rate;
      if (stock.closing <= it.reorderLevel) lowStock += 1;
    }
    const open = checkouts.filter((c) => c.status !== "Returned");
    const outQty = open.reduce((s, c) => s + (c.qty - c.returnedQty), 0);
    return { totalItems: items.length, value, lowStock, openCount: open.length, outQty };
  }, [items, movements, checkouts]);

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (warehouseFilter !== "All" && it.warehouseId !== warehouseFilter) return false;
      if (categoryFilter !== "All" && it.category !== categoryFilter) return false;
      if (kindFilter !== "All" && it.kind !== kindFilter) return false;
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, warehouseFilter, categoryFilter, kindFilter, search]);

  return (
    <AppShell title="Warehouse">
      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Total Items" value={String(kpis.totalItems)} tint="bg-cyan-100 text-cyan-600" />
        <Kpi icon={IndianRupee} label="Stock Value" value={formatRupee(kpis.value)} tint="bg-green-100 text-green-600" />
        <Kpi
          icon={AlertTriangle}
          label="Low Stock Items"
          value={String(kpis.lowStock)}
          tint="bg-amber-100 text-amber-600"
        />
        <Kpi
          icon={ArrowUpRight}
          label="Items Out"
          value={String(kpis.openCount)}
          sub={`${kpis.outQty} units with workers`}
          tint="bg-rose-100 text-rose-600"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 py-2 text-sm font-medium ${
              tab === t
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ---------------- STOCK TAB ---------------- */}
      {tab === "Stock" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <Search size={15} className="text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search item"
                  className="w-36 text-sm outline-none"
                />
              </div>
              <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="input w-auto">
                <option value="All">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input w-auto">
                <option value="All">All Categories</option>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="input w-auto">
                <option value="All">All Types</option>
                <option>Consumable</option>
                <option>Returnable</option>
              </select>
            </div>
            {canManageStock && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMoveModal({ mode: "Received" })}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50"
                >
                  <ArrowDownLeft size={15} />
                  Receive
                </button>
                <button
                  onClick={() => setMoveModal({ mode: "Issued" })}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  <ArrowUpRight size={15} />
                  Issue
                </button>
                <button
                  onClick={() => setShowItem(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  <Plus size={15} />
                  Add Item
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[2fr_1.4fr_1fr_1.2fr_1fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              <div>Item</div>
              <div>Warehouse</div>
              <div>Type</div>
              <div className="text-right">In Stock</div>
              <div className="text-right">Value</div>
              <div className="text-right">Actions</div>
            </div>
            {visibleItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No items match these filters.</div>
            )}
            {visibleItems.map((it) => {
              const stock = itemStock(it, movements);
              const low = stock.closing <= it.reorderLevel;
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-[2fr_1.4fr_1fr_1.2fr_1fr_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">{it.name}</div>
                    <div className="text-xs text-gray-400">{it.category}</div>
                  </div>
                  <div className="truncate text-sm text-gray-600">{warehouseName(it.warehouseId)}</div>
                  <div>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[it.kind]}`}>
                      {it.kind}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${low ? "text-rose-600" : "text-gray-800"}`}>
                      {stock.closing} {it.unit}
                    </div>
                    {low && (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-rose-500">
                        <AlertTriangle size={11} /> Low · reorder {it.reorderLevel}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-600">
                    {formatRupee(Math.max(0, stock.closing) * it.rate)}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {canManageStock ? (
                      <>
                        <button
                          onClick={() => setMoveModal({ mode: "Received", itemId: it.id })}
                          title="Receive stock"
                          className="rounded-md p-1.5 text-green-600 hover:bg-green-50"
                        >
                          <ArrowDownLeft size={16} />
                        </button>
                        <button
                          onClick={() => setMoveModal({ mode: "Issued", itemId: it.id })}
                          title="Issue stock"
                          className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- REQUESTS TAB ---------------- */}
      {tab === "Requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Material Requests</h2>
              <p className="text-sm text-gray-500">
                {role === "Store Keeper"
                  ? "Requests raised for your warehouse — dispatch and track returns."
                  : role === "Site In-charge"
                    ? "Requests you have raised for your site."
                    : "All site requests across warehouses."}
              </p>
            </div>
            {canRequest && (
              <button
                onClick={() => setShowRequest(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus size={15} />
                New Request
              </button>
            )}
          </div>

          {visibleRequests.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400">
              No material requests yet.
            </div>
          )}

          <div className="space-y-3">
            {visibleRequests.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{r.number}</span>
                        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${REQUEST_BADGE[r.status]}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {projectName(r.projectId)} · from {warehouseName(r.warehouseId)} · by{" "}
                        {userName(r.requestedById)} · {r.date}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "Pending" && canFulfil(r) && (
                      <button
                        onClick={() => setFulfillReq(r)}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        <Truck size={14} />
                        Dispatch
                      </button>
                    )}
                    {(r.status === "Dispatched" || r.status === "Partially Returned") && canFulfil(r) && (
                      <button
                        onClick={() => setReturnReq(r)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent hover:bg-brand-accent/5"
                      >
                        <RotateCcw size={14} />
                        Record Return
                      </button>
                    )}
                  </div>
                </div>

                {/* Lines */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
                  {r.lines.map((l) => (
                    <span
                      key={l.itemId}
                      className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                    >
                      {itemName(l.itemId)} ·{" "}
                      <span className="font-medium text-gray-800">
                        {l.qty} {itemUnit(l.itemId)}
                      </span>
                      {l.issuedQty > 0 && (
                        <span className="text-gray-400">
                          {" "}
                          (out {l.issuedQty - l.returnedQty})
                        </span>
                      )}
                    </span>
                  ))}
                </div>

                {r.dispatch && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Truck size={13} className="text-gray-400" />
                      {r.dispatch.vehicle}
                    </span>
                    <span>Driver: {r.dispatch.driver || "—"}</span>
                    <span>Collected by: {r.dispatch.workers}</span>
                    <span>{r.dispatch.date}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- WAREHOUSES TAB ---------------- */}
      {tab === "Warehouses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Warehouses &amp; Site Stores</h2>
            {role === "Admin" && (
              <button
                onClick={() => setWhModal({})}
                className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus size={15} />
                Add Warehouse
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {warehouses.map((w) => {
              const whItems = items.filter((i) => i.warehouseId === w.id);
              const value = whItems.reduce(
                (s, i) => s + Math.max(0, itemStock(i, movements).closing) * i.rate,
                0
              );
              return (
                <div key={w.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                          w.type === "Central" ? "bg-cyan-50 text-cyan-600" : "bg-indigo-50 text-indigo-600"
                        }`}
                      >
                        <WarehouseIcon size={22} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{w.name}</div>
                        <span
                          className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            w.type === "Central" ? "bg-cyan-50 text-cyan-600" : "bg-indigo-50 text-indigo-600"
                          }`}
                        >
                          {w.type}
                        </span>
                      </div>
                    </div>
                    {role === "Admin" && (
                      <button
                        onClick={() => setWhModal({ warehouse: w })}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit warehouse"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-gray-400" />
                      {w.location || "—"}
                    </div>
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-gray-400" />
                      {w.inCharge || "—"}
                    </div>
                    {w.projectId && (
                      <div className="flex items-center gap-2">
                        <Boxes size={13} className="text-gray-400" />
                        {projectName(w.projectId)}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{whItems.length}</div>
                      <div className="text-[11px] text-gray-400">Items</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-800">{formatRupee(value)}</div>
                      <div className="text-[11px] text-gray-400">Stock Value</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- MOVEMENTS TAB ---------------- */}
      {tab === "Movements" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="grid grid-cols-[1fr_1.6fr_1.4fr_1fr_1.4fr_1.2fr] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
            <div>Date</div>
            <div>Item</div>
            <div>Warehouse</div>
            <div>Movement</div>
            <div>To</div>
            <div>Reference</div>
          </div>
          {movements.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1fr_1.6fr_1.4fr_1fr_1.4fr_1.2fr] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
            >
              <div className="text-xs text-gray-500">{m.date}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">{itemName(m.itemId)}</div>
              </div>
              <div className="truncate text-sm text-gray-600">{warehouseName(m.warehouseId)}</div>
              <div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${MOVE_BADGE[m.type]}`}>
                  {m.type}
                </span>
                <span className="ml-2 text-sm text-gray-700">
                  {m.quantity} {itemUnit(m.itemId)}
                </span>
              </div>
              <div className="truncate text-sm text-gray-600">
                {m.issuedTo ? m.issuedTo : m.projectId ? projectName(m.projectId) : "—"}
              </div>
              <div className="truncate text-xs text-gray-400">{m.reference}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- CHECKOUTS TAB ---------------- */}
      {tab === "Checkouts" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Returnable tools &amp; equipment currently out with workers. Mark them returned when brought back.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[1.6fr_1.4fr_1.4fr_1fr_1fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500">
              <div>Item</div>
              <div>Issued To</div>
              <div>Project</div>
              <div className="text-right">Out</div>
              <div>Status</div>
              <div className="text-right">Action</div>
            </div>
            {checkouts.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No checkouts yet.</div>
            )}
            {[...checkouts]
              .sort((a, b) => (a.status === "Returned" ? 1 : 0) - (b.status === "Returned" ? 1 : 0))
              .map((c) => {
                const outstanding = c.qty - c.returnedQty;
                const returned = c.status === "Returned";
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1.6fr_1.4fr_1.4fr_1fr_1fr_auto] items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{itemName(c.itemId)}</div>
                      <div className="text-xs text-gray-400">
                        {warehouseName(c.warehouseId)} · {c.date}
                      </div>
                    </div>
                    <div className="truncate text-sm text-gray-600">{c.issuedTo}</div>
                    <div className="truncate text-sm text-gray-600">{projectName(c.projectId)}</div>
                    <div className="text-right text-sm font-semibold text-gray-800">
                      {outstanding} {itemUnit(c.itemId)}
                    </div>
                    <div>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${CHECKOUT_BADGE[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => setReturnModal(c)}
                        disabled={returned}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-accent hover:bg-brand-accent/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw size={13} />
                        Return
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Modals */}
      {whModal && <WarehouseModal warehouse={whModal.warehouse} onClose={() => setWhModal(null)} />}
      {showItem && (
        <WarehouseItemModal
          defaultWarehouseId={warehouseFilter !== "All" ? warehouseFilter : undefined}
          onClose={() => setShowItem(false)}
        />
      )}
      {moveModal && (
        <StockMovementModal
          mode={moveModal.mode}
          defaultItemId={moveModal.itemId}
          onClose={() => setMoveModal(null)}
        />
      )}
      {returnModal && <ReturnModal checkout={returnModal} onClose={() => setReturnModal(null)} />}
      {showRequest && <MaterialRequestModal onClose={() => setShowRequest(false)} />}
      {fulfillReq && <FulfillRequestModal request={fulfillReq} onClose={() => setFulfillReq(null)} />}
      {returnReq && <ReturnRequestModal request={returnReq} onClose={() => setReturnReq(null)} />}
    </AppShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div className="min-w-0">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 truncate text-xl font-semibold text-gray-800">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}
