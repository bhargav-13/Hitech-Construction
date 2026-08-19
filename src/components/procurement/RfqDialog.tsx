"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Drawer, DrawerField } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { TypeaheadPicker } from "@/components/vyapar/TypeaheadPicker";
import { useProjects } from "@/lib/useProjects";
import { inr, qty as formatQty } from "@/lib/format";
import * as procurement from "@/lib/procurementApi";
import type { Rfq } from "@/lib/procurementApi";
import type { Item } from "@/lib/vyaparApi";

const UNITS = ["Nos", "Bag", "Kg", "MT", "Mtr", "Sqm", "Cum", "Litre", "Set", "Box"];

/**
 * Raise or edit an enquiry.
 *
 * Items come from the Vyapar catalogue through the same type-ahead the invoice grid uses, but free
 * text is allowed: half of what gets enquired about on a site has never been an item in the books,
 * and forcing a catalogue entry first would push people back to WhatsApp.
 *
 * Editing keeps each line's id. Quotes are priced against line ids, so replacing them on every save
 * would orphan every price already received against the enquiry.
 */
export function RfqDialog({
  existing,
  items,
  onClose,
  onSaved,
}: {
  existing?: Rfq;
  items: Item[];
  onClose: () => void;
  onSaved: (saved: Rfq) => void;
}) {
  const { projects } = useProjects();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [projectId, setProjectId] = useState(existing?.projectId != null ? String(existing.projectId) : "");
  const [dueBy, setDueBy] = useState(existing?.dueBy ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lines, setLines] = useState<
    { id?: number; itemId: number | null; itemName: string; unit: string; quantity: number; budgetRate: string }[]
  >(
    existing?.lines.length
      ? existing.lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.unit ?? "Nos",
          quantity: l.quantity,
          budgetRate: l.budgetRate != null ? String(l.budgetRate) : "",
        }))
      : [{ itemId: null, itemName: "", unit: "Nos", quantity: 1, budgetRate: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = useMemo(
    () => JSON.stringify({ title, projectId, dueBy, notes, lines }) !== JSON.stringify({
      title: existing?.title ?? "",
      projectId: existing?.projectId != null ? String(existing.projectId) : "",
      dueBy: existing?.dueBy ?? "",
      notes: existing?.notes ?? "",
      lines: existing?.lines.length
        ? existing.lines.map((l) => ({
            id: l.id,
            itemId: l.itemId,
            itemName: l.itemName,
            unit: l.unit ?? "Nos",
            quantity: l.quantity,
            budgetRate: l.budgetRate != null ? String(l.budgetRate) : "",
          }))
        : [{ itemId: null, itemName: "", unit: "Nos", quantity: 1, budgetRate: "" }],
    }),
    [title, projectId, dueBy, notes, lines, existing],
  );

  function setLine(i: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    const clean = lines.filter((l) => l.itemName.trim());
    if (!title.trim()) return setError("Give the enquiry a title.");
    if (clean.length === 0) return setError("Add at least one item to ask about.");

    setSaving(true);
    setError("");
    try {
      const body: procurement.RfqInput = {
        title: title.trim(),
        projectId: projectId ? Number(projectId) : null,
        dueBy: dueBy || null,
        notes: notes.trim() || null,
        lines: clean.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName.trim(),
          unit: l.unit,
          quantity: Number(l.quantity) || 1,
          budgetRate: l.budgetRate === "" ? null : Number(l.budgetRate),
        })),
      };
      const saved = existing ? await procurement.updateRfq(existing.id, body) : await procurement.createRfq(body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this enquiry.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? `Edit ${existing.rfqNo}` : "New Enquiry"}
      onClose={onClose}
      onSave={save}
      saveLabel={saving ? "Saving…" : existing ? "Save" : "Raise Enquiry"}
      dirty={dirty}
      width="max-w-3xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DrawerField label="What are you buying" required className="sm:col-span-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Valves — Pedak Road chambers"
              className="input"
              autoFocus
            />
          </DrawerField>
          <DrawerField label="Project">
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="Select project"
              options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </DrawerField>
          <DrawerField label="Replies due by">
            <DatePicker value={dueBy} onChange={setDueBy} placeholder="Reply deadline" />
          </DrawerField>
        </div>

        {/* Lines */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <th className="w-8 px-2 py-2 text-center">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-28 px-2 py-2">Unit</th>
                {/* Not a price you are paying — it is what quotes get judged against. */}
                <th className="w-32 px-2 py-2 text-right">Budget rate</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5 text-center text-xs text-gray-400">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <TypeaheadPicker<Item>
                      value={l.itemName}
                      onChange={(text) => setLine(i, { itemName: text, itemId: null })}
                      rows={items}
                      getKey={(it) => it.id}
                      getLabel={(it) => it.name}
                      columns={[
                        { label: "Purchase Price", get: (it) => inr(it.purchasePrice) },
                        { label: "Stock", get: (it) => formatQty(it.stockQty) },
                      ]}
                      onPick={(it) =>
                        setLine(i, {
                          itemId: it.id,
                          itemName: it.name,
                          unit: it.unit || "Nos",
                          // The last purchase price is the obvious yardstick when no rate card exists.
                          budgetRate: it.purchasePrice ? String(it.purchasePrice) : "",
                        })
                      }
                      placeholder="Item name — or type anything"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={l.unit}
                      onChange={(v) => setLine(i, { unit: v })}
                      size="sm"
                      options={UNITS.map((u) => ({ value: u, label: u }))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={l.budgetRate}
                      onChange={(e) => setLine(i, { budgetRate: e.target.value })}
                      placeholder="optional"
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500"
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                        aria-label={`Remove line ${i + 1}`}
                        className="rounded-md p-1 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td />
                <td className="px-2 py-2" colSpan={5}>
                  <button
                    onClick={() =>
                      setLines((p) => [...p, { itemId: null, itemName: "", unit: "Nos", quantity: 1, budgetRate: "" }])
                    }
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-all duration-150 hover:border-brand-accent hover:text-brand-accent active:scale-95"
                  >
                    <Plus size={12} /> Add Item
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <DrawerField label="Notes to suppliers">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Delivery location, site contact, anything they need to quote accurately"
            className="input resize-none"
          />
        </DrawerField>
      </div>
    </Drawer>
  );
}
