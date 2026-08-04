/**
 * Tiny localStorage-backed table store for the lightweight "Others" HR tools (Cashbook, Assets,
 * Goals, Job Posts…). These are single-user utilities the backend doesn't model yet; persisting
 * them locally makes the screens genuinely usable now, and they can graduate to real endpoints
 * later without changing the UI.
 */

const PREFIX = "hitech.others.";

export type RegisterRow = Record<string, string>;

export function loadRows(key: string): RegisterRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRows(key: string, rows: RegisterRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(rows));
  } catch {
    // storage full / disabled — nothing we can do, the UI just won't persist
  }
}
