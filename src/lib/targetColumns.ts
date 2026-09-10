"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which columns the Target table shows.
 *
 * <p>Ten columns is more than fits, and which ten matter depends entirely on who is looking: a site
 * engineer wants Progress and Delay, a planner wants Schedule, Actual and Forecast End, a commercial
 * manager wants none of those and only the value. Rather than pick for all three, the table carries
 * them all and each person turns off what they do not use.
 *
 * <p>Kept per browser rather than per account: it is a view preference, not a setting worth a
 * server round trip, and the same person reasonably wants different columns on a laptop and a site
 * tablet.
 */

export const TARGET_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress" },
  { key: "delay", label: "Delay" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "duration", label: "Duration" },
  { key: "schedule", label: "Schedule" },
  { key: "actual", label: "Actual" },
  { key: "forecastEnd", label: "Forecast End" },
  { key: "dependencies", label: "Dependencies" },
  { key: "value", label: "Value earned" },
  { key: "tag", label: "Tag" },
] as const;

export type TargetColumnKey = (typeof TARGET_COLUMNS)[number]["key"];

/** Everything on by default: a column somebody has never seen is one they never turn on. */
const ALL: TargetColumnKey[] = TARGET_COLUMNS.map((c) => c.key);
const KEY = "hitech.target.columns.v1";

function read(): TargetColumnKey[] {
  if (typeof window === "undefined") return ALL;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return ALL;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ALL;
    // Filter against the current column list so a key removed in a later build cannot resurrect
    // itself, and a key added in one shows up rather than staying invisible forever.
    const known = parsed.filter((k): k is TargetColumnKey => ALL.includes(k as TargetColumnKey));
    return known.length ? known : ALL;
  } catch {
    return ALL;
  }
}

// useSyncExternalStore compares snapshots by identity, so the cached array must be stable between
// reads or every render schedules another one and the component never settles.
let cache: TargetColumnKey[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): TargetColumnKey[] {
  if (cache === null) cache = read();
  return cache;
}

function serverSnapshot(): TargetColumnKey[] {
  return ALL;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function write(next: TargetColumnKey[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser with site data blocked still gets the toggle for this session.
  }
  listeners.forEach((fn) => fn());
}

export function useTargetColumns() {
  const visible = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const toggle = useCallback(
    (key: TargetColumnKey) => {
      const next = visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key];
      // Turning the last one off leaves a table of nothing but names; keep at least one.
      write(next.length ? next : [key]);
    },
    [visible],
  );

  const reset = useCallback(() => write(ALL), []);

  const shows = useCallback((key: TargetColumnKey) => visible.includes(key), [visible]);

  return { visible, shows, toggle, reset };
}
