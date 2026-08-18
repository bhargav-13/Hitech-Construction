"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { Select } from "@/components/Select";
import { Spinner } from "@/components/Spinner";
import { SortTh } from "@/components/vyapar/SortTh";
import { formatRupee } from "@/lib/projectHelpers";
import { useTableSort } from "@/lib/useTableSort";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";

/**
 * Material Library — a read-only view over the Vyapar item catalogue rather than a second list of
 * materials. Items already carry unit, rate, tax and stock and are referenced by every bill and
 * indent; duplicating them here would mean two catalogues drifting apart. Editing therefore sends
 * you to Vyapar → Items, which owns the record.
 */
export function MaterialLibrary() {
  const projectId = useVyaparProjectId();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await vyapar.getItems(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load materials.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && (i.category ?? "") !== category) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.itemCode ?? "").toLowerCase().includes(q) ||
        (i.hsn ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, category]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    {
      name: (i) => i.name,
      category: (i) => i.category ?? "",
      unit: (i) => i.unit,
      purchasePrice: (i) => i.purchasePrice,
      salePrice: (i) => i.salePrice,
      taxPercent: (i) => i.taxPercent,
      stockQty: (i) => i.stockQty,
    },
    { key: "name" },
  );

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">
          Every material and service in the catalogue, read from Vyapar Items — one catalogue, so rates and stock never
          disagree between modules.
        </p>
        <Link
          href="/vyapar/items"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
        >
          Manage in Vyapar <ExternalLink size={14} />
        </Link>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} of {items.length} {items.length === 1 ? "material" : "materials"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
            <Search size={14} className="text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, HSN…"
              className="w-52 bg-transparent text-sm outline-none"
            />
          </div>
          <Select
            value={category}
            onChange={setCategory}
            size="sm"
            className="min-w-[160px]"
            options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" />
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">
          {items.length === 0 ? "No materials in the catalogue yet." : "No materials match."}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <SortTh label="Material" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Unit" sortKey="unit" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Purchase" sortKey="purchasePrice" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortTh label="Sale" sortKey="salePrice" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortTh label="GST" sortKey="taxPercent" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortTh label="Stock" sortKey="stockQty" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{i.name}</div>
                    {i.itemCode && <div className="text-xs text-gray-400">{i.itemCode}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{i.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{i.unit}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{formatRupee(i.purchasePrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{formatRupee(i.salePrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{i.taxPercent}%</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${i.lowStock ? "font-medium text-rose-600" : "text-gray-600"}`}>
                    {i.isService ? "—" : i.stockQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
