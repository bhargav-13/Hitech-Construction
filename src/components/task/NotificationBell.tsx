"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlarmClock, CalendarClock, UserPlus, Activity, CheckCheck } from "lucide-react";
import { useTaskNotifications, relativeTime, ms, type NotifKind } from "@/lib/taskNotifications";

const KIND_META: Record<NotifKind, { icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  overdue: { icon: AlarmClock, tone: "bg-rose-50 text-rose-600" },
  due: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  assigned: { icon: UserPlus, tone: "bg-cyan-50 text-brand-accent" },
  activity: { icon: Activity, tone: "bg-violet-50 text-violet-600" },
};

/**
 * In-app notification bell derived from the signed-in user's tasks. Used both in the global header
 * (`variant="header"`) and inside the Taskopad module (`variant="module"`). All instances share the
 * same feed + unread marker via `useTaskNotifications`, so reading in one place clears the rest.
 */
export function NotificationBell({ variant = "module" }: { variant?: "module" | "header" }) {
  const router = useRouter();
  const { notifs, unread, lastSeen, markAllRead } = useTaskNotifications();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

  function openTask(taskId: string) {
    setOpen(false);
    router.push(`/taskopad/tasks?task=${taskId}`);
  }

  const triggerCls =
    variant === "header"
      ? "relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
      : "relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-brand-accent";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label="Notifications" className={triggerCls}>
        <Bell size={variant === "header" ? 20 : 17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg animate-fade-in">
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
                <p className="text-sm font-medium text-gray-500">You&apos;re all caught up</p>
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
                      <span className="mt-0.5 block text-[11px] text-gray-400">{relativeTime(n.at)}</span>
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
