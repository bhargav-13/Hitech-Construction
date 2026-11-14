"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { TypeaheadPicker } from "@/components/vyapar/TypeaheadPicker";
import { todayIST } from "@/lib/datetime";
import * as wh from "@/lib/warehouseApi";
import type { ApiWarehouse } from "@/lib/warehouseApi";
import type { Item, Party } from "@/lib/vyaparApi";

export type MaterialEntryKind = "REQUEST" | "RECEIVED" | "USED" | "WASTAGE" | "SUBCON_ISSUE" | "TRANSFER";

export const ENTRY_TITLES: Record<MaterialEntryKind, string> = {
  REQUEST: "Request for Material",
  RECEIVED: "Material Received",
  USED: "Material Used",
  WASTAGE: "Material Wastage",
  SUBCON_ISSUE: "Issue to Subcontractor",
  TRANSFER: "Material Transfer",
};

const WASTAGE_TYPES = ["Damage", "Theft", "Lost"] as const;

interface Line {
  key: number;
  itemId: number | null;
  text: string;
  quantity: string;
  rate: string;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
let seq = 1;
const blankLine = (item?: Item): Line => ({
  key: seq++,
  itemId: item?.id ?? null,
  text: item?.name ?? "",
  quantity: "",
  rate: item?.purchasePrice ? String(item.purchasePrice) : "",
});

/**
 * One entry from the site, Onsite style: several materials under one number. The same form covers
 * a request, a delivery received (GRN), material used, wastage, material handed to a subcontractor
 * and a transfer to another site or the Central store. Stock is shown against every line that takes
 * material out, and the server refuses anything the site does not hold.
 */
export function MaterialEntryDrawer({
  kind,
  projectId,
  store,
  items,
  parties,
  stock,
  projects,
  initialItemId,
  onClose,
  onDone,
}: {
  kind: MaterialEntryKind;
  projectId: number;
  /** The project's site store; null until the project's first entry creates it. */
  store: ApiWarehouse | null;
  items: Item[];
  parties: Party[];
  /** On hand at the site, per item. */
  stock: Map<number, number>;
  /** Other projects, for a transfer's destination. */
  projects: { id: string; name: string }[];
  initialItemId?: number;
  onClose: () => void;
  /** `message` says what happened, e.g. where a request was routed. */
  onDone: (message?: string) => void;
}) {
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [lines, setLines] = useState<Line[]>(() => [blankLine(initialItemId ? itemById.get(initialItemId) : undefined)]);
  const [date, setDate] = useState(todayIST());
  const [neededBy, setNeededBy] = useState("");
  const [partyId, setPartyId] = useState("");
  const [challan, setChallan] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [note, setNote] = useState("");
  const [wastageType, setWastageType] = useState<string>("Damage");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const takesOut = kind === "USED" || kind === "WASTAGE" || kind === "SUBCON_ISSUE" || kind === "TRANSFER";
  const showRate = kind === "RECEIVED";
  const showParty = kind === "RECEIVED" || kind === "SUBCON_ISSUE";

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setError("");
    const clean = lines.filter((l) => l.itemId != null || l.text.trim());
    if (clean.length === 0) return setError("Add at least one material.");
    for (const l of clean) {
      if (l.itemId == null) return setError(`"${l.text}" isn't in the material list — pick it from the suggestions.`);
      const q = Number(l.quantity);
      if (!(q > 0)) return setError(`Enter a quantity for ${itemById.get(l.itemId)?.name ?? "each material"}.`);
    }
    if (takesOut) {
      const per = new Map<number, number>();
      for (const l of clean) per.set(l.itemId!, (per.get(l.itemId!) ?? 0) + Number(l.quantity));
      for (const [id, q] of per) {
        const have = stock.get(id) ?? 0;
        if (q > have) return setError(`The site holds ${fmt(have)} ${itemById.get(id)?.unit ?? ""} of ${itemById.get(id)?.name} — you can't take out ${fmt(q)}.`);
      }
    }
    if (kind === "SUBCON_ISSUE" && !partyId) return setError("Pick the subcontractor.");
    if (kind === "TRANSFER" && !destination) return setError("Pick where the material is going.");

    const payloadLines = clean.map((l) => ({
      itemId: l.itemId!,
      quantity: Number(l.quantity),
      rate: showRate && l.rate ? Number(l.rate) : null,
    }));
    setSaving(true);
    try {
      if (kind === "REQUEST") {
        const made = await wh.raiseMaterialRequest({
          projectId,
          neededBy: neededBy || null,
          note: note.trim() || null,
          lines: payloadLines.map(({ itemId, quantity }) => ({ itemId, quantity })),
        });
        const parts = made.map((r) =>
          r.requestType === "ISSUE"
            ? `${r.number} to the Central store (${r.lines.length} from stock)`
            : `${r.number} to procurement (${r.lines.length} to buy)`,
        );
        onDone(`Request raised: ${parts.join(" and ")}.`);
        return;
      }
      const site = store ?? (await wh.getSiteStore(projectId, true));
      if (!site) throw new Error("This project has no site store.");
      if (kind === "TRANSFER") {
        const moved = await wh.dispatchTransfer({
          fromWarehouseId: site.id,
          toCentral: destination === "central",
          toProjectId: destination !== "central" ? Number(destination) : null,
          movedOn: date,
          vehicleNo: vehicle.trim() || null,
          note: note.trim() || null,
          lines: payloadLines,
        });
        onDone(`${moved[0]?.number ?? "Transfer"} sent — it reaches the other end when they receive it.`);
        return;
      }
      const moved = await wh.recordSiteEntry({
        warehouseId: site.id,
        type: kind,
        movedOn: date,
        partyId: partyId ? Number(partyId) : null,
        sourceDocNo: challan.trim() || null,
        vehicleNo: vehicle.trim() || null,
        note: note.trim() || null,
        wastageType: kind === "WASTAGE" ? wastageType : null,
        lines: payloadLines,
      });
      onDone(`${moved[0]?.number ?? "Entry"} saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this entry.");
    } finally {
      setSaving(false);
    }
  }

  const partyOptions = parties.map((p) => ({ value: String(p.id), label: p.name }));

  return (
    <Drawer title={ENTRY_TITLES[kind]} onClose={onClose} onSave={() => void save()} saveLabel={saving ? "Saving…" : "Save"} width="max-w-2xl">
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DrawerField label={kind === "REQUEST" ? "Needed by" : "Date"}>
            {kind === "REQUEST" ? (
              <DatePicker value={neededBy} onChange={setNeededBy} placeholder="Optional" />
            ) : (
              <DatePicker value={date} onChange={setDate} placeholder="Date" />
            )}
          </DrawerField>
          {showParty && (
            <DrawerField label={kind === "RECEIVED" ? "Party / supplier" : "Subcontractor"} required={kind === "SUBCON_ISSUE"}>
              <Select value={partyId} onChange={setPartyId} placeholder="Select" options={[{ value: "", label: "—" }, ...partyOptions]} />
            </DrawerField>
          )}
          {kind === "TRANSFER" && (
            <DrawerField label="Send to" required>
              <Select
                value={destination}
                onChange={setDestination}
                placeholder="Select"
                options={[
                  { value: "", label: "Select" },
                  { value: "central", label: "Central store" },
                  ...projects.filter((p) => Number(p.id) !== projectId).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </DrawerField>
          )}
        </div>

        {kind === "REQUEST" && (
          <p className="rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            What the Central store has in stock is asked of the store; the rest goes to procurement to buy. A line the store
            can only partly cover is split between the two.
          </p>
        )}

        <div className="rounded-xl border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold text-gray-800">Materials ({lines.length})</span>
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, blankLine()])}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
            >
              <Plus size={13} /> Add material
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {lines.map((l) => {
              const item = l.itemId != null ? itemById.get(l.itemId) : undefined;
              const have = l.itemId != null ? stock.get(l.itemId) ?? 0 : null;
              return (
                <div key={l.key} className="grid grid-cols-12 items-start gap-2 px-3 py-2.5">
                  <div className={showRate ? "col-span-12 sm:col-span-6" : "col-span-12 sm:col-span-8"}>
                    <TypeaheadPicker<Item>
                      value={l.text}
                      onChange={(text) => setLine(l.key, { text, itemId: null })}
                      rows={items}
                      getKey={(i) => i.id}
                      getLabel={(i) => i.name}
                      columns={[
                        { label: "Unit", get: (i) => i.unit ?? "" },
                        { label: "At site", get: (i) => fmt(stock.get(i.id) ?? 0), align: "right" },
                      ]}
                      onPick={(i) => setLine(l.key, { itemId: i.id, text: i.name, rate: l.rate || (i.purchasePrice ? String(i.purchasePrice) : "") })}
                      placeholder="Search material"
                      inputClassName="input"
                    />
                    {have != null && (
                      <p className={`mt-1 text-[11px] ${takesOut && Number(l.quantity) > have ? "text-rose-600" : "text-gray-400"}`}>
                        At site: {fmt(have)} {item?.unit ?? ""}
                      </p>
                    )}
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <input
                      type="number"
                      min={0}
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      placeholder={`Qty${item?.unit ? ` (${item.unit})` : ""}`}
                      className="input"
                    />
                  </div>
                  {showRate && (
                    <div className="col-span-5 sm:col-span-3">
                      <input
                        type="number"
                        min={0}
                        value={l.rate}
                        onChange={(e) => setLine(l.key, { rate: e.target.value })}
                        placeholder="Rate (optional)"
                        className="input"
                      />
                    </div>
                  )}
                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      aria-label="Remove material"
                      disabled={lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded-md p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {kind === "WASTAGE" && (
          <DrawerField label="Wastage type">
            <div className="flex gap-4 pt-1">
              {WASTAGE_TYPES.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" checked={wastageType === t} onChange={() => setWastageType(t)} className="h-4 w-4 accent-cyan-600" />
                  {t}
                </label>
              ))}
            </div>
          </DrawerField>
        )}

        {(kind === "RECEIVED" || kind === "TRANSFER") && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kind === "RECEIVED" && (
              <DrawerField label="Delivery challan / bill no.">
                <input value={challan} onChange={(e) => setChallan(e.target.value)} className="input" placeholder="Optional" />
              </DrawerField>
            )}
            <DrawerField label="Vehicle number">
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} className="input" placeholder="Optional" />
            </DrawerField>
          </div>
        )}

        <DrawerField label={kind === "WASTAGE" ? "Reason" : "Note"}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="Optional" />
        </DrawerField>
      </div>
    </Drawer>
  );
}
