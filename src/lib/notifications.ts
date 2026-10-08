"use client";

import { useEffect } from "react";
import { create } from "zustand";
import * as tasksApi from "./tasksApi";
import { useAuthStore } from "./authStore";
import { announceNew } from "./browserNotify";

// Server-side notifications (project-service `notifications` table). The server writes them when
// something happens — assigned, commented, status changed, reminder due, due today, overdue — so a
// reminder set for 10:00 arrives at 10:00 whether or not anyone had Taskopad open. This replaced a
// feed the browser used to rebuild out of the task list, which could never do that.

const POLL_MS = 30_000;

interface NotificationState {
  items: tasksApi.NotificationDto[];
  unread: number;
  loaded: boolean;
  ownerId: number | null;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,
  ownerId: null,

  refresh: async () => {
    const me = useAuthStore.getState().user?.id ?? null;
    if (me == null) return;
    try {
      const [items, count] = await Promise.all([tasksApi.getNotifications(40), tasksApi.getUnreadNotificationCount()]);
      if ((useAuthStore.getState().user?.id ?? null) !== me) return; // switched user mid-flight
      set({ items, unread: count.count, loaded: true, ownerId: me });
      // Mirror anything new as a desktop (Chrome / Edge) notification — see browserNotify.
      announceNew(me, items);
    } catch {
      // A bell that can't reach the server just stays as it was; the next poll will try again.
      set({ loaded: true });
    }
  },

  markRead: async (id) => {
    const target = get().items.find((n) => n.id === id);
    if (!target || target.read) return;
    set({
      items: get().items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unread: Math.max(0, get().unread - 1),
    });
    try {
      await tasksApi.markNotificationRead(id);
    } catch {
      void get().refresh();
    }
  },

  markAllRead: async () => {
    set({ items: get().items.map((n) => ({ ...n, read: true })), unread: 0 });
    try {
      await tasksApi.markAllNotificationsRead();
    } catch {
      void get().refresh();
    }
  },
}));

// One poller for the whole tab, however many bells and badges are mounted.
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function onVisible() {
  if (document.visibilityState === "visible") void useNotificationStore.getState().refresh();
}

/** Subscribe to the notification feed. Starts polling while at least one consumer is mounted. */
export function useNotifications() {
  const items = useNotificationStore((s) => s.items);
  const unread = useNotificationStore((s) => s.unread);
  const loaded = useNotificationStore((s) => s.loaded);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const refresh = useNotificationStore((s) => s.refresh);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (userId == null) return;
    subscribers += 1;
    if (subscribers === 1) {
      void useNotificationStore.getState().refresh();
      timer = setInterval(() => void useNotificationStore.getState().refresh(), POLL_MS);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [userId]);

  return { items, unread, loaded, markRead, markAllRead, refresh };
}

// A different person signing in must not see the last person's bell.
useAuthStore.subscribe((state, prev) => {
  if ((state.user?.id ?? null) !== (prev.user?.id ?? null)) {
    useNotificationStore.setState({ items: [], unread: 0, loaded: false, ownerId: null });
  }
});
