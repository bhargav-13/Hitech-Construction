"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Truck } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { InvoiceBuilder } from "@/components/vyapar/InvoiceBuilder";
import { getVendors } from "@/lib/purchaseApi";
import { vyaparUnit, type PoDraft } from "@/lib/poHandoff";
import { todayIST } from "@/lib/datetime";
import { getItems, type Item, type Party } from "@/lib/vyaparApi";
import { Select } from "@/components/Select";
import * as wh from "@/lib/warehouseApi";
import type { ApiUnbilledReceipt } from "@/lib/warehouseApi";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

/** How many deliveries on this project still have no bill — the badge on the Unbilled button. */
export async function countUnbilled(projectId: number | null): Promise<number> {
  if (projectId == null) return (await wh.getUnbilledAll().catch(() => [] as ApiUnbilledReceipt[])).length;
  return (await wh.getUnbilled(projectId).catch(() => [] as ApiUnbilledReceipt[])).length;
}

/**
 * Unbilled Materials, as Onsite has it under Project → Transaction: material a vendor delivered to
 * this site (a GRN) that no purchase bill covers yet. Pick a vendor, tick the deliveries, Next —
 * the Purchase Bill opens filled with them (quantity, rate, project, vendor). Saving it marks those
 * deliveries billed, so they leave this list; delete or cancel the bill and they come back.
 */
export function UnbilledMaterialDrawer({
  projectId,
  onClose,
  onBilled,
}: {
  /** Fixed to one project (Project → Transaction / Material); omitted = every site (Procurement). */
  projectId?: number | null;
  onClose: () => void;
  onBilled?: () => void;
}) {
  const [projectPick, setProjectPick] = useState("");
  const [rows, setRows] = useState<ApiUnbilledReceipt[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bill, setBill] = useState<{ draft: PoDraft; parties: Party[]; items: Item[]; ids: number[]; projectId: number } | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(projectId != null ? await wh.getUnbilled(projectId) : await wh.getUnbilledAll());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load unbilled material.");
      setRows([]);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Every-site view: narrow to one project. */
  const projectOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows ?? []) m.set(r.projectId, r.projectName ?? `Project #${r.projectId}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const scoped = useMemo(
    () => (rows ?? []).filter((r) => projectId != null || !projectPick || String(r.projectId) === projectPick),
    [rows, projectId, projectPick],
  );

  const vendors = useMemo(() => {
    const m = new Map<number, { id: number; name: string; count: number }>();
    for (const r of scoped) {
      const v = m.get(r.partyId) ?? { id: r.partyId, name: r.partyName ?? `Vendor #${r.partyId}`, count: 0 };
      v.count += 1;
      m.set(r.partyId, v);
    }
    const q = search.trim().toLowerCase();
    return [...m.values()].filter((v) => !q || v.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [scoped, search]);

  const vendorRows = useMemo(() => scoped.filter((r) => r.partyId === vendor), [scoped, vendor]);
  const vendorName = vendorRows[0]?.partyName ?? "";
  const allPicked = vendorRows.length > 0 && vendorRows.every((r) => picked.has(r.id));

  async function next() {
    const chosen = vendorRows.filter((r) => picked.has(r.id));
    if (!chosen.length) return;
    if (new Set(chosen.map((r) => r.projectId)).size > 1) {
      setError("A bill is for one site — tick deliveries from one project at a time.");
      return;
    }
    const billProject = chosen[0].projectId;
    setOpening(true);
    setError("");
    try {
      const [parties, items] = await Promise.all([getVendors(), getItems()]);
      const byId = new Map(items.map((i) => [i.id, i]));
      const numbers = [...new Set(chosen.map((r) => r.number))];
      const pos = [...new Set(chosen.map((r) => r.poNo).filter(Boolean))] as string[];
      const draft: PoDraft = {
        rfqId: 0,
        rfqNo: numbers.join(", ").slice(0, 120),
        partyId: chosen[0].partyId,
        partyName: chosen[0].partyName,
        projectId: billProject,
        orderDate: todayIST(),
        deliveryDate: null,
        terms: null,
        notes: `Material received: ${numbers.join(", ")}${pos.length ? ` (PO ${pos.join(", ")})` : ""}`,
        discountAmount: 0,
        lines: chosen.map((r) => {
          const item = byId.get(r.itemId);
          const tax = r.taxPercent || item?.taxPercent || 0;
          return {
            itemId: r.itemId,
            itemName: item?.name ?? r.itemName ?? `Item #${r.itemId}`,
            description: `${r.number}${r.poNo ? ` · ${r.poNo}` : ""} · ${dateLabel(r.movedOn)}`,
            unit: vyaparUnit(item?.unit ?? r.unit),
            quantity: r.quantity,
            rate: r.rate || item?.purchasePrice || 0,
            taxCode: tax ? `GST@${tax}` : "NONE",
          };
        }),
      };
      setBill({ draft, parties, items, ids: chosen.map((r) => r.id), projectId: billProject });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the purchase bill.");
    } finally {
      setOpening(false);
    }
  }

  if (bill) {
    return (
      <InvoiceBuilder
        docType="PURCHASE"
        parties={bill.parties}
        items={bill.items}
        projectId={bill.projectId}
        prefill={bill.draft}
        hideSaveAndNew
        createNew={(body) => wh.billUnbilled({ ...body, docType: "PURCHASE" }, bill.ids)}
        onClose={() => setBill(null)}
        onSaved={() => {
          setBill(null);
          setPicked(new Set());
          setVendor(null);
          setNotice("Purchase bill saved — those deliveries are now billed.");
          void load();
          onBilled?.();
        }}
      />
    );
  }

  return (
    <Drawer
      title={vendor == null ? "Unbilled Materials" : `Select material received · ${vendorName}`}
      onClose={onClose}
      width="max-w-2xl"
      guardOnClose={false}
      onSave={vendor == null ? undefined : () => void next()}
      saveLabel={opening ? "Opening…" : `Next${picked.size ? ` (${picked.size})` : ""}`}
    >
      <div className="space-y-3">
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {rows == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : vendor == null ? (
          <>
            {projectId == null && projectOptions.length > 1 && (
              <Select
                value={projectPick}
                onChange={setProjectPick}
                placeholder="All projects"
                options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: String(id), label: name }))]}
              />
            )}
            <div className="relative">
              <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor…"
                className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
              />
            </div>
            {vendors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
                <Truck size={22} className="mx-auto mb-2 text-gray-300" />
                {rows.length ? "No vendor matches." : "Everything received on this site has been billed."}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {vendors.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setVendor(v.id);
                      setPicked(new Set());
                    }}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent text-xs font-semibold text-white">
                      {v.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{v.name}</span>
                    <span className="text-sm text-gray-500">
                      <b className="text-gray-700">{v.count}</b> item{v.count === 1 ? "" : "s"}
                    </span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setVendor(null);
                  setPicked(new Set());
                }}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-accent"
              >
                <ChevronLeft size={15} /> All vendors
              </button>
              <span className="text-xs text-gray-500">{vendorRows.length} unbilled</span>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(vendorRows.map((r) => r.id)))}
                className="h-4 w-4 accent-cyan-600"
              />
              Select all ({picked.size})
            </label>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {vendorRows.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={picked.has(r.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-cyan-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">{r.itemName}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {projectId == null && r.projectName && <>{r.projectName} · </>}
                      {dateLabel(r.movedOn)} | {r.number}
                      {r.poNo && <> · {r.poNo}</>}
                      {r.rate > 0 && <> · ₹{fmt(r.rate)}/{r.unit ?? "unit"}</>}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold whitespace-nowrap text-gray-800">
                    {fmt(r.quantity)} <span className="text-xs font-normal text-gray-500">{r.unit ?? ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
