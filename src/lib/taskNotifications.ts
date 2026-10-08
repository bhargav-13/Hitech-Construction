"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { useAuthStore } from "@/lib/authStore";
import { formatDateIST, msIST } from "@/lib/datetime";
import type { Task } from "@/lib/taskTypes";

// The notification feed itself now lives on the server (lib/notifications.ts). What stays here is
// the per-task "new comments / files since you last opened it" badge on list rows, and the shared
// time helpers.

const TASK_SEEN_KEY = "taskopad:taskSeen";
const RECENT_DAYS = 7;

// Backend timestamps carry no timezone, so a plain `new Date(iso)` read them in the runtime's own
// zone — which made a comment posted seconds ago come back as "5h ago" and threw off the unread
// counts that compare these against `Date.now()`. `msIST` resolves them as IST.
export function ms(iso: string): number {
  return msIST(iso);
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
  return formatDateIST(iso);
}

// ---- Per-task "seen" markers for the in-list unread badge ----
interface TaskSeenState {
  seenAt: Record<string, number>;
  markTaskSeen: (taskId: string) => void;
}

function initialTaskSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TASK_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export const useTaskSeen = create<TaskSeenState>((set, get) => ({
  seenAt: initialTaskSeen(),
  markTaskSeen: (taskId) => {
    const next = { ...get().seenAt, [taskId]: Date.now() };
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(TASK_SEEN_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep the in-memory marker */
    }
    set({ seenAt: next });
  },
}));

/** Unread comments/attachments on a task, as a plain function — used by the "Unread Tasks" view. */
export function unreadOn(task: Task, myId: string, seenAt: number): number {
  if (!myId) return 0;
  const since = seenAt > 0 ? seenAt : Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  return (
    task.comments.filter((c) => c.userId !== myId && ms(c.at) > since).length +
    task.attachments.filter((a) => a.userId !== myId && ms(a.at) > since).length
  );
}

/** Count of comments + attachments on this task newer than the caller's last visit, ignoring items the caller authored. */
export function useTaskUnread(task: Task): { comments: number; attachments: number; total: number } {
  const myId = useAuthStore((s) => (s.user ? String(s.user.id) : ""));
  const rawSeen = useTaskSeen((s) => s.seenAt[task.id] ?? 0);
  return useMemo(() => {
    if (!myId) return { comments: 0, attachments: 0, total: 0 };
    // Never-visited tasks: only surface activity from the recent window, otherwise every task with
    // any historic chatter would light up on first login.
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const since = rawSeen > 0 ? rawSeen : cutoff;
    const comments = task.comments.filter((c) => c.userId !== myId && ms(c.at) > since).length;
    const attachments = task.attachments.filter((a) => a.userId !== myId && ms(a.at) > since).length;
    return { comments, attachments, total: comments + attachments };
  }, [task.comments, task.attachments, myId, rawSeen]);
}
