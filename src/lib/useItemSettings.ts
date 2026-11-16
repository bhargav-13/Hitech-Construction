"use client";

import { useCallback, useEffect, useState } from "react";

/** Item module preferences, mirroring Vyapar's Item Settings panel. */
export interface ItemSettings {
  /** Second price tier for bulk buyers. */
  wholesalePrice: boolean;
  /** Barcode field + scan-to-add on invoices. */
  barcodeScan: boolean;
  itemCategory: boolean;
  description: boolean;
  /** Track stock at all — off turns the module into a plain price list. */
  stockMaintenance: boolean;
  /** Four configurable extras. */
  fieldsEnabled: [boolean, boolean, boolean, boolean];
  fieldNames: [string, string, string, string];
  /** Default unit applied to a new item. */
  defaultUnit: string;
}

export const DEFAULT_ITEM_SETTINGS: ItemSettings = {
  wholesalePrice: false,
  barcodeScan: false,
  itemCategory: true,
  description: true,
  stockMaintenance: true,
  fieldsEnabled: [false, false, false, false],
  fieldNames: ["", "", "", ""],
  defaultUnit: "NONE",
};

const KEY = "vyapar.itemSettings.v1";

export function useItemSettings() {
  const [settings, setSettings] = useState<ItemSettings>(DEFAULT_ITEM_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULT_ITEM_SETTINGS, ...(JSON.parse(raw) as ItemSettings) });
    } catch {
      /* ignore a malformed preference blob */
    }
  }, []);

  const save = useCallback((next: ItemSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }, []);

  const patch = useCallback((p: Partial<ItemSettings>) => save({ ...settings, ...p }), [settings, save]);

  return { settings, save, patch };
}

/** Units Vyapar ships with, used to seed the Units tab. */
export const DEFAULT_UNITS: { name: string; short: string }[] = [
  { name: "Bags", short: "BAG" },
  { name: "Bottles", short: "BTL" },
  { name: "Box", short: "BOX" },
  { name: "Bundles", short: "BDL" },
  { name: "Cans", short: "CAN" },
  { name: "Cartons", short: "CTN" },
  { name: "Dozens", short: "DZN" },
  { name: "Grammes", short: "GM" },
  { name: "Kilograms", short: "KG" },
  { name: "Litre", short: "LTR" },
  { name: "Metres", short: "MTR" },
  { name: "Numbers", short: "NOS" },
  { name: "Packs", short: "PAC" },
  { name: "Pairs", short: "PRS" },
  { name: "Pieces", short: "PCS" },
  { name: "Quintal", short: "QTL" },
  { name: "Rolls", short: "ROL" },
  { name: "Square Feet", short: "SQF" },
  { name: "Square Metres", short: "SQM" },
  { name: "Tablets", short: "TBS" },
  { name: "Tonnes", short: "TON" },
  { name: "Cubic Metre", short: "CUM" },
];

/** Every GST slab — used to snap a scanned rate to a real one. */
export const ALL_TAX_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

/** GST slabs offered on the item form — the client only uses 12% and 18% (KAN-114). */
export const TAX_RATES = [0, 12, 18];

/**
 * Tax-rate picker options: the default slabs, any rate the user added from a document's Tax picker,
 * and the current value so an item already at 5% still shows it.
 */
export function taxRateOptions(current?: number | null, extra: number[] = []): { value: string; label: string }[] {
  const rates = [...new Set([...TAX_RATES, ...extra, ...(current != null ? [Number(current)] : [])])].sort((a, b) => a - b);
  return rates.map((t) => ({ value: String(t), label: t === 0 ? "None" : `GST @ ${t}%` }));
}
