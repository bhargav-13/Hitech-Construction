"use client";

import { useCallback, useEffect, useState } from "react";
import { useTaskStore } from "./taskStore";
import { isUserEditing } from "./editLock";

/** How often Taskopad pulls fresh tasks in the background. */
export const TASK_REFRESH_MS = 3 * 60_000;
/** How often we look whether a refresh is due (cheap — no request unless it is). */
const CHECK_MS = 15_000;

/**
 * Silent background refresh for Taskopad: re-fetches the task list (and the approvals queue) every
 * {@link TASK_REFRESH_MS}, without reloading the page — filters, scroll, selection and the open view
 * all stay as they are.
 *
 * It waits while anybody is mid-edit (an add/edit drawer or popup open, a field focused, a Kanban
 * drag — see editLock) and while the tab is hidden, then catches up as soon as that ends. Drawers
 * edit their own copy of a task, so even a refresh that does land never touches what is typed.
 */
export function useTaskAutoRefresh(withApprovals: boolean) {
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await useTaskStore.getState().load(true);
      if (withApprovals) await useTaskStore.getState().loadApprovals();
    } finally {
      setBusy(false);
    }
  }, [withApprovals]);

  useEffect(() => {
    const due = () => Date.now() - useTaskStore.getState().lastLoadedAt >= TASK_REFRESH_MS;
    const tryRefresh = () => {
      const s = useTaskStore.getState();
      if (!s.loaded || s.loading || document.hidden || !due() || isUserEditing()) return;
      void refresh();
    };
    const timer = window.setInterval(tryRefresh, CHECK_MS);
    document.addEventListener("visibilitychange", tryRefresh);
    window.addEventListener("focus", tryRefresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tryRefresh);
      window.removeEventListener("focus", tryRefresh);
    };
  }, [refresh]);

  return { refresh, busy };
}

/** "just now" / "2 min ago" / "1 hr ago", re-rendered every 30 s. */
export function useAgo(ms: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!ms) return "";
  const mins = Math.floor((now - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}
