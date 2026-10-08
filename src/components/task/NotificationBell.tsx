"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlarmClock,
  CalendarClock,
  UserPlus,
  MessageCircle,
  RefreshCw,
  BellRing,
  ShieldCheck,
  CheckCheck,
} from "lucide-react";
import { useNotifications } from "@/lib/notifications";
import { relativeTime } from "@/lib/taskNotifications";
import { OPEN_EVENT, requestBrowserNotify, setBrowserNotifyOn, useBrowserNotify } from "@/lib/browserNotify";

const KIND_META: Record<string, { icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  OVERDUE: { icon: AlarmClock, tone: "bg-rose-50 text-rose-600" },
  DUE_TODAY: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  REMINDER: { icon: BellRing, tone: "bg-orange-50 text-orange-600" },
  ASSIGNED: { icon: UserPlus, tone: "bg-cyan-50 text-brand-accent" },
  COMMENT: { icon: MessageCircle, tone: "bg-violet-50 text-violet-600" },
  STATUS: { icon: RefreshCw, tone: "bg-sky-50 text-sky-600" },
  APPROVAL: { icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600" },
};
const FALLBACK = { icon: Bell, tone: "bg-gray-100 text-gray-500" };

/**
 * The one notification bell, in the global header. Reads the server's notifications for the signed-in
 * person (assigned, comments, status changes, reminders, due today, overdue, approvals) and polls for
 * new ones. Taskopad used to carry a second bell of its own; it was the same feed twice.
 */
export function NotificationBell() {
  const router = useRouter();
  const { items, unread, markRead, markAllRead } = useNotifications();
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

  function openItem(id: number, link: string | null) {
    void markRead(id);
    setOpen(false);
    if (link) router.push(link);
  }

  // A desktop (Chrome / Edge) notification was clicked: open what it is about.
  const desktop = useBrowserNotify();
  useEffect(() => {
    const onOpen = (e: Event) => {
      const { id, link } = (e as CustomEvent<{ id: number | null; link: string | null }>).detail ?? {};
      if (id != null) void markRead(id);
      router.push(link || "/taskopad");
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [markRead, router]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 z-40 mt-2 w-96 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-800">
              Notifications{unread > 0 && <span className="ml-1.5 text-xs font-medium text-gray-400">{unread} unread</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-brand-accent"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          {/* Desktop notifications — the pop-ups Chrome / Edge show even when this tab isn't open. */}
          {desktop.state !== "unsupported" && (
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] text-gray-500">
              {desktop.state === "denied" ? (
                <span>Desktop alerts are blocked — allow notifications for this site in the browser&apos;s settings.</span>
              ) : desktop.on ? (
                <>
                  <span className="flex items-center gap-1.5"><BellRing size={12} className="text-emerald-600" /> Desktop alerts are on</span>
                  <button onClick={() => setBrowserNotifyOn(false)} className="font-medium hover:text-gray-700">Turn off</button>
                </>
              ) : (
                <>
                  <span>Get desktop alerts for tasks, even when this tab isn&apos;t open.</span>
                  <button
                    onClick={() => (desktop.state === "granted" ? setBrowserNotifyOn(true) : void requestBrowserNotify())}
                    className="shrink-0 rounded-md bg-brand-accent px-2 py-1 font-medium text-white hover:opacity-90"
                  >
                    Turn on
                  </button>
                </>
              )}
            </div>
          )}

          <div className="max-h-[28rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                  <Bell size={20} />
                </div>
                <p className="text-sm font-medium text-gray-500">You&apos;re all caught up</p>
                <p className="mt-0.5 text-xs text-gray-400">Task updates and reminders show up here.</p>
              </div>
            ) : (
              items.map((n) => {
                const meta = KIND_META[n.kind] ?? FALLBACK;
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n.id, n.link)}
                    className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 ${
                      n.read ? "" : "bg-cyan-50/40"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-800">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-xs text-gray-500">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-gray-400">{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-accent" />}
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
