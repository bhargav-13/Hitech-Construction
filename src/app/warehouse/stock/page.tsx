"use client";

import { useEffect, useMemo, useState } from "react";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { MovementDialog } from "@/components/warehouse/MovementDialog";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { SortTh } from "@/components/vyapar/SortTh";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useTableSort } from "@/lib/useTableSort";
import { useWarehouseStore, stockByItem, reservedByItem, reportRefusal } from "@/lib/warehouseStore";
import { useWarehouseScope, useWarehouseRights } from "@/lib/warehouseScope";
import type { MovementKind, StockRow } from "@/lib/warehouseTypes";
import { inr, qty as fmtQty } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import {
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Lock,
  Search,
  Settings2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";

/**
 * Stock on hand.
 *
 * The one screen this module exists for: what is where, what can still be promised, and what is
 * running out. Three quantity columns rather than one, because they answer different questions —
 * **on hand** is what is physically there, **reserved** is what an approved request has already
 * claimed, and **available** is the only one safe to promise to the next person who asks. Showing
 * a single number is how two sites get told there are 90 bags and both are right until one collects.
 */
export default function WarehouseStockPage() {
  const { warehouseId, warehouse } = useWarehouseScope();
  const rights = useWarehouseRights(warehouseId);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const movements = useWarehouseStore((s) => s.movements);
  const requests = useWarehouseStore((s) => s.requests);
  const settings = useWarehouseStore((s) => s.settings);
  const setStockSetting = useWarehouseStore((s) => s.setStockSetting);

  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
  }, []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "low" | "held">("all");
  const [moving, setMoving] = useState<{ kind: MovementKind; itemId?: number } | null>(null);
  const [tuning, setTuning] = useState<StockRow | null>(null);

  /** One row per item per store — the breakdown Vyapar's single stock figure is the sum of. */
  const rows = useMemo(() => {
    const stores = warehouses.filter(
      (w) => w.isActive && (warehouseId === "all" ? w.kind !== "TRANSIT" : w.id === warehouseId),
    );
    const out: StockRow[] = [];
    for (const w of stores) {
      const onHandByItem = stockByItem(movements, w.id);
      const reserved = reservedByItem(requests, w.id);
      for (const [itemId, onHand] of onHandByItem) {
        const item = itemById.get(itemId);
        if (!item) continue; // catalogue not loaded, or the item was removed
        const setting = settings.find((s) => s.warehouseId === w.id && s.itemId === itemId);
        const res = reserved.get(itemId) ?? 0;
        out.push({
          item,
          warehouseId: w.id,
          onHand,
          reserved: res,
          available: onHand - res,
          reorderLevel: setting?.reorderLevel ?? 0,
          binLocation: setting?.binLocation ?? null,
          value: onHand * (item.purchasePrice ?? 0),
        });
      }
    }
    return out;
  }, [warehouses, warehouseId, movements, requests, settings, itemById]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "low" && !(r.reorderLevel > 0 && r.onHand <= r.reorderLevel)) return false;
      if (view === "held" && r.onHand <= 0) return false;
      if (!needle) return true;
      return (
        r.item.name.toLowerCase().includes(needle) ||
        (r.item.itemCode ?? "").toLowerCase().includes(needle) ||
        (r.binLocation ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, view]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    visible,
    {
      item: (r) => r.item.name,
      store: (r) => warehouses.find((w) => w.id === r.warehouseId)?.code ?? "",
      onHand: (r) => r.onHand,
      reserved: (r) => r.reserved,
      available: (r) => r.available,
      value: (r) => r.value,
    },
    { key: "item", dir: "asc" },
  );

  const totals = useMemo(
    () => ({
      value: visible.reduce((a, r) => a + r.value, 0),
      low: visible.filter((r) => r.reorderLevel > 0 && r.onHand <= r.reorderLevel).length,
    }),
    [visible],
  );

  const storeCode = (id: string) => warehouses.find((w) => w.id === id)?.code ?? "—";

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Stock on hand"
        subtitle="Derived from every movement — there is no quantity here anyone can type over."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <MoveButton
              icon={ArrowDownToLine}
              label="Receive"
              tone="primary"
              disabled={!rights.canMove}
              title={rights.reason}
              onClick={() => setMoving({ kind: "RECEIPT" })}
            />
            <MoveButton
              icon={ArrowUpFromLine}
              label="Issue"
              disabled={!rights.canMove}
              title={rights.reason}
              onClick={() => setMoving({ kind: "ISSUE" })}
            />
            <MoveButton
              icon={ArrowLeftRight}
              label="Transfer"
              disabled={!rights.canMove}
              title={rights.reason}
              onClick={() => setMoving({ kind: "TRANSFER_OUT" })}
            />
          </div>
        }
      />

      {rights.reason && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Lock size={14} className="shrink-0" />
          {rights.reason}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item, code or bin…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Select
          value={view}
          onChange={(v) => setView(v as typeof view)}
          size="sm"
          className="w-52"
          options={[
            { value: "all", label: `Everything (${rows.length})` },
            { value: "held", label: "Only what we hold" },
            { value: "low", label: `Below reorder level (${totals.low})` },
          ]}
        />
        <span className="text-xs text-gray-500">
          Value <span className="font-semibold text-gray-800 tabular-nums">{inr(totals.value)}</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <WarehouseEmpty
          icon={Boxes}
          title={rows.length === 0 ? "No stock in this store yet" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Receive material in and it appears here. Every figure on this screen is built from those movements."
              : "Widen the filter or clear the search."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <SortTh label="Item" sortKey="item" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                {warehouseId === "all" && (
                  <SortTh label="Store" sortKey="store" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                )}
                <SortTh label="On hand" sortKey="onHand" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Reserved" sortKey="reserved" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Available" sortKey="available" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Value" sortKey="value" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const low = r.reorderLevel > 0 && r.onHand <= r.reorderLevel;
                return (
                  <tr key={`${r.warehouseId}-${r.item.id}`} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{r.item.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {r.item.unit}
                        {r.binLocation && ` · ${r.binLocation}`}
                        {low && (
                          <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                            reorder at {fmtQty(r.reorderLevel)}
                          </span>
                        )}
                      </div>
                    </td>
                    {warehouseId === "all" && (
                      <td className="px-3 py-2.5 text-gray-600">{storeCode(r.warehouseId)}</td>
                    )}
                    <td className={`px-3 py-2.5 text-right tabular-nums ${low ? "font-semibold text-amber-700" : "text-gray-800"}`}>
                      {fmtQty(r.onHand)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                      {r.reserved ? fmtQty(r.reserved) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        r.available < 0 ? "text-rose-600" : "text-gray-800"
                      }`}
                    >
                      {fmtQty(r.available)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{inr(r.value)}</td>
                    <td className="px-3 py-2.5">
                      <RowMenu align="right" buttonLabel={`Actions for ${r.item.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem
                              icon={ArrowDownToLine}
                              label="Receive"
                              disabled={!rights.canMove}
                              onClick={() => { close(); setMoving({ kind: "RECEIPT", itemId: r.item.id }); }}
                            />
                            <RowMenuItem
                              icon={ArrowUpFromLine}
                              label="Issue"
                              disabled={!rights.canMove}
                              onClick={() => { close(); setMoving({ kind: "ISSUE", itemId: r.item.id }); }}
                            />
                            <RowMenuItem
                              icon={ArrowLeftRight}
                              label="Transfer"
                              disabled={!rights.canMove}
                              onClick={() => { close(); setMoving({ kind: "TRANSFER_OUT", itemId: r.item.id }); }}
                            />
                            <RowMenuItem
                              icon={Undo2}
                              label="Record a return"
                              disabled={!rights.canMove}
                              onClick={() => { close(); setMoving({ kind: "RETURN", itemId: r.item.id }); }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Settings2}
                              label="Reorder level & bin"
                              disabled={!rights.canMove}
                              onClick={() => { close(); setTuning(r); }}
                            />
                            <RowMenuItem
                              icon={SlidersHorizontal}
                              label="Adjust stock"
                              tone="warning"
                              disabled={!rights.canApprove}
                              onClick={() => { close(); setMoving({ kind: "ADJUSTMENT", itemId: r.item.id }); }}
                            />
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {moving && warehouse && (
        <MovementDialog
          kind={moving.kind}
          warehouseId={warehouse.id}
          presetItemId={moving.itemId}
          onClose={() => setMoving(null)}
        />
      )}

      {tuning && (
        <ReorderDialog
          row={tuning}
          onClose={() => setTuning(null)}
          onSave={(reorderLevel, binLocation) => {
            setStockSetting(tuning.warehouseId, tuning.item.id, { reorderLevel, binLocation }).catch(reportRefusal);
            setTuning(null);
          }}
        />
      )}
    </WarehouseShell>
  );
}

function MoveButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string | null;
  tone?: "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? (title ?? undefined) : label}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "primary"
          ? "bg-brand-accent text-white hover:opacity-90"
          : "border border-gray-200 bg-white text-gray-600 hover:border-brand-accent hover:text-brand-accent"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

/**
 * Reorder level and bin, per store.
 *
 * Both are deliberately per-store rather than on the catalogue item: 200 bags is comfortable at the
 * central store and a crisis at a site that gets one delivery a week, and "Rack B3" means nothing
 * anywhere else.
 */
function ReorderDialog({
  row,
  onClose,
  onSave,
}: {
  row: StockRow;
  onClose: () => void;
  onSave: (reorderLevel: number, binLocation: string | null) => void;
}) {
  const [level, setLevel] = useState(String(row.reorderLevel || ""));
  const [bin, setBin] = useState(row.binLocation ?? "");

  return (
    <Drawer title={`Stock settings · ${row.item.name}`} onClose={onClose} onSave={() => onSave(Number(level) || 0, bin.trim() || null)} saveLabel="Save" width="max-w-md">
      <div className="space-y-4">
        <DrawerField
          label="Reorder level"
          hint="Flags the item as running low at or below this. Zero turns the warning off."
        >
          <input type="number" value={level} onChange={(e) => setLevel(e.target.value)} className="input text-right" />
        </DrawerField>
        <DrawerField label="Bin / location" hint="Where it sits in this store — the keeper's own shorthand.">
          <input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="e.g. Rack B3" className="input" />
        </DrawerField>
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          On hand is {fmtQty(row.onHand)} {row.item.unit}. This does not change stock — only when it warns you.
        </p>
      </div>
    </Drawer>
  );
}

