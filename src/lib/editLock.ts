"use client";

import { useEffect } from "react";

/**
 * "Someone is in the middle of something" — the signal background refreshes wait on.
 *
 * Explicit locks come from editors that register themselves (the task drawer, a Kanban drag). On
 * top of that any open dialog, or focus in a text field, counts too, so an add/edit popup or an
 * inline cell edit that never heard of this file is still never refreshed out from under the user.
 */
let locks = 0;

/** Hold the lock while `active` is true (default: while mounted). */
export function useEditLock(active = true) {
  useEffect(() => {
    if (!active) return;
    locks++;
    return () => {
      locks = Math.max(0, locks - 1);
    };
  }, [active]);
}

export function isUserEditing(): boolean {
  if (locks > 0) return true;
  if (typeof document === "undefined") return false;
  if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-editing="true"]')) return true;
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  return a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" ||
    (a.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((a as HTMLInputElement).type));
}
