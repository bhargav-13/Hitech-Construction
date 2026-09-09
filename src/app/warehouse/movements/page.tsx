"use client";

import { useEffect, useMemo, useState } from "react";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { MovementDialog } from "@/components/warehouse/MovementDialog";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useWarehouseStore, signedQty } from "@/lib/warehouseStore";
import { useWarehouseScope, useWarehouseRights } from "@/lib/warehouseScope";
import { MOVEMENT_META, type MovementKind } from "@/lib/warehouseTypes";
import { useProjects } from "@/lib/useProjects";
import { useUsers } from "@/lib/useUsers";
import { exportRowsToCsv } from "@/lib/vyaparExport";
import { inr, qty as fmtQty, bookDate } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item, Party } from "@/lib/vyaparApi";
import { ArrowLeftRight, Download, Search, SlidersHorizontal } from "lucide-react";

/**
 * The movement ledger — every receipt, issue, transfer, return and adjustment, in one list.
 *
 * This is the module's audit trail, and it is deliberately one screen rather than four. A keeper
 * reconciling a shortage does not think "was that an issue or a transfer" — they think "what
 * happened to the cement last week", and the answer has to be readable in one place, in order.
 *
 * Nothing here is editable. A movement that was wrong is corrected by posting another one, which is
 * how a ledger stays a ledger.
 */
export default function WarehouseMovementsPage() {
  const { warehouseId, warehouse } = useWarehouseScope();
  const rights = useWarehouseRights(warehouseId);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const movements = useWarehouseStore((s) => s.movements);
  const { projects } = useProjects();
  const { users } = useUsers();

  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
    vyapar.getParties().then(setParties).catch(() => setParties([]));
  }, []);

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MovementKind | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const itemName = (id: number) => items.find((i) => i.id === id)?.name ?? `Item ${id}`;
  const storeCode = (id: string | null) => (id ? (warehouses.find((w) => w.id === id)?.code ?? "—") : "—");
  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—");
  const partyName = (id: number | null) => (id ? (parties.find((p) => p.id === id)?.name ?? "—") : "—");
  const userName = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "—") : "—");

  /** Where the stock went or came from, as one readable phrase per row. */
  const counterparty = (m: (typeof movements)[number]) => {
    if (m.kind === "TRANSFER_OUT" || m.kind === "TRANSFER_IN") return `Store ${storeCode(m.counterWarehouseId)}`;
    if (m.kind === "RECEIPT") return m.partyId ? partyName(m.partyId) : (m.sourceDocNo ?? "—");
    if (m.kind === "ISSUE") {
      if (m.target === "PROJECT") return projectName(m.projectId);
      if (m.target === "SUBCONTRACTOR") return partyName(m.partyId);
      if (m.target === "WORKER") return userName(m.issuedToUserId);
      return "Scrapped";
    }
    if (m.kind === "RETURN") return userName(m.issuedToUserId);
    return m.note ?? "—";
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => {
      if (warehouseId !== "all" && m.warehouseId !== warehouseId) return false;
      if (kind !== "all" && m.kind !== kind) return false;
      if (from && m.movedOn < from) return false;
      if (to && m.movedOn > to) return false;
      if (!needle) return true;
      return (
        m.number.toLowerCase().includes(needle) ||
        itemName(m.itemId).toLowerCase().includes(needle) ||
        counterparty(m).toLowerCase().includes(needle) ||
        (m.note ?? "").toLowerCase().includes(needle) ||
        (m.sourceDocNo ?? "").toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, warehouseId, kind, from, to, q, items, parties, projects, users, warehouses]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    visible,
    {
      date: (m) => m.movedOn,
      number: (m) => m.number,
      item: (m) => itemName(m.itemId),
      kind: (m) => MOVEMENT_META[m.kind].label,
      qty: (m) => signedQty(m),
      value: (m) => m.quantity * m.rate,
    },
    { key: "date", dir: "desc" },
  );

  const totals = useMemo(
    () => ({
      in: visible.filter((m) => signedQty(m) > 0).reduce((a, m) => a + m.quantity, 0),
      out: visible.filter((m) => signedQty(m) < 0).reduce((a, m) => a + m.quantity, 0),
    }),
    [visible],
  );

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Movements"
        subtitle="Every change to stock, in order. Nothing here can be edited — a wrong entry is corrected by another."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportRowsToCsv(
                  "warehouse-movements",
                  ["Date", "Number", "Store", "Item", "Type", "Quantity", "Rate", "Counterparty", "Note"],
                  sorted.map((m) => [
                    m.movedOn,
                    m.number,
                    storeCode(m.warehouseId),
                    itemName(m.itemId),
                    MOVEMENT_META[m.kind].label,
                    signedQty(m),
                    m.rate,
                    counterparty(m),
                    m.note ?? "",
                  ]),
                )
              }
              disabled={sorted.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:opacity-40"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setAdjusting(true)}
              disabled={!rights.canApprove}
              title={rights.canApprove ? "Post a stock adjustment" : (rights.reason ?? "Needs supervisor access")}
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SlidersHorizontal size={14} /> Adjust stock
            </button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, item, party or note…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Select
          value={kind}
          onChange={(v) => setKind(v as MovementKind | "all")}
          size="sm"
          className="w-44"
          options={[
            { value: "all", label: "All movements" },
            ...(Object.keys(MOVEMENT_META) as MovementKind[])
              // Both halves of a transfer are listed; filtering by one shows that side only.
              .map((k) => ({ value: k, label: MOVEMENT_META[k].label })),
          ]}
        />
        <div className="w-36">
          <DatePicker value={from} onChange={setFrom} placeholder="From" />
        </div>
        <div className="w-36">
          <DatePicker value={to} onChange={setTo} min={from || undefined} placeholder="To" />
        </div>
        <span className="text-xs text-gray-500">
          In <span className="font-semibold text-emerald-700 tabular-nums">{fmtQty(totals.in)}</span> · Out{" "}
          <span className="font-semibold text-rose-700 tabular-nums">{fmtQty(totals.out)}</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <WarehouseEmpty
          icon={ArrowLeftRight}
          title={movements.length === 0 ? "Nothing has moved yet" : "Nothing matches these filters"}
          hint={
            movements.length === 0
              ? "Receive material into a store and the first entry appears here."
              : "Widen the date range or clear the search."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <SortTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Number" sortKey="number" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                {warehouseId === "all" && <th className="px-3 py-2 font-medium">Store</th>}
                <SortTh label="Item" sortKey="item" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Type" sortKey="kind" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <th className="px-3 py-2 font-medium">To / from</th>
                <SortTh label="Qty" sortKey="qty" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Value" sortKey="value" align="right" activeKey={sortKey} dir={sortDir} onSort={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const meta = MOVEMENT_META[m.kind];
                const signed = signedQty(m);
                return (
                  <tr key={m.id} className="border-b border-gray-50 last:border-b-0 even:bg-gray-50/40">
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{bookDate(m.movedOn)}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-800">{m.number}</td>
                    {warehouseId === "all" && <td className="px-3 py-2.5 text-gray-600">{storeCode(m.warehouseId)}</td>}
                    <td className="px-3 py-2.5">
                      <div className="text-gray-800">{itemName(m.itemId)}</div>
                      {m.note && <div className="truncate text-[11px] text-gray-400">{m.note}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.chip}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {counterparty(m)}
                      {m.sourceDocNo && <span className="ml-1 text-[11px] text-gray-400">· {m.sourceDocNo}</span>}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        signed > 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {signed > 0 ? "+" : "−"}
                      {fmtQty(Math.abs(m.quantity))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                      {m.rate ? inr(m.quantity * m.rate) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjusting && warehouse && (
        <MovementDialog kind="ADJUSTMENT" warehouseId={warehouse.id} onClose={() => setAdjusting(false)} />
      )}
    </WarehouseShell>
  );
}
