"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, PackageCheck, PackageOpen, Search, X } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { todayIST } from "@/lib/datetime";
import * as wh from "@/lib/warehouseApi";
import type { ApiMaterialRequest, ApiPendingPoItem, ApiPoOption, ApiRequestLine } from "@/lib/warehouseApi";

const qty = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * The two buttons Onsite puts on its Purchase Order bar (KAN-80 / KAN-81): what is still to
 * arrive against each PO, and where every material request stands — asked, ordered, received,
 * remaining.
 */
export function PoTrackingButtons() {
  const can = useCan();
  const [open, setOpen] = useState<"pending" | "requests" | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen("pending")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-accent hover:text-brand-accent"
      >
        <PackageOpen size={15} /> Pending PO items
      </button>
      {can("WAREHOUSE_REQUESTS:VIEW") && (
        <button
          onClick={() => setOpen("requests")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-accent hover:text-brand-accent"
        >
          <ClipboardList size={15} /> Material requests
        </button>
      )}
      {open === "pending" && <PendingPoItemsDrawer onClose={() => setOpen(null)} />}
      {open === "requests" && <MaterialRequestsDrawer onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- KAN-80 pending PO items

export function PendingPoItemsDrawer({ onClose }: { onClose: () => void }) {
  const { projects } = useProjects();
  const can = useCan();
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ApiPendingPoItem[] | null>(null);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState<ApiPendingPoItem | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await wh.getPendingPoItems(projectId ? Number(projectId) : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load pending items.");
      setRows([]);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, ApiPendingPoItem[]>();
    for (const r of rows ?? []) {
      if (q && ![r.itemName, r.poNo, r.vendorName, r.projectName].some((v) => (v ?? "").toLowerCase().includes(q))) continue;
      const key = r.vendorName ?? "No vendor";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, search]);

  return (
    <Drawer title="Pending PO items" onClose={onClose} width="max-w-2xl" guardOnClose={false}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          What is still to arrive against every purchase order. Received = store receipts booked against the PO (Receive here, or a
          Warehouse receipt with the PO number as its document no.).
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="w-56">
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="All projects"
              options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, PO, vendor"
              className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {rows == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
            Nothing pending — every PO line has been received.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {groups.map(([vendor, items]) => {
              const shut = collapsed.has(vendor);
              return (
                <div key={vendor} className="border-b border-gray-100 last:border-b-0">
                  <button
                    onClick={() =>
                      setCollapsed((p) => {
                        const n = new Set(p);
                        if (n.has(vendor)) n.delete(vendor);
                        else n.add(vendor);
                        return n;
                      })
                    }
                    className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-slate-100"
                  >
                    {shut ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span className="min-w-0 flex-1 truncate">{vendor}</span>
                    <span className="text-xs font-normal text-gray-500">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </button>
                  {!shut &&
                    items.map((r) => (
                      <div key={`${r.poId}-${r.itemId ?? r.itemName}`} className="flex items-center gap-3 border-t border-gray-50 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800">{r.itemName ?? "—"}</div>
                          <div className="truncate text-[11px] text-gray-500">
                            {r.poNo ?? `PO #${r.poId}`}
                            {r.projectName && ` | ${r.projectName}`}
                            {r.poDate && ` · ${r.poDate}`}
                          </div>
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            Ordered {qty(r.ordered)} · Received {qty(r.received)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-amber-700 tabular-nums">
                            {qty(r.pending)} {r.unit ?? ""}
                          </div>
                          <div className="text-[10px] tracking-wide text-gray-400 uppercase">pending</div>
                        </div>
                        {can("WAREHOUSE_STOCK:CREATE") && (
                          <button
                            disabled={r.itemId == null}
                            title={r.itemId == null ? "This PO line isn't linked to an item in the catalogue" : "Book what arrived"}
                            onClick={() => setReceiving(r)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 hover:bg-emerald-100 disabled:opacity-40"
                          >
                            <PackageCheck size={13} /> Receive
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {receiving && (
        <ReceiveDialog
          item={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            void load();
          }}
        />
      )}
    </Drawer>
  );
}

function ReceiveDialog({ item, onClose, onDone }: { item: ApiPendingPoItem; onClose: () => void; onDone: () => void }) {
  const [stores, setStores] = useState<wh.ApiWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState(String(item.pending));
  const [movedOn, setMovedOn] = useState(todayIST());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    wh.getWarehouses()
      .then((list) => {
        const active = list.filter((w) => w.isActive);
        setStores(active);
        // The site's own store first — that is where a site PO is delivered.
        const site = active.find((w) => item.projectId != null && w.projectId === item.projectId) ?? active[0];
        if (site) setWarehouseId(String(site.id));
      })
      .catch(() => setStores([]));
  }, [item.projectId]);

  async function save() {
    setError("");
    const q = Number(quantity);
    if (!warehouseId) return setError("Pick the store it arrived at.");
    if (!(q > 0)) return setError("Enter the quantity received.");
    setBusy(true);
    try {
      await wh.receiveAgainstPo({ poId: item.poId, itemId: item.itemId!, warehouseId: Number(warehouseId), quantity: q, movedOn, note: note || null });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book the receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 text-sm shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Receive against {item.poNo}</h3>
            <p className="text-xs text-gray-500">
              {item.itemName} · {qty(item.pending)} {item.unit ?? ""} pending of {qty(item.ordered)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Store</span>
          <Select
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder={stores.length ? "Pick a store" : "No store you can receive into"}
            options={stores.map((w) => ({ value: String(w.id), label: `${w.code} · ${w.name}` }))}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Quantity received</span>
            <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input w-full" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Date</span>
            <input type="date" value={movedOn} max={todayIST()} onChange={(e) => setMovedOn(e.target.value)} className="input w-full" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Note (challan no., vehicle…)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input w-full" />
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <button onClick={() => void save()} disabled={busy} className="w-full rounded-lg bg-brand-accent px-3 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? "Saving…" : "Book receipt"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- KAN-81 material requests

type Bucket = "PENDING" | "APPROVED" | "ORDERED" | "REJECTED";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "ORDERED", label: "Ordered" },
  { key: "REJECTED", label: "Rejected" },
];

/** Where one line of one request sits, Onsite style. */
function bucketOf(r: ApiMaterialRequest, l: ApiRequestLine): Bucket {
  if (r.status === "REJECTED" || l.lineStatus === "REJECTED") return "REJECTED";
  if (r.status === "PENDING" || r.status === "DRAFT") return "PENDING";
  if ((l.orderedQuantity ?? 0) > 0 || l.lineStatus === "ORDERED" || l.lineStatus === "PART_ORDERED") return "ORDERED";
  return "APPROVED";
}

export function MaterialRequestsDrawer({ onClose }: { onClose: () => void }) {
  const { projects } = useProjects();
  const can = useCan();
  const canOrder = can("WAREHOUSE_REQUESTS:APPROVE") || can("PROCUREMENT_PURCHASES:CREATE");
  const [bucket, setBucket] = useState<Bucket>("APPROVED");
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ApiMaterialRequest[] | null>(null);
  const [error, setError] = useState("");
  const [ordering, setOrdering] = useState<{ r: ApiMaterialRequest; l: ApiRequestLine } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      // Purchase requests are the ones procurement acts on; store issues are filled from stock.
      setRows((await wh.getRequests()).filter((r) => r.requestType === "PURCHASE"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load material requests.");
      setRows([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const projectName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects]);

  const lines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { r: ApiMaterialRequest; l: ApiRequestLine; b: Bucket }[] = [];
    for (const r of rows ?? []) {
      if (projectId && String(r.projectId ?? "") !== projectId) continue;
      for (const l of r.lines) {
        const b = bucketOf(r, l);
        if (q && ![l.itemName, r.number, l.poRefs].some((v) => (v ?? "").toLowerCase().includes(q))) continue;
        out.push({ r, l, b });
      }
    }
    return out;
  }, [rows, projectId, search]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { PENDING: 0, APPROVED: 0, ORDERED: 0, REJECTED: 0 };
    for (const x of lines) c[x.b]++;
    return c;
  }, [lines]);

  const shown = lines.filter((x) => x.b === bucket);
  const byProject = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const x of shown) {
      const key = x.r.projectId != null ? projectName.get(x.r.projectId) ?? `Project #${x.r.projectId}` : "No project";
      m.set(key, [...(m.get(key) ?? []), x]);
    }
    return [...m.entries()];
  }, [shown, projectName]);

  return (
    <Drawer title="Material requests" onClose={onClose} width="max-w-4xl" guardOnClose={false}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${
                bucket === b.key ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {b.label} <span className="ml-1 text-xs opacity-70">{counts[b.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-56">
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="All projects"
              options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material, MR no., PO no."
              className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {rows == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : byProject.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Asked</th>
                  <th className="px-3 py-2 text-right font-medium">In stock</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {byProject.map(([project, items]) => (
                  <ProjectRows key={project} project={project} items={items} canOrder={canOrder} onOrder={(r, l) => setOrdering({ r, l })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ordering && (
        <OrderLineDialog
          request={ordering.r}
          line={ordering.l}
          onClose={() => setOrdering(null)}
          onDone={() => {
            setOrdering(null);
            void load();
          }}
        />
      )}
    </Drawer>
  );
}

function ProjectRows({
  project,
  items,
  canOrder,
  onOrder,
}: {
  project: string;
  items: { r: ApiMaterialRequest; l: ApiRequestLine; b: Bucket }[];
  canOrder: boolean;
  onOrder: (r: ApiMaterialRequest, l: ApiRequestLine) => void;
}) {
  return (
    <>
      <tr className="border-t border-gray-100 bg-slate-50">
        <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          {project}
        </td>
      </tr>
      {items.map(({ r, l, b }) => {
        const received = l.receivedQuantity ?? 0;
        const remaining = Math.max(0, l.quantity - received);
        const ordered = l.orderedQuantity ?? 0;
        return (
          <tr key={`${r.id}-${l.id}`} className="border-t border-gray-50 align-top">
            <td className="px-3 py-2">
              <div className="font-medium text-gray-800">{l.itemName ?? `Item #${l.itemId}`}</div>
              <div className="text-[11px] text-gray-500">
                {r.number} · {r.raisedOn}
                {l.poRefs && <> · PO {l.poRefs}</>}
              </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {qty(l.quantity)} <span className="text-[11px] text-gray-400">{l.unit ?? ""}</span>
            </td>
            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{qty(l.onHand)}</td>
            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{qty(ordered)}</td>
            <td className="px-3 py-2 text-right text-emerald-700 tabular-nums">{qty(received)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${remaining > 0 ? "font-semibold text-amber-700" : "text-gray-400"}`}>{qty(remaining)}</td>
            <td className="px-3 py-2 text-right">
              {b === "ORDERED" ? (
                <span className={`text-xs font-medium ${ordered >= l.quantity ? "text-blue-600" : "text-amber-600"}`}>
                  {remaining === 0 ? "Fully received" : ordered >= l.quantity ? "Fully ordered" : "Part ordered"}
                </span>
              ) : null}
              {canOrder && (b === "APPROVED" || (b === "ORDERED" && ordered < l.quantity)) && (
                <button onClick={() => onOrder(r, l)} className="mt-0.5 block w-full text-right text-xs font-semibold text-brand-accent hover:underline">
                  Link to PO
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function OrderLineDialog({
  request,
  line,
  onClose,
  onDone,
}: {
  request: ApiMaterialRequest;
  line: ApiRequestLine;
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<ApiPoOption[] | null>(null);
  const [poId, setPoId] = useState("");
  const [quantity, setQuantity] = useState(String(Math.max(0, line.quantity - (line.orderedQuantity ?? 0))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    wh.getPoOptions(request.id, line.id)
      .then((o) => {
        setOptions(o);
        if (o[0]?.orderedOfItem) setPoId(String(o[0].poId));
      })
      .catch((e) => {
        setOptions([]);
        setError(e instanceof Error ? e.message : "Couldn't load purchase orders.");
      });
  }, [request.id, line.id]);

  async function save() {
    setError("");
    const q = Number(quantity);
    if (!poId) return setError("Pick the purchase order.");
    if (!(q > 0)) return setError("Enter the quantity ordered.");
    setBusy(true);
    try {
      await wh.orderRequestLine(request.id, line.id, { poId: Number(poId), quantity: q });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 text-sm shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Link {request.number} to a PO</h3>
            <p className="text-xs text-gray-500">
              {line.itemName} · asked {qty(line.quantity)} · ordered so far {qty(line.orderedQuantity)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Purchase order</span>
          <Select
            value={poId}
            onChange={setPoId}
            placeholder={options == null ? "Loading…" : options.length ? "Pick a PO" : "No open PO for this project"}
            options={(options ?? []).map((o) => ({
              value: String(o.poId),
              label: `${o.poNo ?? `#${o.poId}`} · ${o.vendorName ?? "—"}${o.orderedOfItem ? ` · has ${qty(o.orderedOfItem)}` : ""}`,
            }))}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600">Quantity on this PO</span>
          <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input w-full" />
        </label>
        <p className="text-[11px] text-gray-500">Received is counted from store receipts against the PO, so it updates as material arrives.</p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <button onClick={() => void save()} disabled={busy} className="w-full rounded-lg bg-brand-accent px-3 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
