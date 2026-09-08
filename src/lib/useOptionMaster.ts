"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A small, user-extendable list of choices behind a dropdown — units of measure, tender class,
 * designations, security-deposit types.
 *
 * Every one of these started as a hardcoded array, and every one of them was wrong for somebody: a
 * site buys in "Trip", a contractor registers as "AA Class", a firm has a "Billing Engineer". The
 * client asked for these to be theirs to extend rather than a change request, so each list is now
 * the built-ins shipped with the app plus whatever has been added here.
 *
 * Held per browser in `localStorage`, deliberately. None of these lists has a backend endpoint, and
 * none needs one for a saved record to be correct: every field that uses them stores the chosen
 * *text*, so a document saved with "Trip" reads back as "Trip" on any machine — only the dropdown's
 * suggestions are local. When these get real endpoints, this file is the single place to repoint.
 *
 * Values already on a loaded record are always offered even when they aren't in the master (see
 * {@link optionsFor}), so opening an old record never silently blanks a field.
 */

const PREFIX = "onsite.optionMaster.";

/** Case- and space-insensitive: "site engineer" must not be added twice. */
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Cached snapshots, keyed by master.
 *
 * `useSyncExternalStore` compares snapshots by identity, so re-parsing the JSON on every read would
 * hand back a fresh array each time and re-render without end. Each entry caches the raw string it
 * was parsed from and is only rebuilt when that string changes.
 */
const cache = new Map<string, { raw: string | null; value: string[] }>();
const listeners = new Set<() => void>();

/** Server render sees the built-ins only; a browser's additions arrive on hydration. */
const EMPTY: string[] = [];

function read(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + key);
  } catch {
    return EMPTY; // private window, blocked storage — the built-ins still work
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: string[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) value = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    /* malformed blob — fall back to the built-ins alone */
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, next: string[]) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* Storage unavailable. Keep it for this session anyway — losing the value the moment it was
       typed is worse than not persisting it. */
  }
  cache.set(key, { raw, value: next });
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface OptionMaster {
  /** Built-ins first, in their shipped order, then anything added. */
  options: string[];
  /** Adds (or finds) a value and returns the spelling to select. Null when the text was blank. */
  add: (value: string) => string | null;
  /** Removes an added value. Built-ins can't be removed — they're the app's own vocabulary. */
  remove: (value: string) => void;
  /** False for built-ins, so a UI can offer removal only where it means something. */
  isCustom: (value: string) => boolean;
}

export function useOptionMaster(key: string, builtIns: readonly string[]): OptionMaster {
  // One subscription shared by every mounted picker, so a value added on one row appears on the
  // rest of the grid at once rather than after a remount.
  const added = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);

  const options = useMemo(() => {
    const out = [...builtIns];
    for (const v of added) if (!out.some((x) => same(x, v))) out.push(v);
    return out;
  }, [added, builtIns]);

  const add = useCallback(
    (value: string): string | null => {
      const clean = value.trim();
      if (!clean) return null;
      // Return the existing spelling rather than adding a near-duplicate — picking "site engineer"
      // should select the "Site Engineer" already on file.
      const existing = [...builtIns, ...read(key)].find((v) => same(v, clean));
      if (existing) return existing;
      write(key, [...read(key), clean]);
      return clean;
    },
    [key, builtIns],
  );

  const remove = useCallback(
    (value: string) => write(key, read(key).filter((v) => !same(v, value))),
    [key],
  );

  const isCustom = useCallback(
    (value: string) => !builtIns.some((v) => same(v, value)) && read(key).some((v) => same(v, value)),
    [key, builtIns],
  );

  return { options, add, remove, isCustom };
}

/**
 * Dropdown options for one field: the master, plus the field's current value when it predates it.
 * Without the second half, editing a record saved with a value since removed would show the field
 * as empty and quietly rewrite it on save.
 */
export function optionsFor(options: string[], current?: string | null, placeholder?: string) {
  const list = current && !options.some((o) => same(o, current)) ? [current, ...options] : options;
  const rows = list.map((o) => ({ value: o, label: o }));
  return placeholder ? [{ value: "", label: placeholder }, ...rows] : rows;
}
