"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Select } from "@/components/Select";
import type { Item } from "@/lib/vyaparApi";

/**
 * The material picker — a panel that slides in from the right, not a per-row dropdown.
 *
 * A real enquiry is ten or twenty lines chosen in one pass. Picking them one at a time through a
 * cell dropdown is the same work done slowly, so this is a checklist: filter by category, search,
 * tick everything, add them all at once.
 *
 * Items are the Vyapar catalogue. Anything not in it can still be typed straight into the material
 * list — half of what a site asks for has never been an item in the books.
 */
export function MaterialLibrary({
  items,
  alreadyPicked,
  onClose,
  onPick,
}: {
  items: Item[];
  /** Item ids already on the enquiry — shown ticked and locked rather than hidden, so it is clear
   *  they are on the list rather than missing from the library. */
  alreadyPicked: number[];
  onClose: () => void;
  onPick: (items: Item[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && (i.category ?? "") !== category) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.itemCode ?? "").toLowerCase().includes(q);
    });
  }, [items, search, category]);

  const on = new Set(alreadyPicked);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="animate-slide-in-right flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={18} />
            </button>
            <h2 className="text-sm font-bold tracking-wide text-gray-800 uppercase">Material Library</h2>
          </div>
          <button
            onClick={() => onPick(items.filter((i) => picked.has(i.id)))}
            disabled={picked.size === 0}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <Select
            value={category}
            onChange={setCategory}
            size="sm"
            className="w-36"
            options={[{ value: "all", label: "Category" }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 text-sm">
          <span className="font-medium text-gray-700">Selected Materials ({picked.size})</span>
          <span className="text-xs text-gray-400">Not listed? Type it straight into the material list.</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-400">
              {items.length === 0 ? "No items in the catalogue yet." : "Nothing matches."}
            </p>
          ) : (
            filtered.map((i) => {
              const already = on.has(i.id);
              const checked = already || picked.has(i.id);
              return (
                <label
                  key={i.id}
                  className={`flex items-center gap-3 border-b border-gray-50 px-5 py-3 last:border-b-0 ${
                    already ? "opacity-50" : "cursor-pointer hover:bg-cyan-50/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={already}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                        return next;
                      })
                    }
                    className="h-4 w-4 shrink-0 accent-cyan-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800">{i.name}</span>
                    {already && <span className="text-[11px] text-gray-400">already on this enquiry</span>}
                  </span>
                  {i.unit && (
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                      Unit : {i.unit}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => onPick([])}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-accent transition-opacity duration-150 hover:opacity-80"
            title="Close the library and type a line by hand"
          >
            <Plus size={14} /> New Material
          </button>
        </div>
      </div>
    </div>
  );
}
