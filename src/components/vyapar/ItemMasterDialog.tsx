"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { ManagedUnit } from "@/lib/useItemMasters";

/**
 * Small add / edit form for an Item Category or Unit — Vyapar's own little dialogs
 * behind the "+ Add Category" / "+ Add Unit" buttons.
 */
export function ItemMasterDialog({
  kind,
  existing,
  taken,
  onClose,
  onSubmit,
}: {
  kind: "category" | "unit";
  /** For editing: the current value. Category is a plain string; unit is {name, short}. */
  existing?: string | ManagedUnit;
  /** Names / short codes already in use, for a friendly duplicate check. */
  taken: string[];
  onClose: () => void;
  onSubmit: (value: string | ManagedUnit) => void;
}) {
  const isUnit = kind === "unit";
  const existingUnit = isUnit ? (existing as ManagedUnit | undefined) : undefined;
  const [name, setName] = useState(
    isUnit ? existingUnit?.name ?? "" : ((existing as string | undefined) ?? "")
  );
  const [short, setShort] = useState(existingUnit?.short ?? "");
  const [error, setError] = useState("");

  const title = `${existing ? "Edit" : "New"} ${isUnit ? "Unit" : "Category"}`;

  function save() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError(`${isUnit ? "Unit" : "Category"} name is required.`);
      return;
    }
    if (isUnit) {
      const cleanShort = short.trim();
      if (!cleanShort) {
        setError("Short name is required.");
        return;
      }
      const dupe = existingUnit?.short.toLowerCase() !== cleanShort.toLowerCase() &&
        taken.some((t) => t.toLowerCase() === cleanShort.toLowerCase());
      if (dupe) {
        setError(`A unit “${cleanShort}” already exists.`);
        return;
      }
      onSubmit({ name: cleanName, short: cleanShort });
    } else {
      const dupe = (existing as string | undefined)?.toLowerCase() !== cleanName.toLowerCase() &&
        taken.some((t) => t.toLowerCase() === cleanName.toLowerCase());
      if (dupe) {
        setError(`Category “${cleanName}” already exists.`);
        return;
      }
      onSubmit(cleanName);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <h2 className="mb-5 text-base font-semibold text-gray-800">{title}</h2>
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
              {isUnit ? "Unit Name" : "Category Name"}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isUnit && save()}
              placeholder={isUnit ? "e.g. Kilograms" : "e.g. Cement"}
              className="input"
              autoFocus
            />
          </label>
          {isUnit && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Short Name</span>
              <input
                value={short}
                onChange={(e) => setShort(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="e.g. KG"
                className="input uppercase"
              />
            </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            {existing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
