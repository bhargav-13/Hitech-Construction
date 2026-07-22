"use client";

import { VyaparShell } from "@/components/vyapar/VyaparShell";
import { Select } from "@/components/Select";
import { useItemSettings, DEFAULT_ITEM_SETTINGS, DEFAULT_UNITS } from "@/lib/useItemSettings";
import { Info, RotateCcw } from "lucide-react";

/** Settings → Item, matching Vyapar's Item Settings panel. */
export default function ItemSettingsPage() {
  const { settings, patch, save } = useItemSettings();

  const setField = (i: number, v: boolean) => {
    const next = [...settings.fieldsEnabled] as [boolean, boolean, boolean, boolean];
    next[i] = v;
    patch({ fieldsEnabled: next });
  };
  const setName = (i: number, v: string) => {
    const next = [...settings.fieldNames] as [string, string, string, string];
    next[i] = v;
    patch({ fieldNames: next });
  };

  return (
    <VyaparShell>
      <div className="animate-fade-in space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Item Settings</h2>
            <p className="mt-0.5 text-sm text-gray-500">Controls which fields the item form offers.</p>
          </div>
          <button
            onClick={() => save(DEFAULT_ITEM_SETTINGS)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-all duration-150 hover:bg-gray-50 active:scale-95"
          >
            <RotateCcw size={14} /> Reset to defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Item Fields</h3>
            <div className="space-y-1">
              <Toggle label="Item Category" hint="Group items by category." checked={settings.itemCategory} onChange={(v) => patch({ itemCategory: v })} />
              <Toggle label="Description" hint="A free-text note carried onto invoices." checked={settings.description} onChange={(v) => patch({ description: v })} />
              <Toggle label="Wholesale Price" hint="A second price tier above a minimum quantity." checked={settings.wholesalePrice} onChange={(v) => patch({ wholesalePrice: v })} />
              <Toggle label="Barcode Scan" hint="Scan a barcode to add an item to an invoice." checked={settings.barcodeScan} onChange={(v) => patch({ barcodeScan: v })} />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Stock</h3>
            <Toggle
              label="Stock Maintenance"
              hint="Track quantities. Off turns Items into a plain price list."
              checked={settings.stockMaintenance}
              onChange={(v) => patch({ stockMaintenance: v })}
            />
            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] font-medium tracking-wide text-gray-400 uppercase">Default Unit</span>
              <Select
                value={settings.defaultUnit}
                onChange={(v) => patch({ defaultUnit: v })}
                options={[{ value: "NONE", label: "None" }, ...DEFAULT_UNITS.map((u) => ({ value: u.short, label: `${u.name} (${u.short})` }))]}
              />
            </label>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
            <div className="mb-1 flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-800">Additional Item Fields</h3>
              <Info size={12} className="text-gray-300" />
            </div>
            <p className="mb-3 text-xs text-gray-500">Four extra fields you can capture per item.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <label
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border p-3 transition-colors duration-150 ${
                    settings.fieldsEnabled[i] ? "border-cyan-200 bg-cyan-50/30" : "border-gray-200"
                  }`}
                >
                  <input type="checkbox" checked={settings.fieldsEnabled[i]} onChange={(e) => setField(i, e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                  <input
                    value={settings.fieldNames[i]}
                    onChange={(e) => setName(i, e.target.value)}
                    placeholder={`Additional Field ${i + 1}`}
                    disabled={!settings.fieldsEnabled[i]}
                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-cyan-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        <p className="text-xs text-gray-400">Saved on this device for now — these move to your company profile when the settings API lands.</p>
      </div>
    </VyaparShell>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg px-1 py-2 transition-colors duration-150 hover:bg-gray-50">
      <div className="min-w-0">
        <div className="text-sm text-gray-700">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-brand-accent" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
