"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { TAX_RATES, DEFAULT_UNITS } from "@/lib/useItemSettings";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { Save, Search } from "lucide-react";

type Mode = "Pricing" | "Stock" | "Item Information";
type Draft = Record<number, Partial<Item>>;

/**
 * Bulk Update Items — Vyapar's spreadsheet-style editor. Pick a mode, edit inline, and only the
 * rows you actually touched get saved.
 */
export default function BulkUpdateItemsPage() {
  const [mode, setMode] = useState<Mode>("Pricing");
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
  const bankAccountId = useVyaparBankId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await vyapar.getItems(bankAccountId));
      setDraft({});
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.name, i.hsn, i.itemCode].some((f) => f?.toLowerCase().includes(q)));
  }, [items, search]);

  const dirtyCount = Object.keys(draft).length;

  const edit = (id: number, patch: Partial<Item>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const valueOf = <K extends keyof Item>(i: Item, k: K): Item[K] =>
    (draft[i.id]?.[k] ?? i[k]) as Item[K];

  async function saveAll() {
    if (dirtyCount === 0) return;
    setSaving(true);
    setError("");
    let n = 0;
    try {
      for (const [id, patch] of Object.entries(draft)) {
        await vyapar.updateItem(Number(id), patch);
        n++;
      }
      setSaved(n);
      await load();
      setTimeout(() => setSaved(0), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save all changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Bulk Update Items</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {dirtyCount > 0 ? (
                <span className="font-medium text-brand-accent">{dirtyCount} item(s) edited — not saved yet</span>
              ) : saved > 0 ? (
                <span className="font-medium text-emerald-600">{saved} item(s) updated</span>
              ) : (
                "Edit many items at once, then save."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
              <Search size={15} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item name / HSN"
                className="w-52 bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={saveAll}
              disabled={dirtyCount === 0 || saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              <Save size={14} /> {saving ? "Saving…" : `Update${dirtyCount ? ` (${dirtyCount})` : ""}`}
            </button>
          </div>
        </div>

        {/* Mode selector, as radios in Vyapar */}
        <div className="flex flex-wrap gap-2">
          {(["Pricing", "Stock", "Item Information"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95 ${
                mode === m ? "bg-navy text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${mode === m ? "bg-white" : "bg-gray-300"}`} />
              {m}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading items…
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                  <th className="w-10 px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Item Name</th>
                  {mode === "Pricing" && (
                    <>
                      <th className="w-32 px-3 py-2 text-right">Purchase Price</th>
                      <th className="w-32 px-3 py-2 text-right">Sale Price</th>
                      <th className="w-28 px-3 py-2 text-right">Discount</th>
                      <th className="w-32 px-3 py-2">Tax Rate</th>
                    </>
                  )}
                  {mode === "Stock" && (
                    <>
                      <th className="w-28 px-3 py-2 text-right">Stock Qty</th>
                      <th className="w-28 px-3 py-2 text-right">Min Stock</th>
                      <th className="w-32 px-3 py-2">Unit</th>
                      <th className="w-36 px-3 py-2">Location</th>
                    </>
                  )}
                  {mode === "Item Information" && (
                    <>
                      <th className="w-32 px-3 py-2">Item Code</th>
                      <th className="w-28 px-3 py-2">HSN</th>
                      <th className="w-36 px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((i, idx) => {
                  const dirty = !!draft[i.id];
                  return (
                    <tr
                      key={i.id}
                      className={`border-b border-gray-50 last:border-b-0 ${dirty ? "bg-cyan-50/50" : "even:bg-gray-50/40"}`}
                    >
                      <td className="px-3 py-1.5 text-center text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-medium text-gray-800">{i.name}</span>
                        {i.isService && <span className="ml-1.5 rounded bg-violet-50 px-1 text-[10px] text-violet-600">Service</span>}
                      </td>

                      {mode === "Pricing" && (
                        <>
                          <Num value={valueOf(i, "purchasePrice")} onChange={(v) => edit(i.id, { purchasePrice: v })} />
                          <Num value={valueOf(i, "salePrice")} onChange={(v) => edit(i.id, { salePrice: v })} />
                          <Num value={valueOf(i, "saleDiscount")} onChange={(v) => edit(i.id, { saleDiscount: v })} />
                          <td className="px-3 py-1.5">
                            <Select
                              value={String(valueOf(i, "taxPercent"))}
                              onChange={(v) => edit(i.id, { taxPercent: Number(v) })}
                              size="sm"
                              options={TAX_RATES.map((t) => ({ value: String(t), label: t === 0 ? "None" : `GST @ ${t}%` }))}
                            />
                          </td>
                        </>
                      )}

                      {mode === "Stock" && (
                        <>
                          <Num value={valueOf(i, "stockQty")} onChange={(v) => edit(i.id, { stockQty: v })} disabled={i.isService} />
                          <Num value={valueOf(i, "lowStockAlert")} onChange={(v) => edit(i.id, { lowStockAlert: v })} disabled={i.isService} />
                          <td className="px-3 py-1.5">
                            <Select
                              value={valueOf(i, "unit") || "NONE"}
                              onChange={(v) => edit(i.id, { unit: v })}
                              size="sm"
                              options={[{ value: "NONE", label: "None" }, ...DEFAULT_UNITS.map((u) => ({ value: u.short, label: u.short }))]}
                            />
                          </td>
                          <Txt value={valueOf(i, "location") ?? ""} onChange={(v) => edit(i.id, { location: v })} />
                        </>
                      )}

                      {mode === "Item Information" && (
                        <>
                          <Txt value={valueOf(i, "itemCode") ?? ""} onChange={(v) => edit(i.id, { itemCode: v })} mono />
                          <Txt value={valueOf(i, "hsn") ?? ""} onChange={(v) => edit(i.id, { hsn: v })} mono />
                          <Txt value={valueOf(i, "category") ?? ""} onChange={(v) => edit(i.id, { category: v })} />
                          <Txt value={valueOf(i, "description") ?? ""} onChange={(v) => edit(i.id, { description: v })} />
                        </>
                      )}
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-400">No items match “{search}”.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VyaparShell>
  );
}

function Num({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <td className="px-3 py-1.5">
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-right text-sm outline-none focus:border-cyan-500 disabled:bg-gray-50 disabled:text-gray-300"
      />
    </td>
  );
}

function Txt({ value, onChange, mono }: { value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <td className="px-3 py-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500 ${mono ? "font-mono text-xs" : ""}`}
      />
    </td>
  );
}
