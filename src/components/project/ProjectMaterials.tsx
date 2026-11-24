"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Download, Minus, PackageOpen, PackageSearch, Plus, Search, Truck } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { ItemDialog } from "@/components/vyapar/ItemDialog";
import { MaterialEntryDrawer, ENTRY_TITLES, type MaterialEntryKind } from "@/components/material/MaterialEntryDrawer";
import { PendingReceiveDrawer, countPendingToReceive } from "@/components/material/PendingReceiveDrawer";
import { MaterialItemDrawer } from "@/components/material/MaterialItemDrawer";
import { UnbilledMaterialDrawer, countUnbilled } from "@/components/material/UnbilledMaterialDrawer";
import { BadgeButton, MaterialRequestsDrawer, bucketOf } from "@/components/procurement/PoTrackingPanels";
import { useCan } from "@/lib/permissions";
import { useProjects } from "@/lib/useProjects";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { inr } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import * as wh from "@/lib/warehouseApi";
import type { Item, Party } from "@/lib/vyaparApi";
import type { ApiMovement, ApiStockRow, ApiStockSetting, ApiWarehouse } from "@/lib/warehouseApi";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** What a ledger row means on a site, Onsite's wording, and which way it moves the stock. */
function entryType(m: ApiMovement): { label: string; sign: 1 | -1; tone: string } {
  switch (m.kind) {
    case "RECEIPT":
      return { label: "Received", sign: 1, tone: "text-emerald-700" };
    case "TRANSFER_IN":
      return { label: "Transfer In", sign: 1, tone: "text-emerald-700" };
    case "RETURN":
      return { label: "Return", sign: 1, tone: "text-emerald-700" };
    case "ADJUSTMENT":
      return { label: "Adjustment", sign: 1, tone: "text-slate-600" };
    case "TRANSFER_OUT":
      return { label: "Transfer Out", sign: -1, tone: "text-amber-700" };
    case "ISSUE":
      if (m.target === "SCRAP") return { label: "Wastage", sign: -1, tone: "text-rose-700" };
      if (m.target === "SUBCONTRACTOR") return { label: "Issued to Subcon", sign: -1, tone: "text-violet-700" };
      if (m.target === "WORKER") return { label: "Issued", sign: -1, tone: "text-rose-700" };
      return { label: "Used", sign: -1, tone: "text-rose-700" };
  }
}

interface MaterialRow {
  itemId: number;
  name: string;
  unit: string;
  category: string | null;
  estimated: number;
  received: number;
  used: number;
  stock: number;
  setting: ApiStockSetting | undefined;
}

/**
 * Project → Material, as Onsite has it: the site's own store.
 *
 * <p>Material List — every material on the site with its estimate, what has come in, what has been
 * used and what is there now, with quick + (received) and − (used). Recent Entries — the site's
 * ledger, every entry with its number, type and who made it. Create — request, receive, use, waste,
 * hand to a subcontractor or transfer on. Pending to Receive and Material Requests sit on the bar.
 *
 * <p>It is the project's SITE store in the Warehouse module, so both screens always agree; the store
 * is created the first time the project records anything.
 */
export function ProjectMaterials({ projectId }: { projectId: number }) {
  const can = useCan();
  const canMove = can(["WAREHOUSE_STOCK:CREATE", "PROJECT_MATERIAL:CREATE"]);
  const canRequest = can(["WAREHOUSE_REQUESTS:CREATE", "PROJECT_MATERIAL:CREATE"]);
  const canNewItem = can("VYAPAR_ITEM:CREATE");
  const { projects } = useProjects();

  const [store, setStore] = useState<ApiWarehouse | null>(null);
  const [stock, setStock] = useState<ApiStockRow[]>([]);
  const [settings, setSettings] = useState<ApiStockSetting[]>([]);
  const [movements, setMovements] = useState<ApiMovement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"LIST" | "RECENT">("LIST");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entry, setEntry] = useState<{ kind: MaterialEntryKind; itemId?: number } | null>(null);
  const [panel, setPanel] = useState<"pending" | "requests" | "unbilled" | null>(null);
  /** The material whose ledger is open (Onsite: click a material row). */
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [newItem, setNewItem] = useState(false);
  const [badges, setBadges] = useState({ pending: 0, requests: 0, unbilled: 0 });

  const load = useCallback(async () => {
    setError("");
    try {
      const site = await wh.getSiteStore(projectId, false);
      setStore(site);
      const [st, se, mv] = site
        ? await Promise.all([wh.getStock(site.id), wh.getStockSettings(site.id), wh.getMovements(site.id)])
        : [[], [], []];
      setStock(st);
      setSettings(se);
      setMovements(mv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this project's material.");
    } finally {
      setLoading(false);
    }
    // The badges are a courtesy — a failure there must not blank the page.
    const [pending, reqs, unbilled] = await Promise.all([
      countPendingToReceive(projectId).catch(() => 0),
      wh.getProjectRequests(projectId).catch(() => []),
      countUnbilled(projectId).catch(() => 0),
    ]);
    const open = reqs.reduce((n, r) => n + r.lines.filter((l) => ["PENDING", "APPROVED"].includes(bucketOf(r, l))).length, 0);
    setBadges({ pending, requests: open, unbilled });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
    vyapar.getParties().then(setParties).catch(() => setParties([]));
  }, []);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const stockByItem = useMemo(() => new Map(stock.map((s) => [s.itemId, s.onHand])), [stock]);

  const rows = useMemo<MaterialRow[]>(() => {
    const map = new Map<number, MaterialRow>();
    const ensure = (itemId: number, name?: string | null, unit?: string | null) => {
      let r = map.get(itemId);
      if (!r) {
        const it = itemById.get(itemId);
        r = {
          itemId,
          name: it?.name ?? name ?? `Item #${itemId}`,
          unit: it?.unit ?? unit ?? "",
          category: it?.category ?? null,
          estimated: 0,
          received: 0,
          used: 0,
          stock: 0,
          setting: undefined,
        };
        map.set(itemId, r);
      }
      return r;
    };
    for (const s of stock) ensure(s.itemId, s.itemName, s.unit).stock = s.onHand;
    for (const s of settings) {
      if ((s.estimatedQuantity ?? 0) <= 0 && !stockByItem.has(s.itemId)) continue;
      const r = ensure(s.itemId);
      r.estimated = s.estimatedQuantity ?? 0;
      r.setting = s;
    }
    for (const m of movements) {
      const r = ensure(m.itemId, m.itemName);
      if (m.kind === "RECEIPT" || m.kind === "TRANSFER_IN") r.received += m.quantity;
      else if (m.kind === "ISSUE") r.used += m.quantity;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [stock, settings, movements, itemById, stockByItem]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort(), [rows]);

  const shownRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!category || r.category === category) && (!q || r.name.toLowerCase().includes(q)));
  }, [rows, query, category]);

  const ledger = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements
      .map((m) => ({ m, t: entryType(m) }))
      .filter(({ t }) => !typeFilter || t.label === typeFilter)
      .filter(({ m }) => (!from || m.movedOn >= from) && (!to || m.movedOn <= to))
      .filter(({ m }) => !q || [m.itemName, m.number, m.partyName, m.note, m.sourceDocNo].some((v) => (v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => b.m.movedOn.localeCompare(a.m.movedOn) || b.m.id - a.m.id);
  }, [movements, typeFilter, from, to, query]);

  const ledgerTypes = useMemo(() => [...new Set(movements.map((m) => entryType(m).label))].sort(), [movements]);

  async function setEstimate(r: MaterialRow) {
    const typed = window.prompt(`Estimated quantity of ${r.name}${r.unit ? ` (${r.unit})` : ""} for this project:`, r.estimated ? String(r.estimated) : "");
    if (typed === null) return;
    const value = Number(typed);
    if (!Number.isFinite(value) || value < 0) return setError("Enter a number for the estimate.");
    try {
      const site = store ?? (await wh.getSiteStore(projectId, true));
      if (!site) return;
      await wh.saveStockSetting({
        warehouseId: site.id,
        itemId: r.itemId,
        reorderLevel: r.setting?.reorderLevel ?? 0,
        binLocation: r.setting?.binLocation ?? null,
        estimatedQuantity: value,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the estimate.");
    }
  }

  function exportLedger() {
    exportRowsToCsv(
      "material-entries",
      ["Date", "Entry no", "Type", "Material", "Party / store", "Quantity", "Unit", "Rate", "Amount", "By", "Note"],
      ledger.map(({ m, t }) => [
        m.movedOn,
        m.number,
        t.label,
        m.itemName ?? "",
        m.partyName ?? m.counterWarehouseCode ?? "",
        t.sign * m.quantity,
        itemById.get(m.itemId)?.unit ?? "",
        m.rate,
        m.rate * m.quantity,
        m.byUserName ?? "",
        m.note ?? "",
      ]),
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const createMenu: { kind: MaterialEntryKind; show: boolean }[] = [
    { kind: "REQUEST", show: canRequest },
    { kind: "RECEIVED", show: canMove },
    { kind: "USED", show: canMove },
    { kind: "SUBCON_ISSUE", show: canMove },
    { kind: "TRANSFER", show: canMove },
    { kind: "WASTAGE", show: canMove },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "LIST" ? "Search material" : "Search material, entry no., party"}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
          />
        </div>
        {view === "LIST" && categories.length > 0 && (
          <div className="w-48">
            <Select
              value={category}
              onChange={setCategory}
              placeholder="Material category"
              options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        )}
        <BadgeButton icon={<PackageOpen size={15} />} label="Pending to receive" count={badges.pending} onClick={() => setPanel("pending")} />
        <BadgeButton icon={<ClipboardList size={15} />} label="Requests" count={badges.requests} onClick={() => setPanel("requests")} />
        <BadgeButton icon={<Truck size={15} />} label="Unbilled" count={badges.unbilled} onClick={() => setPanel("unbilled")} />
        {createMenu.some((c) => c.show) && (
          <RowMenu
            align="right"
            width={220}
            buttonLabel="Create material entry"
            trigger={
              <span className="inline-flex items-center gap-1.5">
                <Plus size={15} /> Create <ChevronDown size={14} />
              </span>
            }
            triggerClassName="rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            {(close) => (
              <>
                {createMenu
                  .filter((c) => c.show)
                  .map((c) => (
                    <RowMenuItem key={c.kind} icon={Plus} label={ENTRY_TITLES[c.kind]} onClick={() => { close(); setEntry({ kind: c.kind }); }} />
                  ))}
                {canNewItem && <RowMenuItem icon={PackageSearch} label="New material item" onClick={() => { close(); setNewItem(true); }} />}
              </>
            )}
          </RowMenu>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-gray-100 p-1">
          {(["LIST", "RECENT"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${view === v ? "bg-slate-800 text-white" : "text-gray-600 hover:text-gray-800"}`}
            >
              {v === "LIST" ? "Material List" : "Recent Entries"}
            </button>
          ))}
        </div>
        {view === "RECENT" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="All types"
                options={[{ value: "", label: "All types" }, ...ledgerTypes.map((t) => ({ value: t, label: t }))]}
              />
            </div>
            <div className="w-36">
              <DatePicker value={from} onChange={setFrom} placeholder="From" />
            </div>
            <div className="w-36">
              <DatePicker value={to} onChange={setTo} placeholder="To" />
            </div>
            <button
              onClick={exportLedger}
              title="Download Excel"
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:text-emerald-600"
            >
              <Download size={15} />
            </button>
          </div>
        )}
      </div>

      {notice && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {view === "LIST" ? (
        shownRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-14 text-center">
            <PackageSearch size={28} className="mx-auto text-gray-300" />
            <div className="mt-2 font-medium text-gray-700">{rows.length ? "No material matches" : "No material on this site yet"}</div>
            <p className="mt-1 text-sm text-gray-400">
              {rows.length ? "Try another search or category." : "Use Create → Material Received when the first delivery arrives, or raise a Request."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Material</th>
                  <th className="px-3 py-2.5 text-left font-medium">Unit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Estimated</th>
                  <th className="px-3 py-2.5 text-right font-medium">Received</th>
                  <th className="px-3 py-2.5 text-right font-medium">Used</th>
                  <th className="px-3 py-2.5 text-right font-medium">Current stock</th>
                  {canMove && <th className="w-24 px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => {
                  const over = r.estimated > 0 && r.received > r.estimated;
                  return (
                    <tr key={r.itemId} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="cursor-pointer px-4 py-2.5" onClick={() => setOpenItemId(r.itemId)} title="Open this material's entries">
                        <div className="font-medium text-gray-800 hover:text-brand-accent hover:underline">{r.name}</div>
                        {r.category && <div className="text-[11px] text-gray-400">{r.category}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{r.unit}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.estimated > 0 ? (
                          <button
                            disabled={!canMove}
                            onClick={() => void setEstimate(r)}
                            className={`tabular-nums ${over ? "text-amber-700" : "text-gray-700"} enabled:hover:underline`}
                            title={over ? "More has been received than estimated" : "Change the estimate"}
                          >
                            {fmt(r.estimated)}
                          </button>
                        ) : canMove ? (
                          <button
                            onClick={() => void setEstimate(r)}
                            className="rounded-md border border-violet-300 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                          >
                            + Add
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmt(r.received)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{fmt(r.used)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {(() => {
                          const t = stockTone(r);
                          return (
                            <span title={t.hint} className={`inline-block rounded-md px-2 py-0.5 font-semibold tabular-nums ${t.cls}`}>
                              {fmt(r.stock)}
                            </span>
                          );
                        })()}
                      </td>
                      {canMove && (
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setEntry({ kind: "RECEIVED", itemId: r.itemId })}
                              title="Material received"
                              className="rounded-md bg-gray-100 p-1.5 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => setEntry({ kind: "USED", itemId: r.itemId })}
                              disabled={r.stock <= 0}
                              title={r.stock <= 0 ? "Nothing in stock to use" : "Material used"}
                              className="rounded-md bg-gray-100 p-1.5 text-gray-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                            >
                              <Minus size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Low — at or below minimum, or none left</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Running low</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Enough</span>
            </div>
          </div>
        )
      ) : ledger.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-14 text-center text-sm text-gray-400">No entries match.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Material</th>
                <th className="px-3 py-2.5 text-left font-medium">Party / store</th>
                <th className="px-3 py-2.5 text-left font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                <th className="px-3 py-2.5 text-left font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {ledger.slice(0, 500).map(({ m, t }) => (
                <tr key={m.id} className="border-t border-gray-100 align-top hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                    <div>{m.movedOn}</div>
                    <div className="text-[11px] text-gray-400">{m.number}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-800">{m.itemName}</div>
                    {(m.note || m.sourceDocNo) && (
                      <div className="max-w-[260px] truncate text-[11px] text-gray-400" title={[m.sourceDocNo, m.note].filter(Boolean).join(" · ")}>
                        {[m.sourceDocNo, m.note].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{m.partyName ?? m.counterWarehouseCode ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${t.tone}`}>{t.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{m.rate ? inr(m.rate * m.quantity) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums ${t.sign > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {t.sign > 0 ? "+" : "−"} {fmt(m.quantity)} <span className="text-[11px] font-normal">{itemById.get(m.itemId)?.unit ?? ""}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{m.byUserName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.length > 500 && <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">Showing the latest 500 of {ledger.length} — narrow the dates or download Excel for all.</div>}
        </div>
      )}

      {entry && (
        <MaterialEntryDrawer
          kind={entry.kind}
          projectId={projectId}
          store={store}
          items={items}
          parties={parties}
          stock={stockByItem}
          projects={projects}
          initialItemId={entry.itemId}
          onClose={() => setEntry(null)}
          onDone={(msg) => {
            setEntry(null);
            setNotice(msg ?? "Saved.");
            void load();
          }}
        />
      )}
      {openItemId != null &&
        (() => {
          const r = rows.find((x) => x.itemId === openItemId);
          if (!r) return null;
          return (
            <MaterialItemDrawer
              item={{ itemId: r.itemId, name: r.name, unit: r.unit, estimated: r.estimated, stock: r.stock }}
              movements={movements}
              typeOf={entryType}
              canMove={canMove}
              canRequest={canRequest}
              onClose={() => setOpenItemId(null)}
              onSetEstimate={() => void setEstimate(r)}
              onEntry={(kind) => {
                setOpenItemId(null);
                setEntry({ kind, itemId: r.itemId });
              }}
            />
          );
        })()}
      {panel === "unbilled" && (
        <UnbilledMaterialDrawer
          projectId={projectId}
          onClose={() => {
            setPanel(null);
            void load();
          }}
        />
      )}
      {panel === "pending" && (
        <PendingReceiveDrawer
          projectId={projectId}
          onClose={() => setPanel(null)}
          onChanged={() => void load()}
        />
      )}
      {panel === "requests" && (
        <MaterialRequestsDrawer
          projectId={projectId}
          onClose={() => {
            setPanel(null);
            void load();
          }}
        />
      )}
      {newItem && (
        <ItemDialog
          onClose={() => setNewItem(false)}
          onSaved={(saved) => {
            setNewItem(false);
            setItems((list) => [saved, ...list]);
            setNotice(`${saved.name} added to the material list — record a delivery or a request against it.`);
          }}
        />
      )}
    </div>
  );
}

/**
 * KAN-104: three colours on Current stock, as on Onsite. Red when it is at or below the item's
 * minimum (Min stock / reorder level) or nothing is left of what came in; amber when it is within
 * 50% above the minimum (or, with no minimum set, under 20% of what was received); green otherwise.
 */
function stockTone(r: { stock: number; received: number; setting?: { reorderLevel?: number | null } }): { cls: string; hint: string } {
  const min = Number(r.setting?.reorderLevel ?? 0) || 0;
  const red = { cls: "bg-rose-50 text-rose-700", hint: min > 0 ? `Low — at or below the minimum of ${min}` : "None left" };
  const amber = { cls: "bg-amber-50 text-amber-700", hint: "Running low" };
  const green = { cls: "bg-emerald-50 text-emerald-700", hint: "Enough in stock" };
  if (r.stock <= 0 && r.received <= 0 && min <= 0) return { cls: "text-gray-400", hint: "Nothing received yet" };
  if (r.stock <= 0 || (min > 0 && r.stock <= min)) return red;
  if (min > 0 ? r.stock <= min * 1.5 : r.received > 0 && r.stock < r.received * 0.2) return amber;
  return green;
}
