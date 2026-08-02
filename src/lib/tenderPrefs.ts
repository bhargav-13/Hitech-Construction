"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TenderSource, TenderStage } from "./tenderTypes";

/**
 * Per-user view preferences for the Tender tables — hidden columns, row density and saved filter
 * views, keyed by pipeline variant ("sorting" | "research" | "applied"). Kept separate from the data
 * store so bumping the seed version never wipes a user's choices, and vice-versa.
 */

export type RowDensity = "comfortable" | "compact";

/** A named filter combination the user can jump back to. */
export interface SavedView {
  id: string;
  name: string;
  variant: string;
  source: "ALL" | TenderSource;
  dept: string;
  cls: string;
  outcome: "ALL" | TenderStage;
  search: string;
  sortKey?: string | null;
  sortDir?: "asc" | "desc";
}

interface TenderPrefsState {
  /** Hidden column keys per variant. Absent = all columns shown. */
  hiddenCols: Record<string, string[]>;
  density: RowDensity;
  views: SavedView[];
  toggleCol: (variant: string, key: string) => void;
  showAll: (variant: string) => void;
  setDensity: (d: RowDensity) => void;
  saveView: (view: Omit<SavedView, "id">) => void;
  removeView: (id: string) => void;
}

export const useTenderPrefs = create<TenderPrefsState>()(
  persist(
    (set) => ({
      hiddenCols: {},
      density: "comfortable",
      views: [],
      toggleCol: (variant, key) =>
        set((s) => {
          const cur = s.hiddenCols[variant] ?? [];
          const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
          return { hiddenCols: { ...s.hiddenCols, [variant]: next } };
        }),
      showAll: (variant) => set((s) => ({ hiddenCols: { ...s.hiddenCols, [variant]: [] } })),
      setDensity: (density) => set({ density }),
      saveView: (view) =>
        set((s) => ({ views: [...s.views, { ...view, id: `view-${Date.now().toString(36)}` }] })),
      removeView: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
    }),
    { name: "hitech.tenderPrefs.v2", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Row padding per density — used by every Tender table so they stay consistent. */
export const DENSITY_CLASS: Record<RowDensity, { cell: string; head: string }> = {
  comfortable: { cell: "px-4 py-2.5", head: "px-4 py-2" },
  compact: { cell: "px-3 py-1.5", head: "px-3 py-1.5" },
};
