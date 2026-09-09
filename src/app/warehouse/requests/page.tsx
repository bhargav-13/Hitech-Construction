"use client";

import { useEffect, useMemo, useState } from "react";
import { WarehouseShell, WarehouseHeader, WarehouseEmpty } from "@/components/warehouse/WarehouseShell";
import { MovementDialog } from "@/components/warehouse/MovementDialog";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { TypeaheadPicker } from "@/components/vyapar/TypeaheadPicker";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { useWarehouseStore, stockOf, emptyRequest, warehouseUid } from "@/lib/warehouseStore";
import { useWarehouseScope, useWarehouseRights } from "@/lib/warehouseScope";
import { REQUEST_STATUS_META, type MaterialRequest, type RequestStatus } from "@/lib/warehouseTypes";
import { useProjects } from "@/lib/useProjects";
import { qty as fmtQty, bookDate } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { Check, ClipboardList, Plus, Search, Send, Trash2, X } from "lucide-react";

/**
 * Material requests — the site asking the store for something.
 *
 * The front of the buying chain, and the piece that was removed once on the reasoning that "there
 * is no warehouse, so there is nothing to draw against". There is now, so it comes back: a request
 * the store can fill becomes an issue, and one it cannot becomes an enquiry to a supplier.
 *
 * The **available** figure sits against every line as it is approved, because the decision being
 * made is exactly "can we fill this from what we have" — and answering it from a separate screen is
 * how a store promises the same ninety bags to two sites.
 */
export default function WarehouseRequestsPage() {
  const { warehouseId, warehouse } = useWarehouseScope();
  const rights = useWarehouseRights(warehouseId);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const requests = useWarehouseStore((s) => s.requests);
  const movements = useWarehouseStore((s) => s.movements);
  const saveRequest = useWarehouseStore((s) => s.saveRequest);
  const setRequestStatus = useWarehouseStore((s) => s.setRequestStatus);
  const removeRequest = useWarehouseStore((s) => s.removeRequest);
  const { projects } = useProjects();

  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
  }, []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<RequestStatus | "ALL">("ALL");
  const [editing, setEditing] = useState<MaterialRequest | null>(null);
  const [issuing, setIssuing] = useState<{ requestId: string; itemId: number } | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return requests
      .filter((r) => warehouseId === "all" || r.warehouseId === warehouseId)
      .filter((r) => tab === "ALL" || r.status === tab)
      .filter(
        (r) =>
          !needle ||
          r.number.toLowerCase().includes(needle) ||
          (projects.find((p) => p.id === r.projectId)?.name ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn));
  }, [requests, warehouseId, tab, q, projects]);

  const counts = useMemo(() => {
    const scoped = requests.filter((r) => warehouseId === "all" || r.warehouseId === warehouseId);
    const out: Record<string, number> = { ALL: scoped.length };
    for (const s of Object.keys(REQUEST_STATUS_META)) out[s] = scoped.filter((r) => r.status === s).length;
    return out;
  }, [requests, warehouseId]);

  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—");
  const itemName = (id: number) => itemById.get(id)?.name ?? `Item ${id}`;

  return (
    <WarehouseShell>
      <WarehouseHeader
        title="Material Requests"
        subtitle="What the sites have asked for. Fill it from stock, or turn what you cannot into an enquiry."
        right={
          <button
            onClick={() => setEditing(emptyRequest(warehouse?.id ?? warehouses[0]?.id ?? "", null))}
            disabled={!warehouse}
            title={warehouse ? "Raise a request" : "Pick a single store first"}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={15} /> New Request
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search request number or site…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["ALL", "PENDING", "APPROVED", "PARTIAL", "ISSUED", "REJECTED"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                tab === t ? "bg-brand-accent text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t === "ALL" ? "All" : REQUEST_STATUS_META[t].label} ({counts[t] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <WarehouseEmpty
          icon={ClipboardList}
          title={requests.length === 0 ? "No requests yet" : "Nothing in this view"}
          hint={
            requests.length === 0
              ? "A site raises a request for what it needs; the store fills what it has and buys the rest."
              : "Try another tab or clear the search."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const meta = REQUEST_STATUS_META[r.status];
            const decided = r.status !== "PENDING" && r.status !== "DRAFT";
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">{r.number}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.chip}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {projectName(r.projectId)} · raised {bookDate(r.raisedOn)}
                      {r.neededBy && ` · needed by ${bookDate(r.neededBy)}`}
                    </div>
                    {r.decisionNote && <div className="mt-1 text-xs text-gray-400">“{r.decisionNote}”</div>}
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => setRequestStatus(r.id, "APPROVED")}
                          disabled={!rights.canApprove}
                          title={rights.canApprove ? "Approve" : (rights.reason ?? "Needs supervisor access")}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Check size={13} /> Approve
                        </button>
                        <button
                          onClick={() => {
                            const why = prompt("Why is this being rejected?");
                            if (why !== null) setRequestStatus(r.id, "REJECTED", why || undefined);
                          }}
                          disabled={!rights.canApprove}
                          className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X size={13} /> Reject
                        </button>
                      </>
                    )}
                    <RowMenu align="right" buttonLabel={`Actions for ${r.number}`}>
                      {(close) => (
                        <>
                          <RowMenuItem
                            icon={ClipboardList}
                            label="View / edit"
                            onClick={() => { close(); setEditing(r); }}
                          />
                          <RowMenuItem
                            icon={Send}
                            label="Raise an enquiry for the shortfall"
                            disabled
                            disabledHint="Arrives with the procurement link — the shortfall becomes an RFQ."
                            onClick={() => close()}
                          />
                          <RowMenuDivider />
                          <RowMenuItem
                            icon={Trash2}
                            label="Delete"
                            tone="danger"
                            disabled={decided}
                            disabledHint="A decided request is a record — reject it instead of deleting it."
                            onClick={() => { close(); if (confirm(`Delete ${r.number}?`)) removeRequest(r.id); }}
                          />
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>

                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                      <th className="px-4 py-2">Item</th>
                      <th className="w-28 px-3 py-2 text-right">Asked</th>
                      <th className="w-28 px-3 py-2 text-right">Issued</th>
                      <th className="w-32 px-3 py-2 text-right">In store</th>
                      <th className="w-28 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => {
                      const onHand = stockOf(movements, r.warehouseId, l.itemId);
                      const outstanding = l.quantity - l.issuedQuantity;
                      const short = onHand < outstanding;
                      return (
                        <tr key={l.id} className="border-b border-gray-50 last:border-b-0">
                          <td className="px-4 py-2 text-gray-800">{itemName(l.itemId)}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtQty(l.quantity)}</td>
                          <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                            {fmtQty(l.issuedQuantity)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${
                              short ? "font-medium text-amber-700" : "text-gray-500"
                            }`}
                          >
                            {fmtQty(onHand)}
                            {short && outstanding > 0 && (
                              <span className="ml-1 text-[11px]">short {fmtQty(outstanding - onHand)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {outstanding > 0 && (r.status === "APPROVED" || r.status === "PARTIAL") && (
                              <button
                                onClick={() => setIssuing({ requestId: r.id, itemId: l.itemId })}
                                disabled={!rights.canMove}
                                title={rights.canMove ? "Issue against this line" : (rights.reason ?? "")}
                                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-brand-accent hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Issue
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {r.lines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                          Nothing on this request yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <RequestDialog
          request={editing}
          items={items}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            saveRequest(r);
            setEditing(null);
          }}
        />
      )}

      {issuing && warehouse && (
        <MovementDialog
          kind="ISSUE"
          warehouseId={warehouse.id}
          presetItemId={issuing.itemId}
          onClose={() => setIssuing(null)}
        />
      )}
    </WarehouseShell>
  );
}

function RequestDialog({
  request,
  items,
  onClose,
  onSave,
}: {
  request: MaterialRequest;
  items: Item[];
  onClose: () => void;
  onSave: (r: MaterialRequest) => void;
}) {
  const { projects } = useProjects();
  const movements = useWarehouseStore((s) => s.movements);
  const [projectId, setProjectId] = useState(request.projectId ?? "");
  const [neededBy, setNeededBy] = useState(request.neededBy ?? "");
  const [note, setNote] = useState(request.note ?? "");
  const [lines, setLines] = useState(
    request.lines.length ? request.lines : [{ id: warehouseUid("rl"), itemId: 0, quantity: 1, issuedQuantity: 0 }],
  );
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const l of request.lines) out[l.id] = items.find((i) => i.id === l.itemId)?.name ?? "";
    return out;
  });
  const [error, setError] = useState("");

  const setLine = (id: string, patch: Partial<(typeof lines)[number]>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  function save() {
    const clean = lines.filter((l) => l.itemId > 0 && l.quantity > 0);
    if (!projectId) return setError("Which site is asking?");
    if (clean.length === 0) return setError("Add at least one item.");
    onSave({ ...request, projectId, neededBy: neededBy || null, note: note.trim() || null, lines: clean });
  }

  return (
    <Drawer
      title={request.number ? `Request ${request.number}` : "New Material Request"}
      onClose={onClose}
      onSave={save}
      saveLabel="Save Request"
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DrawerField label="Site" required>
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="Which site is asking"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </DrawerField>
          <DrawerField label="Needed by">
            <DatePicker value={neededBy} onChange={setNeededBy} placeholder="When it is wanted" />
          </DrawerField>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="px-3 py-2">Item</th>
                <th className="w-24 px-3 py-2 text-right">Qty</th>
                <th className="w-28 px-3 py-2 text-right">In store</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-3 py-2">
                    <TypeaheadPicker<Item>
                      value={texts[l.id] ?? ""}
                      onChange={(text) => {
                        setTexts((t) => ({ ...t, [l.id]: text }));
                        setLine(l.id, { itemId: 0 });
                      }}
                      rows={items}
                      getKey={(i) => i.id}
                      getLabel={(i) => i.name}
                      columns={[
                        {
                          label: "In store",
                          get: (i) => fmtQty(stockOf(movements, request.warehouseId, i.id)),
                          align: "right",
                        },
                      ]}
                      onPick={(i) => {
                        setTexts((t) => ({ ...t, [l.id]: i.name }));
                        setLine(l.id, { itemId: i.id });
                      }}
                      placeholder="Search the catalogue"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={l.quantity}
                      onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400 tabular-nums">
                    {l.itemId > 0 ? fmtQty(stockOf(movements, request.warehouseId, l.itemId)) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                        aria-label="Remove line"
                        className="rounded-md p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td colSpan={4} className="px-3 py-2">
                  <button
                    onClick={() =>
                      setLines((p) => [...p, { id: warehouseUid("rl"), itemId: 0, quantity: 1, issuedQuantity: 0 }])
                    }
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all hover:border-brand-accent hover:text-brand-accent active:scale-95"
                  >
                    <Plus size={12} /> Add item
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <DrawerField label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything the store should know — where on site it is wanted, who to hand it to"
            className="input resize-none"
          />
        </DrawerField>
      </div>
    </Drawer>
  );
}
