"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { useAppStore } from "@/lib/store";

interface DraftLine {
  itemId: string;
  qty: string;
}

export function MaterialRequestModal({ onClose }: { onClose: () => void }) {
  const warehouses = useAppStore((s) => s.warehouses);
  const items = useAppStore((s) => s.warehouseItems);
  const projects = useAppStore((s) => s.projects);
  const users = useAppStore((s) => s.users);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const addMaterialRequest = useAppStore((s) => s.addMaterialRequest);

  const currentUser = users.find((u) => u.id === currentUserId);
  const isAdmin = currentUser?.role === "Admin";

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [projectId, setProjectId] = useState(currentUser?.projectId ?? projects[0]?.id ?? "");
  const [neededBy, setNeededBy] = useState("");
  const [note, setNote] = useState("");

  const warehouseItems = useMemo(
    () => items.filter((i) => i.warehouseId === warehouseId),
    [items, warehouseId]
  );

  const [lines, setLines] = useState<DraftLine[]>([{ itemId: "", qty: "" }]);

  function setLine(idx: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { itemId: "", qty: "" }]);
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, i) => i !== idx)));
  }

  const validLines = lines
    .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }))
    .filter((l) => l.itemId && l.qty > 0);

  const canSave = warehouseId && projectId && validLines.length > 0;

  function save() {
    if (!canSave || !currentUser) return;
    addMaterialRequest({
      projectId,
      warehouseId,
      requestedById: currentUser.id,
      date: "02-Jul-2026",
      neededBy: neededBy || undefined,
      note: note || undefined,
      lines: validLines,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-8">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">New Material Request</h2>
        <p className="mb-6 text-sm text-gray-500">
          Request items from a warehouse for your site. The store keeper will dispatch them.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">From Warehouse</span>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setLines([{ itemId: "", qty: "" }]);
              }}
              className="input"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">For Project / Site</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input"
              disabled={!isAdmin}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Needed By (optional)</span>
            <input value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="input" placeholder="e.g. 05-Jul-2026" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Purpose / remarks" />
          </label>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Items</span>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
            >
              <Plus size={13} /> Add item
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => {
              const item = warehouseItems.find((i) => i.id === l.itemId);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={l.itemId}
                    onChange={(e) => setLine(idx, { itemId: e.target.value })}
                    className="input flex-1"
                  >
                    <option value="">Select item…</option>
                    {warehouseItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.kind})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={l.qty}
                    onChange={(e) => setLine(idx, { qty: e.target.value })}
                    className="input w-24"
                    placeholder="Qty"
                  />
                  <span className="w-12 text-xs text-gray-400">{item?.unit ?? ""}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            {warehouseItems.length === 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                This warehouse has no items yet.
              </div>
            )}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-6 w-full rounded-lg bg-brand-accent py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Submit Request
        </button>
      </div>
    </Modal>
  );
}
