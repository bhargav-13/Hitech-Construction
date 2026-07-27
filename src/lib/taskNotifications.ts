"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useTaskStore } from "@/lib/taskStore";
import { useAuthStore } from "@/lib/authStore";
import { isOverdue, isDueToday } from "@/lib/taskTypes";
import type { Task } from "@/lib/taskTypes";

const SEEN_KEY = "taskopad:notifSeen";
const RECENT_DAYS = 7;

export type NotifKind = "overdue" | "due" | "assigned" | "activity";

export interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  detail: string;
  at: string; // ISO timestamp used for sorting + unread
  taskId: string;
}

// Shared "last seen" timestamp so the header bell, module bell, and sidebar badge all agree on
// what's unread. Persisted to localStorage; marking read anywhere updates every consumer at once.
interface SeenState {
  lastSeen: number;
  markAllRead: () => void;
}

function initialSeen(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  return raw ? Number(raw) || 0 : 0;
}

export const useNotifSeen = create<SeenState>((set) => ({
  lastSeen: initialSeen(),
  markAllRead: () => {
    const now = Date.now();
    if (typeof window !== "undefined") window.localStorage.setItem(SEEN_KEY, String(now));
    set({ lastSeen: now });
  },
}));

export function ms(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - ms(iso);
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Build the notification feed for a user out of their tasks. */
function buildNotifs(tasks: Task[], myId: string): Notif[] {
  if (!myId) return [];
  const out: Notif[] = [];
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

  for (const t of tasks) {
    if (t.isDraft) continue;
    const mine = t.assigneeId === myId;
    const following = t.followerIds.includes(myId);
    if (!mine && !following) continue;

    if (isOverdue(t)) {
      out.push({ id: `overdue-${t.id}`, kind: "overdue", title: t.title, detail: `Overdue — was due ${t.dueDate}`, at: t.dueDate, taskId: t.id });
    } else if (isDueToday(t)) {
      out.push({ id: `due-${t.id}`, kind: "due", title: t.title, detail: "Due today", at: t.dueDate, taskId: t.id });
    }

    if (mine && ms(t.createdAt) >= cutoff) {
      out.push({ id: `assigned-${t.id}`, kind: "assigned", title: t.title, detail: "Assigned to you", at: t.createdAt, taskId: t.id });
    }

    for (const a of t.activity) {
      if (a.userId === myId) continue;
      if (ms(a.at) < cutoff) continue;
      out.push({ id: `activity-${t.id}-${a.id}`, kind: "activity", title: t.title, detail: a.text, at: a.at, taskId: t.id });
    }
  }

  return out.sort((x, y) => ms(y.at) - ms(x.at)).slice(0, 25);
}

/**
 * Task-derived notifications for the signed-in user, plus the unread count against the shared
 * "last seen" marker. Loads the task store on first use so the header bell/sidebar badge work
 * even before the Taskopad module is opened.
 */
export function useTaskNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const myId = useAuthStore((s) => (s.user ? String(s.user.id) : ""));
  const lastSeen = useNotifSeen((s) => s.lastSeen);
  const markAllRead = useNotifSeen((s) => s.markAllRead);

  useEffect(() => {
    if (myId) load();
  }, [load, myId]);

  const notifs = useMemo(() => buildNotifs(tasks, myId), [tasks, myId]);
  const unread = useMemo(() => notifs.filter((n) => ms(n.at) > lastSeen).length, [notifs, lastSeen]);

  return { notifs, unread, lastSeen, markAllRead };
}
