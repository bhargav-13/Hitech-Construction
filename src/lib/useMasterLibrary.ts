"use client";

import { useCallback, useEffect, useState } from "react";
import type { MasterLibrarySpec, MasterRow } from "./masterLibraries";

/**
 * Storage for one master library. Rows live in localStorage under a per-library key — none of these
 * masters have backend endpoints yet, same as useItemMasters / usePartySettings. This hook is the
 * single seam: when the endpoints ship, swap the body for fetch calls and every library screen
 * follows without touching MasterLibrary or the specs.
 *
 * A fresh key is seeded from the spec so the library is useful on first open. `reset()` puts the
 * seed back, which is also the escape hatch if someone deletes rows they wanted.
 */
const keyFor = (id: string) => `library.master.${id}.v1`;

/** Rows carry their own id; the seed doesn't, so mint one per seeded row. */
function seedRows(spec: MasterLibrarySpec): MasterRow[] {
  return spec.seed.map((row, i) => ({ ...row, id: `${spec.id}-seed-${i}` }));
}

function newId(): string {
  // crypto.randomUUID is unavailable on http:// origins in some browsers — this is only a local key.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useMasterLibrary(spec: MasterLibrarySpec) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [ready, setReady] = useState(false);

  // Re-reads whenever the dropdown switches library, since `spec` changes with it.
  const hydrate = useCallback(() => {
    setReady(false);
    let next = seedRows(spec);
    try {
      const raw = localStorage.getItem(keyFor(spec.id));
      if (raw) next = JSON.parse(raw) as MasterRow[];
    } catch {
      /* malformed blob — fall back to the seed */
    }
    setRows(next);
    setReady(true);
  }, [spec]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const persist = useCallback(
    (next: MasterRow[]) => {
      setRows(next);
      try {
        localStorage.setItem(keyFor(spec.id), JSON.stringify(next));
      } catch {
        /* storage unavailable — keep the in-memory value */
      }
    },
    [spec.id],
  );

  const add = useCallback(
    (values: Omit<MasterRow, "id">) => persist([...rows, { ...values, id: newId() }]),
    [persist, rows],
  );

  const update = useCallback(
    (id: string, values: Omit<MasterRow, "id">) => persist(rows.map((r) => (r.id === id ? { ...values, id } : r))),
    [persist, rows],
  );

  const remove = useCallback((id: string) => persist(rows.filter((r) => r.id !== id)), [persist, rows]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(keyFor(spec.id));
    } catch {
      /* storage unavailable — the in-memory reset below still applies */
    }
    setRows(seedRows(spec));
  }, [spec]);

  return { rows, ready, add, update, remove, reset };
}
