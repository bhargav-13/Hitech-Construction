"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Keep in sync with the slide-out/overlay-out animation durations in globals.css. */
export const DRAWER_EXIT_MS = 220;

/**
 * Gives a drawer/slide-over a real close animation. Instead of unmounting immediately, callers
 * render the exit classes while `closing` is true and the actual `onClose` fires once the
 * animation has finished — so panels slide out as smoothly as they slide in.
 *
 * Also wires Escape-to-close through the same animated path.
 */
export function useDrawerDismiss(onClose: () => void, exitMs: number = DRAWER_EXIT_MS) {
  const [closing, setClosing] = useState(false);
  // Guards against double-fires (Escape + overlay click, or a re-render mid-exit).
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(onClose, exitMs);
  }, [onClose, exitMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { closing, requestClose };
}
