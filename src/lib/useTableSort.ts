"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Client-side table sorting. Vyapar lists are loaded in full, so sorting stays on the client:
 * pass a map of column keys → value accessors, and get back the sorted rows plus a `toggle`
 * that flips between asc/desc (and resets to asc when switching columns).
 *
 * Values are compared numerically when both are numbers, otherwise case-insensitively as strings.
 * Null/undefined always sort last regardless of direction.
 */
export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number | null | undefined>,
  initial?: { key: string; dir?: SortDir },
) {
  const [key, setKey] = useState<string | null>(initial?.key ?? null);
  const [dir, setDir] = useState<SortDir>(initial?.dir ?? "asc");

  const sorted = useMemo(() => {
    if (!key || !accessors[key]) return rows;
    const get = accessors[key];
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Blanks sink to the bottom in either direction.
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1; // a after b
      if (bEmpty) return -1; // a before b
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
    });
  }, [rows, key, dir, accessors]);

  const toggle = (nextKey: string) => {
    if (key === nextKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(nextKey);
      setDir("asc");
    }
  };

  return { sorted, sortKey: key, sortDir: dir, toggle };
}
