"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, PackageOpen, Search, ShoppingCart, X } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { RowMenu, RowMenuItem } from "@/components/RowMenu";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { PendingReceiveDrawer, countPendingToReceive } from "@/components/material/PendingReceiveDrawer";
import { useProjects } from "@/lib/useProjects";
import { useCan } from "@/lib/permissions";
import { todayIST } from "@/lib/datetime";
import { vyaparUnit, type PoDraft } from "@/lib/poHandoff";
import { createPurchaseOrder, getVendors } from "@/lib/purchaseApi";
import { getItems, type Item, type Party } from "@/lib/vyaparApi";
import * as wh from "@/lib/warehouseApi";
import type { ApiMaterialRequest, ApiPoOption, ApiRequestLine } from "@/lib/warehouseApi";

const qty = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * The two panels Onsite puts on its Purchase Order bar: Pending to Receive (what suppliers still owe
 * against approved POs, and transfers on their way in) and Material Requests (every site's purchase
 * requests: approve, reject, close, and turn approved lines into a PO). Badges show what is waiting.
 */
export function PoTrackingButtons() {
  const can = useCan();
  const [open, setOpen] = useState<"pending" | "requests" | null>(null);
  const [counts, setCounts] = useState<{ pending: number; requests: number }>({ pending: 0, requests: 0 });
  const canRequests = can(["PROCUREMENT_PURCHASES:VIEW", "WAREHOUSE_REQUESTS:APPROVE"]);

  const refresh = useCallback(async () => {
    const [pending, reqs] = await Promise.all([
      countPendingToReceive(null).catch(() => 0),
      canRequests ? wh.getPurchaseRequests().catch(() => [] as ApiMaterialRequest[]) : Promise.resolve([] as ApiMaterialRequest[]),
    ]);
    const waiting = reqs.reduce((n, r) => n + r.lines.filter((l) => bucketOf(r, l) === "PENDING" || bucketOf(r, l) === "APPROVED").length, 0);
    setCounts({ pending, requests: waiting });
  }, [canRequests]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex items-center gap-2">
      <BadgeButton icon={<PackageOpen size={15} />} label="Pending to receive" count={counts.pending} onClick={() => setOpen("pending")} />
      {canRequests && (
        <BadgeButton icon={<ClipboardList size={15} />} label="Material requests" count={counts.requests} onClick={() => setOpen("requests")} />
      )}
      {open === "pending" && (
        <PendingReceiveDrawer
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
      {open === "requests" && (
        <MaterialRequestsDrawer
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export function BadgeButton({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-accent hover:text-brand-accent"
    >
      {icon} {label}
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[18px] rounded-full bg-violet-600 px-1 text-center text-[10px] leading-[18px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- material requests

type Bucket = "PENDING" | "APPROVED" | "ORDERED" | "REJECTED";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "ORDERED", label: "Ordered" },
  { key: "REJECTED", label: "Rejected" },
];

/**
 * Where one line of one request sits, Onsite style. A line's own decision wins; a line with none
 * follows its request (pending while the request is, approved once the whole request was).
 */
export function bucketOf(r: ApiMaterialRequest, l: ApiRequestLine): Bucket {
  const s = l.lineStatus;
  if (s === "REJECTED" || r.status === "REJECTED") return "REJECTED";
  if (s === "CLOSED" || s === "ORDERED" || s === "PART_ORDERED" || (l.orderedQuantity ?? 0) > 0) return "ORDERED";
  if (r.requestType === "ISSUE" && (l.issuedQuantity ?? 0) > 0) return "ORDERED";
  if (s === "APPROVED") return "APPROVED";
  if (r.status === "PENDING" || r.status === "DRAFT") return "PENDING";
  return "APPROVED";
}

/**
 * Material requests, Onsite style: Pending / Approved / Ordered / Rejected, grouped by project.
 *
 * In Procurement it lists every site's purchase requests; on a project's material page
 * (`projectId`) it lists that project's requests of both kinds — store requests to Central and
 * purchase requests — so the site can follow what it asked for.
 */
export function MaterialRequestsDrawer({ onClose, projectId }: { onClose: () => void; projectId?: number }) {
  const { projects } = useProjects();
  const can = useCan();
  const canOrder = can(["PROCUREMENT_PURCHASES:CREATE", "WAREHOUSE_REQUESTS:APPROVE"]);
  const canDecide = can(["PROCUREMENT_PURCHASES:CREATE", "WAREHOUSE_REQUESTS:APPROVE"]);
  const [bucket, setBucket] = useState<Bucket>(projectId ? "PENDING" : "APPROVED");
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ApiMaterialRequest[] | null>(null);
  const [error, setError] = useState("");
  const [ordering, setOrdering] = useState<{ r: ApiMaterialRequest; l: ApiRequestLine } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [poFor, setPoFor] = useState<{ draft: PoDraft; parties: Party[]; items: Item[] } | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(projectId ? await wh.getProjectRequests(projectId) : await wh.getPurchaseRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load material requests.");
      setRows([]);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const projectName = useMemo(() => new Map(projects.map((p) => [Number(p.id), p.name])), [projects]);

  const lines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { r: ApiMaterialRequest; l: ApiRequestLine; b: Bucket }[] = [];
    for (const r of rows ?? []) {
      if (!projectId && project && String(r.projectId ?? "") !== project) continue;
      for (const l of r.lines) {
        const b = bucketOf(r, l);
        if (q && ![l.itemName, r.number, l.poRefs].some((v) => (v ?? "").toLowerCase().includes(q))) continue;
        out.push({ r, l, b });
      }
    }
    return out;
  }, [rows, project, projectId, search]);

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

  const keyOf = (r: ApiMaterialRequest, l: ApiRequestLine) => `${r.id}:${l.id}`;
  const pickedLines = lines.filter((x) => picked.has(keyOf(x.r, x.l)));
  const pickProblem =
    pickedLines.length && new Set(pickedLines.map((x) => x.r.projectId)).size > 1 ? "Pick lines for one project at a time — a PO is for one site." : "";

  async function decide(r: ApiMaterialRequest, l: ApiRequestLine, status: "APPROVED" | "REJECTED" | "CLOSED" | "PENDING") {
    let note: string | null = null;
    if (status === "REJECTED" || status === "CLOSED") {
      const why = window.prompt(`${status === "REJECTED" ? "Reject" : "Close"} ${l.itemName} on ${r.number}?\n\nNote (optional):`, "");
      if (why === null) return;
      note = why.trim() || null;
    }
    setBusy(keyOf(r, l));
    setError("");
    try {
      await wh.setRequestLineStatus(r.id, l.id, status, note);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the request.");
    } finally {
      setBusy(null);
    }
  }

  async function createPo() {
    if (!pickedLines.length || pickProblem) return;
    setError("");
    setBusy("po");
    try {
      const [parties, items] = await Promise.all([getVendors(), getItems()]);
      const byId = new Map(items.map((i) => [i.id, i]));
      const first = pickedLines[0].r;
      const merged = new Map<number, { quantity: number; name: string; unit: string | null }>();
      for (const { l } of pickedLines) {
        const left = Math.max(0, l.quantity - (l.orderedQuantity ?? 0));
        const cur = merged.get(l.itemId);
        merged.set(l.itemId, { quantity: (cur?.quantity ?? 0) + left, name: l.itemName ?? `Item #${l.itemId}`, unit: l.unit });
      }
      const numbers = [...new Set(pickedLines.map((x) => x.r.number))];
      const draft: PoDraft = {
        rfqId: 0,
        rfqNo: numbers.join(", "),
        partyId: null,
        partyName: null,
        projectId: first.projectId,
        orderDate: todayIST(),
        deliveryDate: pickedLines.map((x) => x.r.neededBy).filter(Boolean).sort()[0] ?? null,
        terms: null,
        notes: `Against material request ${numbers.join(", ")}`,
        discountAmount: 0,
        lines: [...merged.entries()].map(([itemId, m]) => {
          const item = byId.get(itemId);
          return {
            itemId,
            itemName: item?.name ?? m.name,
            description: "",
            unit: vyaparUnit(item?.unit ?? m.unit),
            quantity: m.quantity,
            rate: item?.purchasePrice ?? 0,
            taxCode: item?.taxPercent ? `GST@${item.taxPercent}` : "NONE",
          };
        }),
        mrLines: pickedLines.map(({ r, l }) => ({
          requestId: r.id,
          requestNo: r.number,
          lineId: l.id,
          itemId: l.itemId,
          quantity: Math.max(0, l.quantity - (l.orderedQuantity ?? 0)),
        })),
      };
      setPoFor({ draft, parties, items });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the purchase order form.");
    } finally {
      setBusy(null);
    }
  }

  if (poFor) {
    return (
      <InvoiceBuilder
        docType="PURCHASE_ORDER"
        parties={poFor.parties}
        items={poFor.items}
        prefill={poFor.draft}
        createNew={createPurchaseOrder}
        onClose={() => setPoFor(null)}
        onSaved={() => {
          setPoFor(null);
          setPicked(new Set());
          setNotice("Purchase order raised — the request lines are now on order.");
          setBucket("ORDERED");
          void load();
        }}
      />
    );
  }

  return (
    <Drawer title="Material requests" onClose={onClose} width="max-w-4xl" guardOnClose={false}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => {
                setBucket(b.key);
                setPicked(new Set());
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${
                bucket === b.key ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {b.label} <span className="ml-1 text-xs opacity-70">{counts[b.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!projectId && (
            <div className="w-56">
              <Select
                value={project}
                onChange={setProject}
                placeholder="All projects"
                options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          )}
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
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {rows == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : byProject.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-[11px] tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Asked</th>
                  <th className="px-3 py-2 text-right font-medium">In stock</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                  <th className="w-32 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {byProject.map(([projectLabel, items]) => (
                  <ProjectRows
                    key={projectLabel}
                    project={projectLabel}
                    items={items}
                    canOrder={canOrder}
                    canDecide={canDecide}
                    busy={busy}
                    keyOf={keyOf}
                    picked={picked}
                    onPick={(k) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(k)) n.delete(k);
                        else n.add(k);
                        return n;
                      })
                    }
                    onDecide={(r, l, st) => void decide(r, l, st)}
                    onOrder={(r, l) => setOrdering({ r, l })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canOrder && pickedLines.length > 0 && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <span className="text-sm text-violet-900">{pickProblem || `${pickedLines.length} line(s) selected`}</span>
            <button
              type="button"
              disabled={!!pickProblem || busy === "po"}
              onClick={() => void createPo()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <ShoppingCart size={14} /> {busy === "po" ? "Opening…" : "Create PO"}
            </button>
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
  canDecide,
  busy,
  keyOf,
  picked,
  onPick,
  onDecide,
  onOrder,
}: {
  project: string;
  items: { r: ApiMaterialRequest; l: ApiRequestLine; b: Bucket }[];
  canOrder: boolean;
  canDecide: boolean;
  busy: string | null;
  keyOf: (r: ApiMaterialRequest, l: ApiRequestLine) => string;
  picked: Set<string>;
  onPick: (key: string) => void;
  onDecide: (r: ApiMaterialRequest, l: ApiRequestLine, status: "APPROVED" | "REJECTED" | "CLOSED" | "PENDING") => void;
  onOrder: (r: ApiMaterialRequest, l: ApiRequestLine) => void;
}) {
  return (
    <>
      <tr className="border-t border-gray-100 bg-slate-50">
        <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          {project}
        </td>
      </tr>
      {items.map(({ r, l, b }) => {
        const received = l.receivedQuantity ?? 0;
        const ordered = l.orderedQuantity ?? 0;
        const isStore = r.requestType === "ISSUE";
        const done = isStore ? l.issuedQuantity ?? 0 : received;
        const remaining = Math.max(0, l.quantity - done);
        const k = keyOf(r, l);
        const pickable = canOrder && !isStore && b === "APPROVED" && ordered < l.quantity;
        const decidable = canDecide && !isStore && b !== "REJECTED" && l.lineStatus !== "CLOSED";
        return (
          <tr key={k} className="border-t border-gray-50 align-top">
            <td className="px-3 py-2">
              {pickable && <input type="checkbox" checked={picked.has(k)} onChange={() => onPick(k)} className="h-4 w-4 accent-violet-600" />}
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1.5 font-medium text-gray-800">
                {l.itemName ?? `Item #${l.itemId}`}
                <span className={`rounded px-1 py-px text-[10px] font-medium ${isStore ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                  {isStore ? "From store" : "To buy"}
                </span>
              </div>
              <div className="text-[11px] text-gray-500">
                {r.number} · {r.raisedOn}
                {r.requestedByName && <> · {r.requestedByName}</>}
                {l.poRefs && <> · PO {l.poRefs}</>}
              </div>
              {(l.statusNote || r.note) && <div className="text-[11px] text-gray-400">{l.statusNote ?? r.note}</div>}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {qty(l.quantity)} <span className="text-[11px] text-gray-400">{l.unit ?? ""}</span>
            </td>
            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
              <div>{qty(l.onHand)}</div>
              {l.centralOnHand != null && <div className="text-[10px] text-gray-400">Central {qty(l.centralOnHand)}</div>}
            </td>
            <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{isStore ? "—" : qty(ordered)}</td>
            <td className="px-3 py-2 text-right text-emerald-700 tabular-nums">{qty(done)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${remaining > 0 ? "font-semibold text-amber-700" : "text-gray-400"}`}>{qty(remaining)}</td>
            <td className="px-3 py-2 text-right">
              {b === "ORDERED" && (
                <div className={`text-xs font-medium ${l.lineStatus === "CLOSED" ? "text-gray-500" : ordered >= l.quantity ? "text-blue-600" : "text-amber-600"}`}>
                  {l.lineStatus === "CLOSED" ? "Closed" : isStore ? (remaining === 0 ? "Issued" : "Part issued") : remaining === 0 ? "Fully received" : ordered >= l.quantity ? "Fully ordered" : "Part ordered"}
                </div>
              )}
              {b === "PENDING" && !decidable && <div className="text-xs text-amber-600">Awaiting approval</div>}
              {decidable && (
                <RowMenu
                  align="right"
                  width={170}
                  buttonLabel={`Decide ${l.itemName}`}
                  trigger={
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-accent">
                      {b === "PENDING" ? "Decide" : "Status"} <ChevronDown size={12} />
                    </span>
                  }
                  triggerClassName="rounded px-1 py-0.5 hover:bg-cyan-50 disabled:opacity-50"
                  disabled={busy === k}
                >
                  {(close) => (
                    <>
                      {b === "PENDING" && <RowMenuItem icon={ClipboardList} label="Approve" onClick={() => { close(); onDecide(r, l, "APPROVED"); }} />}
                      {b === "APPROVED" && <RowMenuItem icon={ClipboardList} label="Mark pending" onClick={() => { close(); onDecide(r, l, "PENDING"); }} />}
                      {ordered === 0 && <RowMenuItem icon={X} label="Reject" tone="danger" onClick={() => { close(); onDecide(r, l, "REJECTED"); }} />}
                      {b !== "PENDING" && <RowMenuItem icon={X} label="Close (no more needed)" tone="warning" onClick={() => { close(); onDecide(r, l, "CLOSED"); }} />}
                    </>
                  )}
                </RowMenu>
              )}
              {canOrder && !isStore && (b === "APPROVED" || (b === "ORDERED" && ordered < l.quantity && l.lineStatus !== "CLOSED")) && (
                <button onClick={() => onOrder(r, l)} className="mt-0.5 block w-full text-right text-xs font-medium text-gray-500 hover:text-brand-accent hover:underline">
                  Link to existing PO
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
