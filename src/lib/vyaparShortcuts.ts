"use client";

import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/lib/authStore";

/**
 * Vyapar's keyboard shortcuts: Alt+<key> opens a new document of that type, Ctrl+Enter opens the
 * quick-create menu — the same keys the Vyapar desktop app ships with, so people who come from it
 * keep their muscle memory. Every key can be changed from Vyapar → Settings → Shortcuts.
 *
 * Kept per user in this browser: it's a personal habit, like the pinned top-bar buttons.
 */

/** The menu itself has a reserved id so it sits in the same map as the documents. */
export const MENU_SHORTCUT = "MENU";

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  [MENU_SHORTCUT]: "Ctrl+Enter",
  SALE: "Alt+S",
  PAYMENT_IN: "Alt+I",
  SALE_RETURN: "Alt+R",
  SALE_ORDER: "Alt+F",
  ESTIMATE: "Alt+M",
  PROFORMA: "Alt+K",
  DELIVERY_CHALLAN: "Alt+D",
  PURCHASE: "Alt+P",
  PAYMENT_OUT: "Alt+O",
  PURCHASE_RETURN: "Alt+L",
  PURCHASE_ORDER: "Alt+G",
  EXPENSE: "Alt+E",
  PARTY_TRANSFER: "Alt+J",
};

const KEY_PREFIX = "hlt.vyapar.shortcuts";
const listeners = new Set<() => void>();
let cache: { key: string; value: Record<string, string> } | null = null;

function storageKey(userId: number | null | undefined) {
  return `${KEY_PREFIX}.${userId ?? "anon"}`;
}

/** The user's map: their overrides over the defaults. "" means "no shortcut" for that entry. */
function read(userId: number | null | undefined): Record<string, string> {
  const key = storageKey(userId);
  if (cache?.key === key) return cache.value;
  let overrides: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) overrides = JSON.parse(raw);
  } catch {}
  cache = { key, value: { ...DEFAULT_SHORTCUTS, ...overrides } };
  return cache.value;
}

export function saveShortcuts(userId: number | null | undefined, map: Record<string, string>) {
  // Only what differs from the defaults is stored, so a later change to a default reaches
  // everyone who never touched that entry.
  const overrides: Record<string, string> = {};
  for (const [id, combo] of Object.entries(map)) {
    if ((DEFAULT_SHORTCUTS[id] ?? "") !== combo) overrides[id] = combo;
  }
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(overrides));
  } catch {}
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(KEY_PREFIX)) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useVyaparShortcuts() {
  const userId = useAuthStore((s) => s.user?.id);
  const map = useSyncExternalStore(subscribe, () => read(userId), () => DEFAULT_SHORTCUTS);
  return { map, save: (next: Record<string, string>) => saveShortcuts(userId, next) };
}

/**
 * A key event as a combo string — "Alt+S", "Ctrl+Shift+E", "Ctrl+Enter". Letters and digits come
 * from the physical key (e.code) so Alt on a Mac, which types "ß" for Alt+S, still reads as S.
 * Null for a bare modifier press.
 */
export function comboOf(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (e.key === " ") key = "Space";
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/**
 * Whether a combo is safe to bind: it needs Ctrl or Alt (or be a function key), otherwise it
 * would fire while someone is typing a party name.
 */
export function isBindable(combo: string): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  return parts.includes("Ctrl") || parts.includes("Alt") || /^F\d{1,2}$/.test(key);
}

/** Combos the browser keeps for itself — binding them works poorly or not at all. */
export const BROWSER_RESERVED = new Set([
  "Ctrl+T", "Ctrl+W", "Ctrl+N", "Ctrl+Shift+N", "Ctrl+Shift+T", "Ctrl+Tab", "Ctrl+L", "Ctrl+R", "F5", "F11", "F12", "Alt+F4",
]);
