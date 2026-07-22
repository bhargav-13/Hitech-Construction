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

/** GST slabs offered on the item form. */
export const TAX_RATES = [0, 0.25, 3, 5, 12, 18, 28];
