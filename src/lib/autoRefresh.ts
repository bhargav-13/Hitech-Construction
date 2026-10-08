"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { isUserEditing } from "./editLock";

/**
 * App-wide silent auto-refresh for module screens (Vyapar, Payroll).
 *
 * One clock, mounted by the module's shell ({@link useAutoRefreshClock}), ticks every
 * {@link AUTO_REFRESH_MS} — but only while the tab is visible and nobody is mid-edit (a drawer or
 * dialog open, a field focused; see editLock). A tick that is due while someone edits waits and
 * fires as soon as they finish. Each screen's loader subscribes with {@link useAutoRefresh}; inline
 * effects can add {@link useRefreshTick} to their deps.
 *
 * Background ticks are silent: loaders check {@link isBackgroundRefresh} and skip their loading
 * spinner, so the data is swapped in place — no flashing table, no lost scroll position.
 */
export const AUTO_REFRESH_MS = 3 * 60_000;
const CHECK_MS = 15_000;

interface ClockState {
  tick: number;
  lastAt: number;
  fire: () => void;
}

const useClock = create<ClockState>((set, get) => ({
  tick: 0,
  lastAt: Date.now(),
  fire: () => set({ tick: get().tick + 1, lastAt: Date.now() }),
}));

let background = false;

/** True while a background tick is calling loaders — they should not show a loading spinner. */
export function isBackgroundRefresh(): boolean {
  return background;
}

/** Mount once per module shell. */
export function useAutoRefreshClock() {
  useEffect(() => {
    useClock.setState({ lastAt: Date.now() }); // a fresh page has fresh data
    const check = () => {
      if (document.hidden || isUserEditing()) return;
      if (Date.now() - useClock.getState().lastAt < AUTO_REFRESH_MS) return;
      useClock.getState().fire();
    };
    const t = window.setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
}

/** Run `refresh` silently on every tick (not on mount — the screen already loads itself). */
export function useAutoRefresh(refresh: () => unknown) {
  const fn = useRef(refresh);
  useEffect(() => {
    fn.current = refresh;
  }, [refresh]);
  const tick = useClock((s) => s.tick);
  const seen = useRef(tick);
  useEffect(() => {
    if (tick === seen.current) return;
    seen.current = tick;
    background = true;
    try {
      void fn.current();
    } finally {
      // Loaders flip their spinner synchronously before their first await, so this is enough.
      background = false;
    }
  }, [tick]);
}

/** The tick number, for effects that load inline: add it to their dependency list. */
export function useRefreshTick(): number {
  return useClock((s) => s.tick);
}

/** Refresh now (the "Updated … ago" button). */
export function refreshNow() {
  useClock.getState().fire();
}

/** "Updated 2 min ago", re-rendered every 30 s. */
export function useLastRefreshedAgo(): string {
  const lastAt = useClock((s) => s.lastAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const mins = Math.floor((now - lastAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}
