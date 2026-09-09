"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { useWarehouseStore, checkoutsOf, stockByItem, signedQty } from "@/lib/warehouseStore";
import { useWarehouseScope } from "@/lib/warehouseScope";
import { MOVEMENT_META } from "@/lib/warehouseTypes";
import { inr, qty as fmtQty } from "@/lib/format";
import { bookDate } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { AlertTriangle, ArrowRight, ClipboardList, Handshake, IndianRupee, Warehouse as WarehouseIcon } from "lucide-react";

/**
 * The store at a glance.
 *
 * Four numbers, and each one is a reason to act rather than a reason to feel informed: what the
 * stock is worth, what has fallen under its reorder level, what is waiting on a decision, and what
 * has been lent out and not come back. A dashboard that shows only totals gets looked at once.
 */
export default function WarehouseDashboardPage() {
  const { warehouseId, warehouse } = useWarehouseScope();
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const movements = useWarehouseStore((s) => s.movements);
  const requests = useWarehouseStore((s) => s.requests);
  const settings = useWarehouseStore((s) => s.settings);

  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
  }, []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const stores = useMemo(
    () => warehouses.filter((w) => w.isActive && w.kind !== "TRANSIT" && (warehouseId === "all" || w.id === warehouseId)),
    [warehouses, warehouseId],
  );

  const summary = useMemo(() => {
    let value = 0;
    let lines = 0;
    const low: { itemId: number; warehouseId: string; onHand: number; reorderLevel: number }[] = [];

    for (const w of stores) {
      const onHand = stockByItem(movements, w.id);
      for (const [itemId, quantity] of onHand) {
        if (quantity !== 0) lines++;
        value += quantity * (itemById.get(itemId)?.purchasePrice ?? 0);
        const setting = settings.find((s) => s.warehouseId === w.id && s.itemId === itemId);
        if (setting && setting.reorderLevel > 0 && quantity <= setting.reorderLevel) {
          low.push({ itemId, warehouseId: w.id, onHand: quantity, reorderLevel: setting.reorderLevel });
        }
      }
    }

    const scoped = warehouseId === "all" ? movements : movements.filter((m) => m.warehouseId === warehouseId);
    return {
      value,
      lines,
      low,
      pending: requests.filter(
        (r) => (warehouseId === "all" || r.warehouseId === warehouseId) && r.status === "PENDING",
      ).length,
      out: checkoutsOf(scoped, warehouseId === "all" ? undefined : warehouseId),
      recent: [...scoped].sort((a, b) => b.movedOn.localeCompare(a.movedOn)).slice(0, 8),
    };
  }, [stores, movements, requests, settings, itemById, warehouseId]);

  const nameOf = (id: number) => itemById.get(id)?.name ?? `Item ${id}`;
  const storeName = (id: string) => warehouses.find((w) => w.id === id)?.code ?? "—";

  const nothingYet = movements.length === 0 && requests.length === 0;

  return (
    <WarehouseShell>
      <WarehouseHeader
        title={warehouse ? warehouse.name : "All stores"}
        subtitle="What is on hand, what is running out, and what is still owed back."
      />

      {nothingYet ? (
        <WarehouseEmpty
          icon={WarehouseIcon}
          title="Nothing in the stores yet"
          hint="Set up your stores first, then receive material into one — every figure in this module is built from those movements."
          action={
            <Link
              href="/warehouse/locations"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Set up warehouses <ArrowRight size={14} />
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icon={IndianRupee}
              label="Stock value"
              value={inr(summary.value)}
              hint={`${summary.lines} item${summary.lines === 1 ? "" : "s"} on hand`}
              accent="cyan"
            />
            <Tile
              icon={AlertTriangle}
              label="Below reorder level"
              value={String(summary.low.length)}
              hint={summary.low.length ? "Needs buying" : "Nothing running out"}
              accent={summary.low.length ? "amber" : "gray"}
              href="/warehouse/stock"
            />
            <Tile
              icon={ClipboardList}
              label="Requests pending"
              value={String(summary.pending)}
              hint={summary.pending ? "Waiting on a decision" : "Nothing waiting"}
              accent={summary.pending ? "violet" : "gray"}
              href="/warehouse/requests"
            />
            <Tile
              icon={Handshake}
              label="Still out"
              value={String(summary.out.length)}
              hint={summary.out.length ? "Returnables with someone" : "Everything back"}
              accent={summary.out.length ? "rose" : "gray"}
              href="/warehouse/checkouts"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Running low" href="/warehouse/stock" empty="Nothing is under its reorder level.">
              {summary.low.slice(0, 6).map((l) => (
                <div key={`${l.warehouseId}-${l.itemId}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-800">{nameOf(l.itemId)}</div>
                    <div className="text-[11px] text-gray-400">
                      {storeName(l.warehouseId)} · reorder at {fmtQty(l.reorderLevel)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 tabular-nums">
                    {fmtQty(l.onHand)} left
                  </span>
                </div>
              ))}
            </Panel>

            <Panel title="Latest movements" href="/warehouse/movements" empty="No stock has moved yet.">
              {summary.recent.map((m) => {
                const meta = MOVEMENT_META[m.kind];
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-800">{nameOf(m.itemId)}</div>
                      <div className="text-[11px] text-gray-400">
                        {m.number} · {bookDate(m.movedOn)} · {storeName(m.warehouseId)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums ${meta.chip}`}
                    >
                      {signedQty(m) > 0 ? "+" : "−"}
                      {fmtQty(Math.abs(m.quantity))}
                    </span>
                  </div>
                );
              })}
            </Panel>
          </div>
        </div>
      )}
    </WarehouseShell>
  );
}

const ACCENTS: Record<string, string> = {
  cyan: "bg-cyan-50 text-brand-accent",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
  gray: "bg-gray-100 text-gray-400",
};

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  href,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  hint: string;
  accent: keyof typeof ACCENTS | string;
  href?: string;
}) {
  const body = (
    <div className="flex h-full items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all duration-150 hover:border-brand-accent">
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold text-gray-900 tabular-nums">{value}</div>
        <div className="mt-0.5 truncate text-[11px] text-gray-400">{hint}</div>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ACCENTS[accent] ?? ACCENTS.gray}`}>
        <Icon size={16} />
      </span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({
  title,
  href,
  empty,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  children: React.ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <Link href={href} className="text-xs font-medium text-brand-accent hover:underline">
          See all
        </Link>
      </div>
      <div className="divide-y divide-gray-50 px-4 py-1">
        {isEmpty ? <p className="py-8 text-center text-sm text-gray-400">{empty}</p> : children}
      </div>
    </section>
  );
}
