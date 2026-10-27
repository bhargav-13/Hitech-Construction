"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "hlt.draft.";

export interface FormDraft<T> {
  savedAt: number;
  data: T;
}

/**
 * Keeps an unsaved new-document form in this browser so it survives being closed (Vyapar-10).
 *
 * The case it exists for: halfway through a bill the user has to check a setting, closes the form
 * to get there, and used to come back to an empty one. Now the form writes its state here while it
 * is dirty, and the next time the same form opens it offers the draft back.
 *
 * `key` null switches it off — editing an existing document has the server copy to fall back on.
 * The draft is cleared on a successful save, or when the user discards it from the banner.
 */
export function useFormDraft<T>(key: string | null, data: T, dirty: boolean) {
  const storageKey = key ? PREFIX + key : null;
  const [offered, setOffered] = useState<FormDraft<T> | null>(null);

  // Read once on open. Writes below only start after the user edits, so opening the form never
  // overwrites the draft it is about to offer.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setOffered(JSON.parse(raw) as FormDraft<T>);
    } catch {}
  }, [storageKey]);

  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (!storageKey || !dirty) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), data: JSON.parse(serialized) }));
    } catch {}
    // Typing into a fresh form supersedes the old draft, so stop offering it.
    setOffered(null);
  }, [storageKey, dirty, serialized]);

  const clear = useCallback(() => {
    setOffered(null);
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return { offered, dismiss: () => setOffered(null), clear };
}
