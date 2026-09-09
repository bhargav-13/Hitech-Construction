"use client";

import { useEffect, useMemo, useState } from "react";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { MovementDialog } from "@/components/warehouse/MovementDialog";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useWarehouseStore, checkoutsOf } from "@/lib/warehouseStore";
import { useWarehouseScope, useWarehouseRights } from "@/lib/warehouseScope";
import { useProjects } from "@/lib/useProjects";
import { useUsers } from "@/lib/useUsers";
import { qty as fmtQty, bookDate } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { Handshake, Search, Undo2 } from "lucide-react";

/**
 * Returnables that are still out.
 *
 * Tools, shuttering, breakers, safety gear — issued to a person and expected back. This is the list
 * a store keeper reads on a Friday, and the only column that really matters is **days out**: an
 * angle grinder that has been with someone for ninety days is either lost or has quietly become
 * theirs, and neither shows up anywhere else in the system.
 *
 * Derived from movements rather than kept as its own record — an issue to a person opens a checkout
 * and returns close it — so the list can never disagree with the ledger behind it.
 */
export default function WarehouseCheckoutsPage() {
  const { warehouseId, warehouse } = useWarehouseScope();
  const rights = useWarehouseRights(warehouseId);
  const movements = useWarehouseStore((s) => s.movements);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const { projects } = useProjects();
  const { users } = useUsers();

  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
  }, []);

  const [q, setQ] = useState("");
  const [returning, setReturning] = useState<number | null>(null);

  const rows = useMemo(
    () => checkoutsOf(movements, warehouseId === "all" ? undefined : warehouseId),
    [movements, warehouseId],
  );

  const itemName = (id: number) => items.find((i) => i.id === id)?.name ?? `Item ${id}`;
  const userName = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "—") : "—");
  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—");
  const storeCode = (id: string) => warehouses.find((w) => w.id === id)?.code ?? "—";

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        itemName(r.itemId).toLowerCase().includes(needle) ||
        userName(r.issuedToUserId).toLowerCase().includes(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, items, users]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    visible,
    {
      item: (r) => itemName(r.itemId),
      person: (r) => userName(r.issuedToUserId),
      out: (r) => r.outstanding,
      days: (r) => r.daysOut,
    },
    { key: "days", dir: "desc" },
  );

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Checkouts"
        subtitle="Returnables with someone. The oldest are at the top — that is usually the useful end."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item or person…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-800 tabular-nums">{visible.length}</span> still out
        </span>
      </div>

      {sorted.length === 0 ? (
        <WarehouseEmpty
          icon={Handshake}
          title={rows.length === 0 ? "Nothing is out" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Issue a returnable to a person and it appears here until it comes back."
              : "Clear the search to see the rest."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <SortTh label="Item" sortKey="item" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="With" sortKey="person" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <th className="px-3 py-2 font-medium">Site</th>
                {warehouseId === "all" && <th className="px-3 py-2 font-medium">Store</th>}
                <SortTh label="Out" sortKey="out" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Days" sortKey="days" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                // Three months is where "borrowed" stops being a fair description.
                const stale = r.daysOut >= 90;
                const ageing = r.daysOut >= 30;
                return (
                  <tr
                    key={`${r.warehouseId}-${r.itemId}-${r.issuedToUserId}`}
                    className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800">{itemName(r.itemId)}</div>
                      <div className="text-[11px] text-gray-400">since {bookDate(r.issuedOn)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{userName(r.issuedToUserId)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{projectName(r.projectId)}</td>
                    {warehouseId === "all" && <td className="px-3 py-2.5 text-gray-500">{storeCode(r.warehouseId)}</td>}
                    <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">
                      {fmtQty(r.outstanding)}
                      {r.returnedQuantity > 0 && (
                        <span className="ml-1 text-[11px] font-normal text-gray-400">
                          of {fmtQty(r.issuedQuantity)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${
                          stale
                            ? "bg-rose-50 text-rose-700"
                            : ageing
                              ? "bg-amber-50 text-amber-700"
                              : "text-gray-500"
                        }`}
                      >
                        {r.daysOut}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => setReturning(r.itemId)}
                        disabled={!rights.canMove}
                        title={rights.canMove ? "Record the return" : (rights.reason ?? "")}
                        className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Undo2 size={12} /> Return
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {returning != null && warehouse && (
        <MovementDialog
          kind="RETURN"
          warehouseId={warehouse.id}
          presetItemId={returning}
          onClose={() => setReturning(null)}
        />
      )}
    </WarehouseShell>
  );
}
