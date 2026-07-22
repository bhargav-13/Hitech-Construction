"use client";

import { useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Select } from "@/components/Select";
import { DatePicker } from "@/components/DatePicker";
import { useItemSettings, DEFAULT_UNITS, TAX_RATES } from "@/lib/useItemSettings";
import type { ManagedUnit } from "@/lib/useItemMasters";
import { useVyaparBankId } from "@/lib/bankScope";
import * as vyapar from "@/lib/vyaparApi";
import type { Item } from "@/lib/vyaparApi";
import { Barcode, ImagePlus, Plus, Search, X } from "lucide-react";

type Tab = "Pricing" | "Stock";

/**
 * Add / edit an item — Vyapar's own layout: a Product↔Service toggle, the identity row
 * (name, HSN, code, unit), then Pricing and Stock tabs.
 */
export function ItemDialog({
  existing,
  categories,
  units = DEFAULT_UNITS,
  onClose,
  onSaved,
}: {
  existing?: Item;
  categories: string[];
  /** Managed unit master — falls back to Vyapar's built-in list. */
  units?: ManagedUnit[];
  onClose: () => void;
  onSaved: (saved: Item, again: boolean) => void;
}) {
  const { settings } = useItemSettings();
  const bankAccountId = useVyaparBankId();
  const [tab, setTab] = useState<Tab>("Pricing");

  const [isService, setIsService] = useState(existing?.isService ?? false);
  const [name, setName] = useState(existing?.name ?? "");
  const [hsn, setHsn] = useState(existing?.hsn ?? "");
  const [itemCode, setItemCode] = useState(existing?.itemCode ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? settings.defaultUnit);
  const [category, setCategory] = useState(existing?.category ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");

  const [salePrice, setSalePrice] = useState(existing?.salePrice ?? 0);
  const [salePriceWithTax, setSalePriceWithTax] = useState(existing?.salePriceWithTax ?? false);
  const [saleDiscount, setSaleDiscount] = useState(existing?.saleDiscount ?? 0);
  const [saleDiscountType, setSaleDiscountType] = useState<"PERCENT" | "AMOUNT">(existing?.saleDiscountType ?? "PERCENT");
  const [wholesaleOn, setWholesaleOn] = useState(existing?.wholesalePrice != null);
  const [wholesalePrice, setWholesalePrice] = useState(existing?.wholesalePrice ?? 0);
  const [wholesaleMinQty, setWholesaleMinQty] = useState(existing?.wholesaleMinQty ?? 0);
  const [purchasePrice, setPurchasePrice] = useState(existing?.purchasePrice ?? 0);
  const [purchasePriceWithTax, setPurchasePriceWithTax] = useState(existing?.purchasePriceWithTax ?? false);
  const [taxPercent, setTaxPercent] = useState(existing?.taxPercent ?? 0);

  const [openingQty, setOpeningQty] = useState(existing?.openingQty ?? 0);
  const [openingPrice, setOpeningPrice] = useState(existing?.openingPrice ?? 0);
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? new Date().toISOString().slice(0, 10));
  const [lowStockAlert, setLowStockAlert] = useState(existing?.lowStockAlert ?? 0);
  const [location, setLocation] = useState(existing?.location ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /** Services have no stock, so the tab is hidden and opening quantities are ignored. */
  const showStock = !isService && settings.stockMaintenance;

  async function submit(again: boolean) {
    if (!name.trim()) {
      setError("Item name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const body: Partial<Item> = {
      name: name.trim(),
      bankAccountId: existing ? existing.bankAccountId : bankAccountId ?? null,
      hsn: hsn.trim() || null,
      itemCode: itemCode.trim() || null,
      unit: unit || "NONE",
      category: category || null,
      description: description.trim() || null,
      salePrice: Number(salePrice) || 0,
      salePriceWithTax,
      saleDiscount: Number(saleDiscount) || 0,
      saleDiscountType,
      wholesalePrice: wholesaleOn ? Number(wholesalePrice) || 0 : null,
      wholesaleMinQty: wholesaleOn ? Number(wholesaleMinQty) || 0 : null,
      purchasePrice: Number(purchasePrice) || 0,
      purchasePriceWithTax,
      taxPercent: Number(taxPercent) || 0,
      isService,
      openingQty: showStock ? Number(openingQty) || 0 : 0,
      openingPrice: showStock ? Number(openingPrice) || 0 : 0,
      openingDate: showStock ? openingDate : null,
      lowStockAlert: showStock ? Number(lowStockAlert) || 0 : 0,
      location: showStock ? location.trim() || null : null,
    };
    try {
      const saved = existing ? await vyapar.updateItem(existing.id, body) : await vyapar.createItem(body);
      onSaved(saved, again);
      if (again) {
        setName(""); setHsn(""); setItemCode(""); setDescription("");
        setSalePrice(0); setPurchasePrice(0); setOpeningQty(0);
        setTab("Pricing");
        setSaving(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this item.");
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={existing ? "Edit Item" : "Add Item"}
      onClose={onClose}
      onSave={() => submit(false)}
      saveLabel={saving ? "Saving…" : "Save"}
      width="max-w-4xl"
    >
      <div className="space-y-5">
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

        {/* Product ↔ Service */}
        <div className="flex items-center gap-3">
          <span className={`text-sm ${!isService ? "font-medium text-brand-accent" : "text-gray-400"}`}>Product</span>
          <button
            type="button"
            role="switch"
            aria-checked={isService}
            onClick={() => setIsService((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isService ? "bg-brand-accent" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${isService ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <span className={`text-sm ${isService ? "font-medium text-brand-accent" : "text-gray-400"}`}>Service</span>
        </div>

        {/* Identity row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Item Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
          </Field>
          <Field label={isService ? "SAC Code" : "Item HSN"}>
            <div className="relative">
              <input value={hsn} onChange={(e) => setHsn(e.target.value)} className="input pr-8" />
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
            </div>
          </Field>
          <Field label="Item Code">
            <div className="flex gap-1.5">
              <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="input" />
              <button
                type="button"
                onClick={() => setItemCode(`ITM${Date.now().toString().slice(-6)}`)}
                title="Generate a code"
                className="shrink-0 rounded-lg bg-cyan-50 px-2.5 text-xs font-medium text-brand-accent transition-colors duration-150 hover:bg-cyan-100"
              >
                {settings.barcodeScan ? <Barcode size={14} /> : "Assign"}
              </button>
            </div>
          </Field>
          <Field label="Unit">
            <Select
              value={unit}
              onChange={setUnit}
              options={[{ value: "NONE", label: "Select Unit" }, ...units.map((u) => ({ value: u.short, label: `${u.name} (${u.short})` }))]}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {settings.itemCategory && (
            <Field label="Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="item-categories"
                placeholder="Select or type a category"
                className="input"
              />
              <datalist id="item-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          )}
          {settings.description && (
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
            </Field>
          )}
        </div>

        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-brand-accent transition-colors duration-150 hover:underline"
          onClick={() => setError("Item images arrive with the file-upload service.")}
        >
          <ImagePlus size={15} /> Add Item Image
        </button>

        {/* Tabs */}
        <div className="flex gap-5 border-b border-gray-200">
          {(["Pricing", ...(showStock ? (["Stock"] as const) : [])] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative -mb-px px-0.5 pb-2.5 text-sm font-medium transition-colors duration-150 ${
                tab === t ? "text-brand-accent" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t}
              <span className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-accent transition-all duration-200 ${tab === t ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>

        {tab === "Pricing" ? (
          <div className="animate-fade-in space-y-4">
            {/* Sale price */}
            <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-700">Sale Price</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Sale Price">
                  <div className="flex gap-1.5">
                    <input type="number" value={salePrice} onChange={(e) => setSalePrice(Number(e.target.value))} className="input" />
                    <Select
                      value={salePriceWithTax ? "with" : "without"}
                      onChange={(v) => setSalePriceWithTax(v === "with")}
                      className="w-36 shrink-0"
                      options={[
                        { value: "without", label: "Without Tax" },
                        { value: "with", label: "With Tax" },
                      ]}
                    />
                  </div>
                </Field>
                <Field label="Discount On Sale Price">
                  <div className="flex gap-1.5">
                    <input type="number" value={saleDiscount} onChange={(e) => setSaleDiscount(Number(e.target.value))} className="input" />
                    <Select
                      value={saleDiscountType}
                      onChange={(v) => setSaleDiscountType(v as "PERCENT" | "AMOUNT")}
                      className="w-36 shrink-0"
                      options={[
                        { value: "PERCENT", label: "Percentage" },
                        { value: "AMOUNT", label: "Amount" },
                      ]}
                    />
                  </div>
                </Field>
              </div>

              {settings.wholesalePrice && (
                <div className="mt-3">
                  {wholesaleOn ? (
                    <div className="animate-fade-in grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Wholesale Price">
                        <input type="number" value={wholesalePrice} onChange={(e) => setWholesalePrice(Number(e.target.value))} className="input" />
                      </Field>
                      <Field label="Minimum Wholesale Qty">
                        <div className="flex gap-1.5">
                          <input type="number" value={wholesaleMinQty} onChange={(e) => setWholesaleMinQty(Number(e.target.value))} className="input" />
                          <button
                            onClick={() => setWholesaleOn(false)}
                            className="shrink-0 rounded-lg px-2 text-gray-300 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </Field>
                    </div>
                  ) : (
                    <button
                      onClick={() => setWholesaleOn(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-brand-accent transition-colors duration-150 hover:underline"
                    >
                      <Plus size={14} /> Add Wholesale Price
                    </button>
                  )}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-gray-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-gray-700">Purchase Price</h4>
                <div className="flex gap-1.5">
                  <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(Number(e.target.value))} className="input" />
                  <Select
                    value={purchasePriceWithTax ? "with" : "without"}
                    onChange={(v) => setPurchasePriceWithTax(v === "with")}
                    className="w-36 shrink-0"
                    options={[
                      { value: "without", label: "Without Tax" },
                      { value: "with", label: "With Tax" },
                    ]}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-4">
                <h4 className="mb-3 text-sm font-semibold text-gray-700">Taxes</h4>
                <Field label="Tax Rate">
                  <Select
                    value={String(taxPercent)}
                    onChange={(v) => setTaxPercent(Number(v))}
                    options={TAX_RATES.map((t) => ({ value: String(t), label: t === 0 ? "None" : `GST @ ${t}%` }))}
                  />
                </Field>
                {salePrice > 0 && taxPercent > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {salePriceWithTax
                      ? `Base ₹${(salePrice / (1 + taxPercent / 100)).toFixed(2)} + tax ₹${(salePrice - salePrice / (1 + taxPercent / 100)).toFixed(2)}`
                      : `Sells at ₹${(salePrice * (1 + taxPercent / 100)).toFixed(2)} including tax`}
                  </p>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Opening Quantity">
              <input type="number" value={openingQty} onChange={(e) => setOpeningQty(Number(e.target.value))} className="input" />
            </Field>
            <Field label="At Price">
              <input type="number" value={openingPrice} onChange={(e) => setOpeningPrice(Number(e.target.value))} className="input" />
            </Field>
            <Field label="As Of Date">
              <DatePicker value={openingDate} onChange={setOpeningDate} placeholder="As of date" />
            </Field>
            <Field label="Min Stock To Maintain">
              <input type="number" value={lowStockAlert} onChange={(e) => setLowStockAlert(Number(e.target.value))} className="input" />
            </Field>
            <Field label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Rack / godown" className="input" />
            </Field>
            {openingQty > 0 && openingPrice > 0 && (
              <div className="flex items-end pb-1 text-sm text-gray-500">
                Opening stock value{" "}
                <span className="ml-1 font-medium text-gray-800">₹{(openingQty * openingPrice).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="rounded-lg border border-brand-accent px-4 py-2 text-sm font-medium text-brand-accent transition-all duration-150 hover:bg-cyan-50 active:scale-95 disabled:opacity-60"
          >
            Save &amp; New
          </button>
        </div>
      </div>
    </Drawer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
