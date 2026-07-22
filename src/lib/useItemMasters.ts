"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_UNITS } from "./useItemSettings";

/**
 * Vyapar keeps Item Categories and Units as their own small masters you can add / rename / delete,
 * and those flow into the item form's dropdowns. The backend has no endpoints for them yet
 * (that arrives with the rest of vyapar-service), so we persist them client-side — same pattern
 * as useItemSettings.
 */
export interface ManagedUnit {
  name: string;
  short: string;
}

interface ItemMasters {
  categories: string[];
  units: ManagedUnit[];
}

const KEY = "vyapar.itemMasters.v1";

const seed = (): ItemMasters => ({ categories: [], units: DEFAULT_UNITS.map((u) => ({ ...u })) });

export function useItemMasters() {
  const [masters, setMasters] = useState<ItemMasters>(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMasters({ ...seed(), ...(JSON.parse(raw) as ItemMasters) });
    } catch {
      /* ignore a malformed blob — fall back to the seed */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: ItemMasters) => {
    setMasters(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }, []);

  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const addCategory = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      setMasters((m) => {
        if (m.categories.some((c) => eq(c, clean))) return m;
        const next = { ...m, categories: [...m.categories, clean] };
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const renameCategory = useCallback(
    (from: string, to: string) => {
      const clean = to.trim();
      if (!clean) return;
      setMasters((m) => {
        const next = {
          ...m,
          categories: m.categories.map((c) => (eq(c, from) ? clean : c)).filter((c, i, a) => a.findIndex((x) => eq(x, c)) === i),
        };
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const removeCategory = useCallback((name: string) => {
    setMasters((m) => {
      const next = { ...m, categories: m.categories.filter((c) => !eq(c, name)) };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const addUnit = useCallback((unit: ManagedUnit) => {
    const name = unit.name.trim();
    const short = unit.short.trim();
    if (!name || !short) return;
    setMasters((m) => {
      if (m.units.some((u) => eq(u.short, short))) return m;
      const next = { ...m, units: [...m.units, { name, short }] };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updateUnit = useCallback((fromShort: string, unit: ManagedUnit) => {
    const name = unit.name.trim();
    const short = unit.short.trim();
    if (!name || !short) return;
    setMasters((m) => {
      const next = { ...m, units: m.units.map((u) => (eq(u.short, fromShort) ? { name, short } : u)) };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeUnit = useCallback((short: string) => {
    setMasters((m) => {
      const next = { ...m, units: m.units.filter((u) => !eq(u.short, short)) };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { masters, ready, persist, addCategory, renameCategory, removeCategory, addUnit, updateUnit, removeUnit };
}
