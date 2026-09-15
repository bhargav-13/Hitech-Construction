"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { TypeaheadPicker } from "@/components/vyapar/TypeaheadPicker";
import { UnitSelect } from "@/components/procurement/UnitSelect";
import { useWarehouseStore, stockOf } from "@/lib/warehouseStore";
import { ISSUE_TARGET_META, MOVEMENT_META, type IssueTarget, type MovementKind } from "@/lib/warehouseTypes";
import { useProjects } from "@/lib/useProjects";
import { useUsers } from "@/lib/useUsers";
import { inr, qty as fmtQty } from "@/lib/format";
import * as vyapar from "@/lib/vyaparApi";
import type { Item, Party } from "@/lib/vyaparApi";
import { AlertTriangle } from "lucide-react";

/**
 * Record one stock movement.
 *
 * One dialog for receive / issue / transfer / return / adjust rather than four screens, because
 * they are the same act with different questions attached: what, how much, and where from or to.
 * The kind decides which questions appear, so an issue asks who it went to and a receipt asks which
 * supplier and against which order.
 *
 * Two things it refuses to let you do quietly:
 *
 * - **Issue more than is there.** The available figure sits under the quantity box and the save is
 *   blocked past it. A store that can go negative is a store nobody trusts, and the fix afterwards
 *   is an adjustment nobody can explain.
 * - **Adjust without a reason.** An ADJUSTMENT is the one movement with no document behind it, so
 *   the note is the document. It is required.
 */
export function MovementDialog({
  kind,
  warehouseId,
  presetItemId,
  onClose,
}: {
  kind: MovementKind;
  warehouseId: string;
  presetItemId?: number;
  onClose: () => void;
}) {
  const record = useWarehouseStore((s) => s.record);
  const transfer = useWarehouseStore((s) => s.transfer);
  const movements = useWarehouseStore((s) => s.movements);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const { projects } = useProjects();
  const { users } = useUsers();

  const [items, setItems] = useState<Item[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  useEffect(() => {
    vyapar.getItems().then(setItems).catch(() => setItems([]));
    vyapar.getParties().then(setParties).catch(() => setParties([]));
  }, []);

  const [itemId, setItemId] = useState<number | null>(presetItemId ?? null);
  /**
   * Null until the user types or the catalogue lands with a preset. Derived rather than synced in
   * an effect: the preset item's name is not known until `items` arrives, and mirroring it across
   * with setState made the field flicker between blank and filled on first paint.
   */
  const [itemTextEdit, setItemTextEdit] = useState<string | null>(null);
  const [unitEdit, setUnitEdit] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [movedOn, setMovedOn] = useState(new Date().toISOString().slice(0, 10));
  const [target, setTarget] = useState<IssueTarget>("PROJECT");
  const [projectId, setProjectId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [issuedToUserId, setIssuedToUserId] = useState("");
  const [counterWarehouseId, setCounterWarehouseId] = useState("");
  const [sourceDocNo, setSourceDocNo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const preset = presetItemId == null ? undefined : items.find((i) => i.id === presetItemId);
  const itemText = itemTextEdit ?? preset?.name ?? "";
  const unit = unitEdit ?? preset?.unit ?? "Nos";
  const setItemText = setItemTextEdit;
  const setUnit = setUnitEdit;

  const meta = MOVEMENT_META[kind];
  const isIssue = kind === "ISSUE";
  const isReceipt = kind === "RECEIPT";
  const isTransfer = kind === "TRANSFER_OUT";
  const isReturn = kind === "RETURN";
  const isAdjust = kind === "ADJUSTMENT";

  const onHand = itemId != null ? stockOf(movements, warehouseId, itemId) : 0;
  const wanted = Number(quantity) || 0;
  /** Anything leaving the store is capped by what is in it. Receipts and returns only add. */
  const leaves = isIssue || isTransfer;
  const overdrawn = leaves && wanted > onHand;

  const otherStores = useMemo(
    () => warehouses.filter((w) => w.isActive && w.id !== warehouseId),
    [warehouses, warehouseId],
  );

  const title = isTransfer ? "Transfer stock" : `${meta.label.replace(/ed$/, "e")} stock`;

  /**
   * The checks below are a courtesy — the server runs them again and is the one that decides. So
   * nothing closes until the write has actually landed: a refusal ("you cannot move more than
   * that") is usually the module working correctly, and the person needs to read it with their
   * entry still in front of them rather than after the drawer has thrown it away.
   */
  async function save() {
    if (saving) return;
    if (itemId == null) return setError("Pick the item from the catalogue.");
    if (wanted <= 0) return setError("Enter a quantity.");
    if (overdrawn) return setError(`Only ${fmtQty(onHand)} on hand — you cannot issue more than that.`);
    if (isTransfer && !counterWarehouseId) return setError("Pick the store it is going to.");
    if (isIssue && target === "PROJECT" && !projectId) return setError("Which site is it going to?");
    if (isIssue && target === "SUBCONTRACTOR" && !partyId) return setError("Which subcontractor?");
    if (isIssue && target === "WORKER" && !issuedToUserId) return setError("Who is taking it?");
    if (isAdjust && !note.trim()) return setError("An adjustment needs a reason — that is its only record.");

    setSaving(true);
    setError("");
    try {
      if (isTransfer) {
        await transfer({
          fromWarehouseId: warehouseId,
          toWarehouseId: counterWarehouseId,
          itemId,
          quantity: wanted,
          rate: Number(rate) || 0,
          movedOn,
          note: note.trim() || null,
          byUserId: null,
        });
      } else {
        await record({
          warehouseId,
          itemId,
          kind,
          quantity: wanted,
          rate: Number(rate) || 0,
          movedOn,
          byUserId: null,
          target: isIssue ? target : null,
          projectId: isIssue && target === "PROJECT" ? projectId || null : null,
          partyId: isReceipt || (isIssue && target === "SUBCONTRACTOR") ? Number(partyId) || null : null,
          issuedToUserId: isIssue && target === "WORKER" ? issuedToUserId || null : null,
          counterWarehouseId: null,
          sourceDocNo: sourceDocNo.trim() || null,
          requestId: null,
          note: note.trim() || null,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The store refused that entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={title}
      onClose={onClose}
      onSave={() => void save()}
      saveLabel={saving ? "Recording…" : "Record"}
      width="max-w-2xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <DrawerField
          label="Item"
          required
          hint="From the shared catalogue — the same items Vyapar and the RFQ use, so stock stays one number."
        >
          <TypeaheadPicker<Item>
            value={itemText}
            onChange={(text) => {
              setItemText(text);
              setItemId(null);
            }}
            rows={items}
            getKey={(i) => i.id}
            getLabel={(i) => i.name}
            columns={[
              { label: "Purchase Price", get: (i) => inr(i.purchasePrice) },
              { label: "In this store", get: (i) => fmtQty(stockOf(movements, warehouseId, i.id)), align: "right" },
            ]}
            onPick={(i) => {
              setItemId(i.id);
              setItemText(i.name);
              setUnit(i.unit || "Nos");
              if (!rate) setRate(String(i.purchasePrice || ""));
            }}
            placeholder="Search the catalogue"
          />
        </DrawerField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DrawerField group label="Quantity" required>
            <div className="flex gap-2">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={`input text-right ${overdrawn ? "border-rose-400 bg-rose-50/40" : ""}`}
              />
              <UnitSelect value={unit} onChange={setUnit} size="md" className="w-28 shrink-0" />
            </div>
            {itemId != null && (
              <span className={`mt-1 block text-xs ${overdrawn ? "font-medium text-rose-600" : "text-gray-400"}`}>
                {overdrawn
                  ? `Only ${fmtQty(onHand)} on hand in this store`
                  : `${fmtQty(onHand)} on hand in this store`}
              </span>
            )}
          </DrawerField>

          <DrawerField label={isIssue ? "Recovery rate" : "Rate"} hint={isIssue ? "0 = free issue" : undefined}>
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="input text-right" />
          </DrawerField>

          <DrawerField label="Date">
            <DatePicker value={movedOn} onChange={setMovedOn} />
          </DrawerField>
        </div>

        {isReceipt && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DrawerField label="Supplier">
              <Select
                value={partyId}
                onChange={setPartyId}
                placeholder="Which supplier"
                options={[
                  { value: "", label: "Not from a supplier" },
                  ...parties.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
              />
            </DrawerField>
            <DrawerField
              label="Against order / bill"
              hint="The purchase order or bill this came in against, so the two can be reconciled."
            >
              <input
                value={sourceDocNo}
                onChange={(e) => setSourceDocNo(e.target.value)}
                placeholder="e.g. PO-1244"
                className="input"
              />
            </DrawerField>
          </div>
        )}

        {isIssue && (
          <>
            <DrawerField group label="Issued to" required>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(ISSUE_TARGET_META) as IssueTarget[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTarget(t)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors duration-150 ${
                      target === t ? "border-brand-accent bg-cyan-50/60" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="block text-sm font-medium text-gray-800">{ISSUE_TARGET_META[t].label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{ISSUE_TARGET_META[t].hint}</span>
                  </button>
                ))}
              </div>
            </DrawerField>

            {target === "PROJECT" && (
              <DrawerField label="Site" required>
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Which site"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </DrawerField>
            )}
            {target === "SUBCONTRACTOR" && (
              <DrawerField
                label="Subcontractor"
                required
                hint="Recoverable from his bill — record it on his work order too."
              >
                <Select
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="Which contractor"
                  options={parties.map((p) => ({ value: String(p.id), label: p.name }))}
                />
              </DrawerField>
            )}
            {target === "WORKER" && (
              <DrawerField label="Person" required hint="Opens a checkout — this is expected back.">
                <Select
                  value={issuedToUserId}
                  onChange={setIssuedToUserId}
                  placeholder="Who is taking it"
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                />
              </DrawerField>
            )}
          </>
        )}

        {isReturn && (
          <DrawerField label="Returned by">
            <Select
              value={issuedToUserId}
              onChange={setIssuedToUserId}
              placeholder="Who is bringing it back"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
          </DrawerField>
        )}

        {isTransfer && (
          <DrawerField
            label="To store"
            required
            hint="Leaves this store now and arrives at the other — both ledgers carry the same document number."
          >
            <Select
              value={counterWarehouseId}
              onChange={setCounterWarehouseId}
              placeholder="Which store"
              options={otherStores.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
            />
          </DrawerField>
        )}

        <DrawerField
          label={isAdjust ? "Reason" : "Note"}
          required={isAdjust}
          hint={isAdjust ? "An adjustment has no document behind it, so this is the record." : undefined}
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={
              isAdjust
                ? "e.g. Physical count on 08/09 found 4 bags short — damp damage"
                : "Challan no, vehicle, anything worth remembering"
            }
            className="input resize-none"
          />
        </DrawerField>

        {overdrawn && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle size={13} className="shrink-0" />
            This store holds {fmtQty(onHand)}. Transfer stock in first, or post an adjustment if the count is wrong.
          </p>
        )}
      </div>
    </Drawer>
  );
}
