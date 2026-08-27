"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { inr } from "@/lib/format";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { findLibraryRate } from "@/lib/tenderAnalysisCalc";
import { useAnalysisStore } from "@/lib/tenderAnalysisStore";
import type { BoqLine } from "@/lib/tenderAnalysisTypes";

/**
 * Pick the tender's items out of the Library rather than typing them.
 *
 * <p>The Library's Material list is a view over the Vyapar item catalogue — the same records every
 * bill, indent and purchase order already point at. Taking an item from there means the name, unit
 * and buying rate arrive with it, and the analysis is describing the same records the rest of the ERP does,
 * instead of a fresh string somebody typed at bid time.
 *
 * <p>Remembered rates from previous tenders are layered on top: the catalogue knows what an item
 * costs to buy, the rate library knows what it cost us to lay last time.
 */
export function LibraryItemPicker({
  analysisId,
  onClose,
  onAdded,
}: {
  analysisId: string;
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const projectId = useVyaparProjectId();
  const addBoqLine = useAnalysisStore((s) => s.addBoqLine);
  const rateLibrary = useAnalysisStore((s) => s.library);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [picked, setPicked] = useState<Map<number, number>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await vyapar.getItems(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the item catalogue.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => i.isActive !== false)
      .filter((i) => category === "all" || (i.category ?? "") === category)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.itemCode ?? "").toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [items, search, category]);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 0);
      return next;
    });

  const setQty = (id: number, qty: number) =>
    setPicked((prev) => {
      const next = new Map(prev);
      next.set(id, qty);
      return next;
    });

  function addAll() {
    let n = 0;
    for (const [id, qty] of picked) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      // The catalogue gives the buying rate; a previous tender may know what it cost us to execute.
      const remembered = findLibraryRate(rateLibrary, item.name, item.unit);
      const line: Partial<BoqLine> = {
        description: item.name,
        unit: item.unit,
        qty,
        // Left at zero deliberately. The tender rate is whatever the department printed in its
        // schedule — pre-filling it from our own sale price would put a plausible wrong number in
        // the column the whole margin is measured against.
        rate: 0,
        materialRate: item.purchasePrice ?? remembered?.materialRate ?? null,
        labourRate: remembered?.labourRate ?? null,
        otherRate: remembered?.otherRate ?? null,
        libraryItemId: String(item.id),
      };
      addBoqLine(analysisId, line);
      n += 1;
    }
    onAdded(n);
    onClose();
  }

  return (
    <Modal onClose={onClose} wide guardOnClose={false}>
      <div className="flex max-h-[82vh] flex-col">
        <header className="border-b border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800">Add items from the Library</h2>
            <Link
              href="/library"
              className="ml-auto inline-flex items-center gap-1 text-xs text-brand-accent hover:underline"
            >
              Open Material Library <ExternalLink size={11} />
            </Link>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            The same catalogue Vyapar, indents and purchase orders use — so a rate you bid here is
            the rate you can buy at.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={14} className="absolute top-2.5 left-3 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items"
                className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm focus:border-brand-accent focus:outline-none"
              />
            </div>
            {categories.length > 0 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category"
                className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-600 focus:border-brand-accent focus:outline-none"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Couldn&apos;t load the item catalogue.</p>
                  <p className="mt-0.5 text-xs">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 transition-colors duration-150 hover:bg-amber-50"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">
              {items.length === 0
                ? "The item catalogue is empty. Add items in Vyapar → Items and they appear here."
                : "No items match that search."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 text-[11px] tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="w-9 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Buy rate</th>
                  <th className="px-3 py-2 text-right font-medium">Sale rate</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const on = picked.has(i.id);
                  return (
                    <tr
                      key={i.id}
                      className={`border-b border-gray-50 transition-colors duration-150 ${on ? "bg-cyan-50/60" : "hover:bg-gray-50/60"}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(i.id)}
                          aria-label={`Select ${i.name}`}
                          className="h-4 w-4 accent-cyan-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggle(i.id)}
                          className="block max-w-[300px] truncate text-left text-gray-700"
                          title={i.name}
                        >
                          {i.name}
                        </button>
                        {i.category && <span className="text-[11px] text-gray-400">{i.category}</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{i.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{inr(i.purchasePrice ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inr(i.salePrice ?? 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          value={on ? String(picked.get(i.id) ?? 0) : ""}
                          onChange={(e) => setQty(i.id, Number(e.target.value) || 0)}
                          onFocus={() => !on && toggle(i.id)}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Quantity for ${i.name}`}
                          className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm tabular-nums placeholder:text-gray-300 focus:border-brand-accent focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-gray-200 p-4">
          <span className="text-xs text-gray-500">
            {picked.size === 0 ? "Nothing selected" : `${picked.size} item${picked.size === 1 ? "" : "s"} selected`}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addAll}
              disabled={picked.size === 0}
              className="rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              Add {picked.size > 0 ? picked.size : ""} to the analysis
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
