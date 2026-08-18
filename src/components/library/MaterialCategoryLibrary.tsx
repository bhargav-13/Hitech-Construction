"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Spinner } from "@/components/Spinner";
import { SortTh } from "@/components/vyapar/SortTh";
import { useTableSort } from "@/lib/useTableSort";
import { useItemMasters } from "@/lib/useItemMasters";
import { useVyaparProjectId } from "@/lib/projectScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";

/**
 * Material Category Library — the categories the item form offers, shown with how many materials
 * actually sit in each.
 *
 * It reads and writes the same `useItemMasters` store the Vyapar item form uses, so a category
 * added here appears in that dropdown and vice versa; a separate list would just be a second set of
 * category names nobody keeps in step. Categories already in use on an item show up even if they
 * were never added to the master — that's the case renaming is for.
 */
export function MaterialCategoryLibrary() {
  const projectId = useVyaparProjectId();
  const { masters, ready, addCategory, renameCategory, removeCategory } = useItemMasters();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState("");

  // Items are only here for the counts, so a failed load degrades to "no counts" rather than an error.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await vyapar.getItems(projectId));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Managed categories ∪ categories seen on real items, each with its item count and a sample. */
  const rows = useMemo(() => {
    const byName = new Map<string, { name: string; count: number; sample: string[]; managed: boolean }>();
    for (const c of masters.categories) byName.set(c.toLowerCase(), { name: c, count: 0, sample: [], managed: true });
    for (const item of items) {
      const c = item.category?.trim();
      if (!c) continue;
      const existing = byName.get(c.toLowerCase()) ?? { name: c, count: 0, sample: [], managed: false };
      existing.count += 1;
      if (existing.sample.length < 3) existing.sample.push(item.name);
      byName.set(c.toLowerCase(), existing);
    }
    return [...byName.values()];
  }, [masters.categories, items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.sample.some((s) => s.toLowerCase().includes(q)));
  }, [rows, search]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { name: (r) => r.name, count: (r) => r.count },
    { key: "name" },
  );

  const uncategorised = items.filter((i) => !i.category?.trim()).length;

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = adding.trim();
    if (!clean) return;
    addCategory(clean);
    setAdding("");
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500">
          Categories materials are grouped under. Shared with the Vyapar item form, so anything added here is offered
          the next time an item is created.
        </p>
        <form onSubmit={submitAdd} className="flex shrink-0 items-center gap-2">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="New category"
            className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-cyan-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            + Add
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {filtered.length} of {rows.length} {rows.length === 1 ? "category" : "categories"}
          {uncategorised > 0 && ` · ${uncategorised} uncategorised material${uncategorised === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-cyan-400">
          <Search size={14} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category…"
            className="w-52 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {loading || !ready ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" />
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-400">
          {rows.length === 0 ? "No categories yet — add one above." : "No categories match."}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <SortTh label="Category" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortTh label="Materials" sortKey="count" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <th className="px-4 py-2 font-medium">Examples</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.name}
                  className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/50 hover:bg-cyan-50/40"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-800">{r.name}</span>
                    {!r.managed && (
                      <span
                        title="Used on an item but not in the category master — add it so the item form offers it."
                        className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                      >
                        In use only
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{r.count}</td>
                  <td className="truncate px-4 py-2.5 text-xs text-gray-400">{r.sample.join(", ") || "—"}</td>
                  <td className="px-2 py-2.5">
                    <RowMenu align="right" buttonLabel="Category actions">
                      {(close) =>
                        // A category that only exists on items isn't in the master, so rename and
                        // delete would be no-ops — adopting it into the master is the useful action.
                        !r.managed ? (
                          <RowMenuItem
                            icon={Plus}
                            label="Add to master"
                            onClick={() => {
                              close();
                              addCategory(r.name);
                            }}
                          />
                        ) : (
                          <>
                            <RowMenuItem
                              icon={Pencil}
                              label="Rename"
                              onClick={() => {
                                close();
                                const next = prompt(`Rename "${r.name}" to:`, r.name);
                                if (next && next.trim() && next.trim() !== r.name) renameCategory(r.name, next.trim());
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem
                              icon={Trash2}
                              label="Delete"
                              tone="danger"
                              onClick={() => {
                                close();
                                const warning =
                                  r.count > 0
                                    ? `"${r.name}" is used by ${r.count} material${r.count === 1 ? "" : "s"}. Those items keep the category name — it just stops being offered on the item form. Continue?`
                                    : `Delete the category "${r.name}"?`;
                                if (confirm(warning)) removeCategory(r.name);
                              }}
                            />
                          </>
                        )
                      }
                    </RowMenu>
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
