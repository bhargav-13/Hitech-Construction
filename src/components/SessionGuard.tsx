"use client";

import { useEffect } from "react";
import { getSessionUser, SESSION_USER_KEY } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";

/**
 * Keeps a page from showing one person's data after the browser has moved on to another.
 *
 * Every store (tasks, users, projects, approvals, notifications…) is filled in memory for whoever
 * the page loaded as. Signing out reloads the tab it happens in, but two cases slipped past that:
 *  - another tab still open as the previous person kept their data on screen — and started
 *    sending the new person's token, mixing the two;
 *  - the Back button after a re-login restored the previous person's page from the browser's
 *    back/forward cache, memory and all.
 * The signed-in user id is written beside the tokens; whenever this page's user stops matching
 * it (another tab signed in/out, a cached page was restored, the tab regained focus) the page is
 * thrown away and loaded fresh.
 */
export function SessionGuard() {
  useEffect(() => {
    const check = () => {
      const { hydrated, user } = useAuthStore.getState();
      if (!hydrated) return; // still working out who this page is for
      const stored = getSessionUser();
      const mine = user ? String(user.id) : null;
      if (stored === mine) return;
      if (stored == null) window.location.replace("/login");
      else window.location.reload();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_USER_KEY || e.key === null) check();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
