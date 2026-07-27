"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlarmClock, CalendarClock, UserPlus, Activity, CheckCheck } from "lucide-react";
import { useTaskStore } from "@/lib/taskStore";
import { useAuthStore } from "@/lib/authStore";
import { isOverdue, isDueToday } from "@/lib/taskTypes";
import type { Task } from "@/lib/taskTypes";

const SEEN_KEY = "taskopad:notifSeen";
const RECENT_DAYS = 7;

type NotifKind = "overdue" | "due" | "assigned" | "activity";

interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  detail: string;
  at: string; // ISO timestamp used for sorting + unread
  taskId: string;
}

const KIND_META: Record<NotifKind, { icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  overdue: { icon: AlarmClock, tone: "bg-rose-50 text-rose-600" },
  due: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  assigned: { icon: UserPlus, tone: "bg-cyan-50 text-brand-accent" },
  activity: { icon: Activity, tone: "bg-violet-50 text-violet-600" },
};

/** Days-ago cutoff as an ISO date-time string. */
function recentCutoff(): number {
  return Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function ms(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function relative(iso: string): string {
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

/** Build the notification feed for the signed-in user out of their tasks. */
function buildNotifs(tasks: Task[], myId: string): Notif[] {
  if (!myId) return [];
  const out: Notif[] = [];
  const cutoff = recentCutoff();

  for (const t of tasks) {
    if (t.isDraft) continue;
    const mine = t.assigneeId === myId;
    const following = t.followerIds.includes(myId);
    if (!mine && !following) continue;

    if (isOverdue(t)) {
      out.push({
        id: `overdue-${t.id}`,
        kind: "overdue",
        title: t.title,
        detail: `Overdue — was due ${t.dueDate}`,
        at: t.dueDate,
        taskId: t.id,
      });
    } else if (isDueToday(t)) {
      out.push({
        id: `due-${t.id}`,
        kind: "due",
        title: t.title,
        detail: "Due today",
        at: t.dueDate,
        taskId: t.id,
      });
    }

    if (mine && ms(t.createdAt) >= cutoff) {
      out.push({
        id: `assigned-${t.id}`,
        kind: "assigned",
        title: t.title,
        detail: "Assigned to you",
        at: t.createdAt,
        taskId: t.id,
      });
    }

    // Recent activity from someone else on a task I own or follow.
    for (const a of t.activity) {
      if (a.userId === myId) continue;
      if (ms(a.at) < cutoff) continue;
      out.push({
        id: `activity-${t.id}-${a.id}`,
        kind: "activity",
        title: t.title,
        detail: a.text,
        at: a.at,
        taskId: t.id,
      });
    }
  }

  return out.sort((x, y) => ms(y.at) - ms(x.at)).slice(0, 25);
}

/** A lightweight in-app notification bell for Taskopad, derived from the current user's tasks. */
export function NotificationBell() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const load = useTaskStore((s) => s.load);
  const myId = useAuthStore((s) => (s.user ? String(s.user.id) : ""));

  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(SEEN_KEY) : null;
    setLastSeen(raw ? Number(raw) || 0 : 0);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const notifs = useMemo(() => buildNotifs(tasks, myId), [tasks, myId]);
  const unread = useMemo(() => notifs.filter((n) => ms(n.at) > lastSeen).length, [notifs, lastSeen]);

  function markAllRead() {
    const now = Date.now();
    setLastSeen(now);
    if (typeof window !== "undefined") window.localStorage.setItem(SEEN_KEY, String(now));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

  function openTask(taskId: string) {
    setOpen(false);
    router.push(`/taskopad/tasks?task=${taskId}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg animate-fade-in">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {notifs.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-brand-accent"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                  <Bell size={20} />
                </div>
                <p className="text-sm font-medium text-gray-500">You're all caught up</p>
                <p className="mt-0.5 text-xs text-gray-400">Task updates and reminders show up here.</p>
              </div>
            ) : (
              notifs.map((n) => {
                const Meta = KIND_META[n.kind];
                const Icon = Meta.icon;
                const isUnread = ms(n.at) > lastSeen;
                return (
                  <button
                    key={n.id}
                    onClick={() => openTask(n.taskId)}
                    className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 ${
                      isUnread ? "bg-cyan-50/40" : ""
                    }`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${Meta.tone}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-800">{n.title}</span>
                      <span className="block truncate text-xs text-gray-500">{n.detail}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">{relative(n.at)}</span>
                    </span>
                    {isUnread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
