"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, PackageCheck, Search, Truck } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { todayIST } from "@/lib/datetime";
import * as wh from "@/lib/warehouseApi";
import type { ApiPendingPoItem, ApiPendingTransfer } from "@/lib/warehouseApi";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const keyOf = (p: ApiPendingPoItem) => `${p.poId}:${p.itemId ?? p.itemName}`;

/** How many lines are still due — for the badge on the button that opens this drawer. */
export async function countPendingToReceive(projectId?: number | null): Promise<number> {
  const [po, tr] = await Promise.all([
    wh.getPendingPoItems(projectId ?? null).catch(() => [] as ApiPendingPoItem[]),
    wh.getPendingTransfers({ projectId: projectId ?? null }).catch(() => [] as ApiPendingTransfer[]),
  ]);
  return po.length + tr.length;
}

/**
 * Pending to Receive, as Onsite has it on the project's material page, in Procurement and in the
 * Warehouse: what suppliers still owe against approved purchase orders, and transfers on their way
 * in. Tick lines from one supplier and one site and receive them as a single GRN; accept a transfer
 * in one click.
 */
export function PendingReceiveDrawer({
  projectId,
  onClose,
  onChanged,
}: {
  /** Fixed to one project (Project → Material); omitted = every project the caller can see. */
  projectId?: number | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const can = useCan();
  const canReceive = can(["WAREHOUSE_STOCK:CREATE", "PROJECT_MATERIAL:CREATE"]);
  const { projects } = useProjects();
  const [tab, setTab] = useState<"PO" | "TRANSFER">("PO");
  const [project, setProject] = useState(projectId ? String(projectId) : "");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ApiPendingPoItem[] | null>(null);
  const [transfers, setTransfers] = useState<ApiPendingTransfer[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState<ApiPendingPoItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const scope = projectId ?? (project ? Number(project) : null);
  const load = useCallback(async () => {
    setError("");
    try {
      const [po, tr] = await Promise.all([
        wh.getPendingPoItems(scope),
        wh.getPendingTransfers({ projectId: scope }).catch(() => [] as ApiPendingTransfer[]),
      ]);
      setItems(po);
      setTransfers(tr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load what is pending.");
      setItems([]);
      setTransfers([]);
    }
  }, [scope]);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (p) => !q || [p.itemName, p.poNo, p.vendorName, p.projectName].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [items, search]);

  const byVendor = useMemo(() => {
    const m = new Map<string, ApiPendingPoItem[]>();
    for (const p of visible) {
      const k = p.vendorName ?? "No supplier";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const pickedRows = useMemo(() => (items ?? []).filter((p) => picked.has(keyOf(p))), [items, picked]);
  const pickProblem = useMemo(() => {
    if (pickedRows.length === 0) return "";
    if (new Set(pickedRows.map((p) => p.vendorId)).size > 1) return "Pick lines from one supplier at a time — a GRN is one delivery.";
    if (new Set(pickedRows.map((p) => p.projectId)).size > 1) return "Pick lines for one site at a time.";
    if (pickedRows.some((p) => p.projectId == null)) return "A PO without a project can't be received into a site — set its project first.";
    return "";
  }, [pickedRows]);

  function toggle(p: ApiPendingPoItem) {
    // Free-text PO lines (no item picked when the PO was typed) are tickable too — the GRN links
    // them to an item when it is saved.
    setPicked((s) => {
      const n = new Set(s);
      const k = keyOf(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function acceptTransfer(t: ApiPendingTransfer) {
    if (!confirm(`Receive ${t.number} from ${t.fromWarehouseName} into ${t.toWarehouseName}? It adds ${t.lines.length} material(s) to its stock.`)) return;
    setBusy(t.number);
    setError("");
    try {
      await wh.receiveTransfer(t.number, {});
      setNotice(`${t.number} received.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't receive this transfer.");
    } finally {
      setBusy(null);
    }
  }

  const tabs = [
    { key: "PO" as const, label: "PO Items", count: items?.length ?? 0 },
    { key: "TRANSFER" as const, label: "Transferred Items", count: transfers?.length ?? 0 },
  ];

  return (
    <Drawer title="Pending to Receive" onClose={onClose} width="max-w-3xl" guardOnClose={false}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${
                tab === t.key ? "bg-cyan-50 text-brand-accent ring-cyan-300" : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.label} <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-600">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {!projectId && (
            <div className="w-56">
              <Select
                value={project}
                onChange={(v) => {
                  setProject(v);
                  setPicked(new Set());
                }}
                placeholder="All projects"
                options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          )}
          {tab === "PO" && (
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search material, PO no., supplier"
                className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
              />
            </div>
          )}
        </div>

        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {tab === "PO" ? (
          items == null ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
          ) : byVendor.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
              No pending material. Only approved purchase orders appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {byVendor.map(([vendor, rows]) => {
                const open = !collapsed.has(vendor);
                return (
                  <div key={vendor} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(vendor)) n.delete(vendor);
                          else n.add(vendor);
                          return n;
                        })
                      }
                      className="flex w-full items-center justify-between bg-violet-50/60 px-3 py-2 text-left"
                    >
                      <span className="text-sm font-semibold text-gray-800">{vendor}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        {rows.length} item{rows.length === 1 ? "" : "s"} {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </button>
                    {open && (
                      <div className="divide-y divide-gray-100">
                        {rows.map((p) => (
                          <label key={keyOf(p)} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                            {canReceive && (
                              <input
                                type="checkbox"
                                checked={picked.has(keyOf(p))}
                                onChange={() => toggle(p)}
                                className="h-4 w-4 accent-cyan-600"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-800">{p.itemName}</span>
                              <span className="block truncate text-[11px] text-gray-500">
                                {p.poNo} | {p.projectName ?? "No project"} · {p.poDate ?? ""}
                                {p.received > 0 && <> · received {fmt(p.received)} of {fmt(p.ordered)}</>}
                              </span>
                            </span>
                            <span className="text-right text-sm font-semibold whitespace-nowrap text-gray-800">
                              {fmt(p.pending)} <span className="text-xs font-normal text-gray-500">{p.unit ?? ""}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : transfers == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : transfers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">Nothing on its way in.</p>
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.number} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <Truck size={14} className="text-gray-400" /> {t.number}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                      {t.fromWarehouseName} <ArrowRight size={11} /> {t.toWarehouseName} · sent {t.movedOn}
                      {t.byUserName && <> by {t.byUserName}</>}
                    </div>
                    {t.note && <div className="mt-0.5 text-xs text-gray-500">{t.note}</div>}
                  </div>
                  {canReceive && (
                    <button
                      type="button"
                      disabled={busy === t.number}
                      onClick={() => void acceptTransfer(t)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <PackageCheck size={13} /> {busy === t.number ? "Receiving…" : "Receive"}
                    </button>
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-gray-700">
                  {t.lines.map((l) => (
                    <li key={l.itemId} className="flex justify-between">
                      <span>{l.itemName}</span>
                      <span className="font-medium">
                        {fmt(l.quantity)} {l.unit ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === "PO" && canReceive && pickedRows.length > 0 && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
            <span className="text-sm text-cyan-900">{pickProblem || `${pickedRows.length} line(s) selected`}</span>
            <button
              type="button"
              disabled={!!pickProblem}
              onClick={() => setReceiving(pickedRows)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <PackageCheck size={14} /> Receive
            </button>
          </div>
        )}
      </div>

      {receiving && (
        <GrnDrawer
          rows={receiving}
          onClose={() => setReceiving(null)}
          onDone={(msg) => {
            setReceiving(null);
            setPicked(new Set());
            setNotice(msg);
            void load();
            onChanged?.();
          }}
        />
      )}
    </Drawer>
  );
}

/** One GRN for the ticked PO lines: one supplier, one site, quantities editable for part deliveries. */
function GrnDrawer({ rows, onClose, onDone }: { rows: ApiPendingPoItem[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [keyOf(r), String(r.pending)])));
  const [date, setDate] = useState(todayIST());
  const [challan, setChallan] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const head = rows[0];

  async function save() {
    setError("");
    const lines = rows
      .map((r) => ({ r, q: Number(qty[keyOf(r)]) }))
      .filter((x) => x.q > 0);
    if (lines.length === 0) return setError("Enter what arrived for at least one material.");
    const tooMuch = lines.find((x) => x.q > Math.max(x.r.pending, x.r.ordered * 2));
    if (tooMuch) return setError(`${tooMuch.r.itemName}: that is far more than was ordered (${fmt(tooMuch.r.ordered)}).`);
    setSaving(true);
    try {
      const site = await wh.getSiteStore(head.projectId!, true);
      if (!site) throw new Error("This project has no site store.");
      // Lines typed as free text on the PO get an item first (found by name, or created from the line).
      const ids = new Map<string, number>();
      for (const { r } of lines) {
        if (r.itemId != null) continue;
        const { itemId } = await wh.linkPoLine(r.poId, r.itemName ?? "");
        ids.set(keyOf(r), itemId);
      }
      const moved = await wh.recordSiteEntry({
        warehouseId: site.id,
        type: "RECEIVED",
        movedOn: date,
        partyId: head.vendorId,
        sourceDocNo: challan.trim() || null,
        vehicleNo: vehicle.trim() || null,
        note: note.trim() || null,
        lines: lines.map(({ r, q }) => ({ itemId: r.itemId ?? ids.get(keyOf(r))!, quantity: q, rate: r.rate, poId: r.poId })),
      });
      onDone(`${moved[0]?.number ?? "GRN"} saved — ${lines.length} material(s) received at ${head.projectName ?? "the site"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the GRN.");
      setSaving(false);
    }
  }

  return (
    <Drawer title="Material Received" onClose={onClose} onSave={() => void save()} saveLabel={saving ? "Saving…" : "Save"} width="max-w-xl" dirty>
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <div className="font-medium text-gray-800">{head.vendorName ?? "Supplier"}</div>
          <div className="text-xs text-gray-500">Into {head.projectName ?? "the site"}&apos;s store</div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DrawerField label="Date">
            <DatePicker value={date} onChange={setDate} placeholder="Date" />
          </DrawerField>
          <DrawerField label="Delivery challan / bill no.">
            <input value={challan} onChange={(e) => setChallan(e.target.value)} className="input" placeholder="Optional" />
          </DrawerField>
          <DrawerField label="Vehicle number">
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} className="input" placeholder="Optional" />
          </DrawerField>
        </div>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {rows.map((r) => (
            <div key={keyOf(r)} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{r.itemName}</div>
                <div className="text-[11px] text-gray-500">
                  {r.poNo} · pending {fmt(r.pending)} {r.unit ?? ""}
                </div>
              </div>
              <input
                type="number"
                min={0}
                value={qty[keyOf(r)] ?? ""}
                onChange={(e) => setQty((q) => ({ ...q, [keyOf(r)]: e.target.value }))}
                className="input w-28 text-right"
              />
            </div>
          ))}
        </div>
        <DrawerField label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="Optional" />
        </DrawerField>
      </div>
    </Drawer>
  );
}
