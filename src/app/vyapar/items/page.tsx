"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyaparShell, VyaparEmpty } from "@/components/vyapar/VyaparShell";
import { ItemDialog } from "@/components/vyapar/ItemDialog";
import { AdjustStockDialog } from "@/components/vyapar/AdjustStockDialog";
import { ItemImportDialog } from "@/components/vyapar/ItemImportDialog";
import { ItemMasterDialog } from "@/components/vyapar/ItemMasterDialog";
import { RowMenu, RowMenuDivider, RowMenuItem } from "@/components/RowMenu";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { inr } from "@/lib/format";
import { exportRowsToCsv, printRows, downloadPdf } from "@/lib/vyaparExport";
import { useItemSettings } from "@/lib/useItemSettings";
import { useItemMasters, type ManagedUnit } from "@/lib/useItemMasters";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item, ItemLedgerRow } from "@/lib/vyaparApi";
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

const TABS = ["PRODUCTS", "SERVICES", "CATEGORY", "UNITS"] as const;
type Tab = (typeof TABS)[number];

/**
 * Items — Vyapar's four-tab module: Products and Services as master–detail lists with a per-item
 * stock ledger, plus Category and Units masters.
 */
export default function ItemsPage() {
  const { settings } = useItemSettings();
  const { masters, addCategory, renameCategory, removeCategory, addUnit, updateUnit, removeUnit } = useItemMasters();
  const bankAccountId = useVyaparBankId();
  const [tab, setTab] = useState<Tab>("PRODUCTS");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<ItemLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"All" | "Low" | "Out">("All");
  const [sortDesc, setSortDesc] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [importing, setImporting] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [unitDialog, setUnitDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<ManagedUnit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await vyapar.getItems(bankAccountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load items.");
    } finally {
      setLoading(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const isProductTab = tab === "PRODUCTS" || tab === "SERVICES";

  const scoped = useMemo(
    () => items.filter((i) => (tab === "SERVICES" ? i.isService : !i.isService)),
    [items, tab]
  );

  // Keep a valid selection whenever the tab or filters change.
  useEffect(() => {
    if (!isProductTab) return;
    setSelectedId((cur) => (scoped.some((i) => i.id === cur) ? cur : scoped[0]?.id ?? null));
  }, [scoped, isProductTab]);

  useEffect(() => {
    if (selectedId == null) return;
    let cancelled = false;
    setLedgerLoading(true);
    vyapar
      .getItemLedger(selectedId)
      .then((r) => !cancelled && setLedger(r))
      .catch(() => !cancelled && setLedger([]))
      .finally(() => !cancelled && setLedgerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scoped.filter((i) => {
      if (stockFilter === "Low" && !i.lowStock) return false;
      if (stockFilter === "Out" && i.stockQty > 0) return false;
      if (!q) return true;
      return [i.name, i.itemCode, i.hsn, i.category].some((f) => f?.toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => (sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  }, [scoped, search, stockFilter, sortDesc]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const totals = useMemo(
    () => ({
      stockValue: items.filter((i) => !i.isService).reduce((s, i) => s + i.stockValue, 0),
      low: items.filter((i) => !i.isService && i.lowStock).length,
    }),
    [items]
  );

  // Category master: every managed category unioned with those already used by items, each with
  // its live item count and stock value.
  const categories = useMemo(() => {
    const counts = new Map<string, { count: number; stockValue: number }>();
    let uncat = { count: 0, stockValue: 0 };
    for (const i of items) {
      const key = i.category?.trim();
      if (!key) {
        uncat = { count: uncat.count + 1, stockValue: uncat.stockValue + i.stockValue };
        continue;
      }
      const cur = counts.get(key) ?? { count: 0, stockValue: 0 };
      counts.set(key, { count: cur.count + 1, stockValue: cur.stockValue + i.stockValue });
    }
    const names = new Set<string>([...masters.categories, ...counts.keys()]);
    const list = [...names]
      .map((name) => ({ name, count: counts.get(name)?.count ?? 0, stockValue: counts.get(name)?.stockValue ?? 0, virtual: false }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    // Vyapar always surfaces an "Uncategorised" bucket for items with no category set.
    if (uncat.count > 0) list.push({ name: "Uncategorised", count: uncat.count, stockValue: uncat.stockValue, virtual: true });
    return list;
  }, [items, masters.categories]);

  // The Uncategorised bucket is virtual — never offered as a selectable category on the item form.
  const categoryNames = useMemo(() => categories.filter((c) => !c.virtual).map((c) => c.name), [categories]);

  // Unit master: the managed list, each annotated with how many items use it.
  const units = useMemo(() => {
    const used = new Map<string, number>();
    for (const i of items) used.set(i.unit || "NONE", (used.get(i.unit || "NONE") ?? 0) + 1);
    return masters.units
      .map((u) => ({ ...u, count: used.get(u.short) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items, masters.units]);

  async function remove(i: Item) {
    if (!confirm(`Delete ${i.name}? This can't be undone.`)) return;
    try {
      await vyapar.deleteItem(i.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this item.");
    }
  }

  // --- Category & Unit masters: mutations cascade into items so grouping stays correct. ---
  async function reassignCategory(from: string, to: string | null) {
    const affected = items.filter((i) => (i.category?.trim() || "") === from);
    if (affected.length) await Promise.all(affected.map((i) => vyapar.updateItem(i.id, { category: to })));
  }

  async function saveCategory(value: string | ManagedUnit) {
    const name = value as string;
    try {
      if (editingCategory) {
        if (editingCategory !== name) {
          renameCategory(editingCategory, name);
          await reassignCategory(editingCategory, name);
          await load();
        }
      } else {
        addCategory(name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the category.");
    }
    setCategoryDialog(false);
    setEditingCategory(null);
  }

  async function deleteCategory(name: string, count: number) {
    if (count > 0 && !confirm(`${count} item(s) use “${name}”. Remove this category from them?`)) return;
    try {
      if (count > 0) {
        await reassignCategory(name, null);
        await load();
      }
      removeCategory(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the category.");
    }
  }

  async function reassignUnit(from: string, to: string) {
    const affected = items.filter((i) => (i.unit || "") === from);
    if (affected.length) await Promise.all(affected.map((i) => vyapar.updateItem(i.id, { unit: to })));
  }

  async function saveUnit(value: string | ManagedUnit) {
    const unit = value as ManagedUnit;
    try {
      if (editingUnit) {
        updateUnit(editingUnit.short, unit);
        if (editingUnit.short !== unit.short) {
          await reassignUnit(editingUnit.short, unit.short);
          await load();
        }
      } else {
        addUnit(unit);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the unit.");
    }
    setUnitDialog(false);
    setEditingUnit(null);
  }

  function deleteUnit(unit: { name: string; short: string; count: number }) {
    if (unit.count > 0) {
      setError(`${unit.count} item(s) use ${unit.short}. Change their unit before deleting it.`);
      return;
    }
    removeUnit(unit.short);
  }

  const listHead = ["Item", "Code", "Category", "Unit", "Sale Price", "Purchase Price", "Stock Qty", "Stock Value"];
  const listRows = filtered.map((i) => [i.name, i.itemCode ?? "", i.category ?? "", i.unit, i.salePrice, i.purchasePrice, i.stockQty, i.stockValue]);
  const ledgerHead = ["Type", "Invoice/Ref", "Name", "Date", "Quantity", "Price/Unit", "Status"];

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Items</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {items.filter((i) => !i.isService).length} products · {items.filter((i) => i.isService).length} services ·
              Stock value <span className="font-medium text-gray-700">{inr(totals.stockValue)}</span>
              {totals.low > 0 && <span className="ml-1 font-medium text-amber-600">· {totals.low} low</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
            >
              <Upload size={14} /> Import from Excel
            </button>
            <RowMenu align="right" buttonLabel="Item tools and export">
              {(close) => (
                <>
                  <RowMenuItem
                    icon={FileSpreadsheet}
                    label="Export items"
                    onClick={() => { close(); exportRowsToCsv("items", listHead, listRows); }}
                  />
                  <RowMenuItem
                    icon={Printer}
                    label="Print"
                    onClick={() => {
                      close();
                      printRows(
                        "Item List",
                        ["Item", "Code", "Unit", "Sale Price", "Stock Qty", "Stock Value"],
                        filtered.map((i) => [i.name, i.itemCode ?? "", i.unit, inr(i.salePrice), i.stockQty, inr(i.stockValue)])
                      );
                    }}
                  />
                  <RowMenuItem
                    icon={FileText}
                    label="Download PDF"
                    onClick={() => {
                      close();
                      downloadPdf(
                        "Item List",
                        ["Item", "Code", "Unit", "Sale Price", "Stock Qty", "Stock Value"],
                        filtered.map((i) => [i.name, i.itemCode ?? "", i.unit, inr(i.salePrice), i.stockQty, inr(i.stockValue)]),
                        { rightAlignFrom: 3 }
                      );
                    }}
                  />
                  <RowMenuDivider />
                  <RowMenuItem icon={SlidersHorizontal} label="Bulk update items" onClick={() => { close(); window.location.href = "/vyapar/items/bulk"; }} />
                  <RowMenuItem icon={Settings} label="Item settings" onClick={() => { close(); window.location.href = "/vyapar/items/settings"; }} />
                </>
              )}
            </RowMenu>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-amber-600 active:scale-95"
            >
              <Plus size={15} /> Add Item
            </button>
          </div>
        </div>

        {/* Vyapar's four tabs */}
        <div className="flex gap-6 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative -mb-px px-0.5 pb-2.5 text-sm font-medium tracking-wide transition-colors duration-150 ${
                tab === t ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
              <span className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-accent transition-all duration-200 ${tab === t ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            <Spinner size={16} className="text-brand-accent" /> Loading items…
          </div>
        ) : tab === "CATEGORY" ? (
          <CategoryTab
            categories={categories}
            onAdd={() => { setEditingCategory(null); setCategoryDialog(true); }}
            onEdit={(name) => { setEditingCategory(name); setCategoryDialog(true); }}
            onDelete={deleteCategory}
          />
        ) : tab === "UNITS" ? (
          <UnitsTab
            units={units}
            onAdd={() => { setEditingUnit(null); setUnitDialog(true); }}
            onEdit={(u) => { setEditingUnit({ name: u.name, short: u.short }); setUnitDialog(true); }}
            onDelete={deleteUnit}
          />
        ) : filtered.length === 0 && !search ? (
          <VyaparEmpty
            icon={Boxes}
            title={tab === "SERVICES" ? "No services yet" : "No products yet"}
            hint="Add them one by one, or import an Excel sheet."
            action={
              <button
                onClick={() => setCreating(true)}
                className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                + Add Item
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Master list */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="space-y-2 border-b border-gray-100 p-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors duration-150 focus-within:border-cyan-500">
                  <Search size={15} className="text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search item / code / HSN"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                {tab === "PRODUCTS" && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={stockFilter}
                      onChange={(v) => setStockFilter(v as typeof stockFilter)}
                      size="sm"
                      className="flex-1"
                      options={[
                        { value: "All", label: "All stock" },
                        { value: "Low", label: "Low stock" },
                        { value: "Out", label: "Out of stock" },
                      ]}
                    />
                    <button
                      onClick={() => setSortDesc((s) => !s)}
                      title={sortDesc ? "Sort Z→A" : "Sort A→Z"}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-600"
                    >
                      <ArrowUpDown size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] font-medium tracking-wide text-gray-500 uppercase">
                <span>Item</span>
                <span>{tab === "SERVICES" ? "Price" : "Quantity"}</span>
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {filtered.map((i) => {
                  const active = i.id === selectedId;
                  return (
                    <button
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
                        active ? "bg-cyan-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${active ? "font-medium text-brand-accent" : "text-gray-700"}`}>
                          {i.name}
                        </span>
                        {i.category && <span className="block truncate text-[11px] text-gray-400">{i.category}</span>}
                      </span>
                      {i.isService ? (
                        <span className="shrink-0 text-sm text-gray-600">{inr(i.salePrice)}</span>
                      ) : (
                        <span
                          className={`shrink-0 text-sm ${
                            i.stockQty <= 0 ? "text-rose-600" : i.lowStock ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {i.stockQty}
                        </span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-10 text-center text-sm text-gray-400">No items match “{search}”.</div>
                )}
              </div>
            </div>

            {/* Detail */}
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-gray-800">{selected.name}</h3>
                        <button
                          onClick={() => setEditing(selected)}
                          title="Edit item"
                          className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-cyan-50 hover:text-brand-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        {selected.isService && (
                          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600">Service</span>
                        )}
                        {selected.lowStock && !selected.isService && (
                          <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                            <AlertTriangle size={10} /> Low stock
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                        <Meta label="Code" value={selected.itemCode} mono />
                        <Meta label={selected.isService ? "SAC" : "HSN"} value={selected.hsn} mono />
                        <Meta label="Unit" value={selected.unit} />
                        <Meta label="Category" value={selected.category} />
                        <Meta label="Tax" value={selected.taxPercent ? `GST @ ${selected.taxPercent}%` : "None"} />
                        {selected.location && <Meta label="Location" value={selected.location} />}
                      </div>
                      {selected.description && <p className="mt-2 text-sm text-gray-500">{selected.description}</p>}
                    </div>

                    <div className="flex shrink-0 items-start gap-2">
                      <button
                        onClick={() => setAdjusting(selected)}
                        disabled={selected.isService}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <SlidersHorizontal size={14} /> Adjust Item
                      </button>
                      <RowMenu align="right" buttonLabel={`Actions for ${selected.name}`}>
                        {(close) => (
                          <>
                            <RowMenuItem icon={Pencil} label="Edit item" onClick={() => { close(); setEditing(selected); }} />
                            <RowMenuItem
                              icon={FileSpreadsheet}
                              label="Export ledger"
                              onClick={() => {
                                close();
                                exportRowsToCsv(
                                  `${selected.name}-ledger`,
                                  ledgerHead,
                                  ledger.map((r) => [r.type, r.ref ?? "", r.name ?? "", r.date ?? "", r.quantity, r.pricePerUnit, r.status ?? ""])
                                );
                              }}
                            />
                            <RowMenuItem
                              icon={Printer}
                              label="Print"
                              onClick={() => {
                                close();
                                printRows(
                                  `${selected.name} — Stock Ledger`,
                                  ledgerHead,
                                  ledger.map((r) => [r.type, r.ref ?? "", r.name ?? "", r.date ?? "", r.quantity, inr(r.pricePerUnit), r.status ?? ""])
                                );
                              }}
                            />
                            <RowMenuItem
                              icon={FileText}
                              label="Download PDF"
                              onClick={() => {
                                close();
                                downloadPdf(
                                  `${selected.name} — Stock Ledger`,
                                  ledgerHead,
                                  ledger.map((r) => [r.type, r.ref ?? "", r.name ?? "", r.date ?? "", r.quantity, inr(r.pricePerUnit), r.status ?? ""]),
                                  { rightAlignFrom: 4 }
                                );
                              }}
                            />
                            <RowMenuDivider />
                            <RowMenuItem icon={Trash2} label="Delete item" tone="danger" onClick={() => { close(); remove(selected); }} />
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </div>

                  {/* Price + stock summary strip */}
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
                    <Stat label="Sale Price" value={inr(selected.salePrice)} hint={selected.salePriceWithTax ? "incl. tax" : "excl. tax"} />
                    <Stat label="Purchase Price" value={inr(selected.purchasePrice)} hint={selected.purchasePriceWithTax ? "incl. tax" : "excl. tax"} />
                    {!selected.isService && (
                      <>
                        <Stat
                          label="Stock Quantity"
                          value={`${selected.stockQty} ${selected.unit}`}
                          tone={selected.stockQty <= 0 ? "danger" : selected.lowStock ? "warn" : undefined}
                        />
                        <Stat label="Stock Value" value={inr(selected.stockValue)} />
                      </>
                    )}
                    {selected.wholesalePrice != null && (
                      <Stat label="Wholesale" value={inr(selected.wholesalePrice)} hint={`min ${selected.wholesaleMinQty ?? 0}`} />
                    )}
                  </div>
                </div>

                {/* Item ledger */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <h4 className="text-sm font-semibold text-gray-800">Transactions</h4>
                    <button
                      onClick={() =>
                        exportRowsToCsv(
                          `${selected.name}-ledger`,
                          ledgerHead,
                          ledger.map((r) => [r.type, r.ref ?? "", r.name ?? "", r.date ?? "", r.quantity, r.pricePerUnit, r.status ?? ""])
                        )
                      }
                      title="Export to Excel"
                      className="rounded-lg p-1.5 text-emerald-600 transition-colors duration-150 hover:bg-emerald-50"
                    >
                      <FileSpreadsheet size={15} />
                    </button>
                  </div>

                  {ledgerLoading ? (
                    <div className="flex min-h-[140px] items-center justify-center gap-2 text-sm text-gray-400">
                      <Spinner size={14} className="text-brand-accent" /> Loading…
                    </div>
                  ) : ledger.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-gray-400">No transactions for this item yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                            {ledgerHead.map((h, i) => (
                              <th key={h} className={`px-4 py-2 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((r) => (
                            <tr key={r.id} className="border-b border-gray-50 transition-colors duration-150 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                              <td className="px-4 py-2.5 text-gray-700">{r.type}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.ref ?? "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600">{r.name ?? "—"}</td>
                              <td className="px-4 py-2.5 text-gray-600">{r.date ?? "—"}</td>
                              <td className="px-4 py-2.5 text-right text-gray-800">{r.quantity}</td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{inr(r.pricePerUnit)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{r.status ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <VyaparEmpty icon={Boxes} title="Select an item" hint="Pick one on the left to see its pricing, stock and ledger." />
            )}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <ItemDialog
          existing={editing ?? undefined}
          categories={categoryNames}
          units={masters.units}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(saved, again) => {
            load();
            setSelectedId(saved.id);
            if (!again) { setCreating(false); setEditing(null); }
          }}
        />
      )}
      {adjusting && (
        <AdjustStockDialog item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); load(); }} />
      )}
      {importing && <ItemImportDialog onClose={() => setImporting(false)} onImported={() => { setImporting(false); load(); }} />}
      {categoryDialog && (
        <ItemMasterDialog
          kind="category"
          existing={editingCategory ?? undefined}
          taken={categoryNames}
          onClose={() => { setCategoryDialog(false); setEditingCategory(null); }}
          onSubmit={saveCategory}
        />
      )}
      {unitDialog && (
        <ItemMasterDialog
          kind="unit"
          existing={editingUnit ?? undefined}
          taken={masters.units.map((u) => u.short)}
          onClose={() => { setUnitDialog(false); setEditingUnit(null); }}
          onSubmit={saveUnit}
        />
      )}
    </VyaparShell>
  );
}

function CategoryTab({
  categories,
  onAdd,
  onEdit,
  onDelete,
}: {
  categories: { name: string; count: number; stockValue: number; virtual?: boolean }[];
  onAdd: () => void;
  onEdit: (name: string) => void;
  onDelete: (name: string, count: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Group items into categories to filter and report on them.</p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-amber-600 active:scale-95"
        >
          <Plus size={15} /> Add Category
        </button>
      </div>
      {categories.length === 0 ? (
        <VyaparEmpty icon={Boxes} title="No categories yet" hint="Add one, or set a category on an item to group it here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div
              key={c.name}
              className={`group rounded-xl border p-4 transition-shadow duration-150 hover:shadow-md ${
                c.virtual ? "border-dashed border-gray-200 bg-gray-50/60" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className={`truncate text-sm font-semibold ${c.virtual ? "text-gray-500 italic" : "text-gray-800"}`}>{c.name}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{c.count}</span>
                  {!c.virtual && (
                    <>
                      <button
                        onClick={() => onEdit(c.name)}
                        title="Rename category"
                        className="rounded-md p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-cyan-50 hover:text-brand-accent"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => onDelete(c.name, c.count)}
                        title="Delete category"
                        className="rounded-md p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Stock value <span className="font-medium text-gray-800">{inr(c.stockValue)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitsTab({
  units,
  onAdd,
  onEdit,
  onDelete,
}: {
  units: { name: string; short: string; count: number }[];
  onAdd: () => void;
  onEdit: (u: { name: string; short: string }) => void;
  onDelete: (u: { name: string; short: string; count: number }) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Units of measure available when adding or editing an item.</p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-amber-600 active:scale-95"
        >
          <Plus size={15} /> Add Unit
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Short Name</th>
              <th className="px-4 py-2 text-right font-medium">Items Using</th>
              <th className="w-20 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.short} className="group border-b border-gray-50 last:border-b-0 even:bg-gray-50/40 hover:bg-cyan-50/40">
                <td className="px-4 py-2.5 text-gray-700">{u.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{u.short}</td>
                <td className={`px-4 py-2.5 text-right ${u.count ? "font-medium text-gray-800" : "text-gray-300"}`}>{u.count}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => onEdit(u)}
                      title="Edit unit"
                      className="rounded-md p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-cyan-50 hover:text-brand-accent"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(u)}
                      title={u.count ? "In use — reassign items first" : "Delete unit"}
                      className="rounded-md p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] tracking-wide text-gray-400 uppercase">{label}</span>
      <span className={`truncate text-gray-700 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-gray-800";
  return (
    <div>
      <div className="text-[11px] tracking-wide text-gray-400 uppercase">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
