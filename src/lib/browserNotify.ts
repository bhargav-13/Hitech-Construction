"use client";

import { useEffect, useState } from "react";
import type { NotificationDto } from "./tasksApi";

/**
 * Desktop (browser) notifications — the Chrome / Edge pop-ups — mirroring the in-app bell.
 *
 * The bell already polls the server every 30 s on every page (lib/notifications.ts). Each poll hands
 * its list to {@link announceNew}, which pops a desktop notification for anything that arrived since
 * the last one we announced. Works while any ERP tab is open; a fully closed browser would need Web
 * Push (service worker + push server), which is a separate step.
 *
 * Rules:
 *  - only after the person allowed it (browsers require a click to ask — see {@link requestBrowserNotify});
 *  - only when this tab isn't being looked at — on screen, the in-app bell already shows it;
 *  - never twice: the last announced id is kept per user in localStorage (shared by every open tab),
 *    and each pop-up is tagged with the notification id so the browser itself de-duplicates;
 *  - the first poll after loading only sets the mark — no flood of old items on every page load.
 */

const PREF_KEY = "hitech.browserNotify.v1"; // "on" | "off"
const lastKey = (userId: number) => `hitech.browserNotify.last.${userId}`;
/** Fired when a desktop notification is clicked; the bell routes to its link. */
export const OPEN_EVENT = "hitech:open-notification";

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — dedupe falls back to the notification tag */
  }
}

export function browserNotifyState(): NotifyState {
  if (!supported()) return "unsupported";
  return Notification.permission as NotifyState;
}

/** On = the browser allowed it and the person hasn't switched it off here. */
export function browserNotifyEnabled(): boolean {
  return browserNotifyState() === "granted" && read(PREF_KEY) !== "off";
}

/** Ask the browser (must run from a click). Resolves to the resulting state. */
export async function requestBrowserNotify(): Promise<NotifyState> {
  if (!supported()) return "unsupported";
  const result = await Notification.requestPermission();
  if (result === "granted") write(PREF_KEY, "on");
  window.dispatchEvent(new Event("hitech:notify-pref"));
  return result as NotifyState;
}

export function setBrowserNotifyOn(on: boolean) {
  write(PREF_KEY, on ? "on" : "off");
  window.dispatchEvent(new Event("hitech:notify-pref"));
}

/** React view of the permission + preference, kept current. */
export function useBrowserNotify() {
  const [state, setState] = useState<NotifyState>("unsupported");
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => {
      setState(browserNotifyState());
      setOn(browserNotifyEnabled());
    };
    sync();
    window.addEventListener("hitech:notify-pref", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("hitech:notify-pref", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return { state, on };
}

/** Called with every poll result. Pops desktop notifications for anything new. */
export function announceNew(userId: number, items: NotificationDto[]) {
  if (!supported()) return;
  const maxId = items.reduce((m, n) => Math.max(m, n.id), 0);
  const stored = read(lastKey(userId));
  if (stored == null) {
    // First time on this browser: start from here rather than replaying history.
    write(lastKey(userId), String(maxId));
    return;
  }
  const last = Number(stored) || 0;
  const fresh = items.filter((n) => n.id > last && !n.read).sort((a, b) => a.id - b.id);
  if (maxId > last) write(lastKey(userId), String(maxId));
  if (!fresh.length || !browserNotifyEnabled()) return;
  // Looking at the ERP right now: the bell has it already.
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const show = (title: string, body: string, tag: string, link: string | null, id: number | null) => {
    try {
      const n = new Notification(title, { body, tag, icon: "/logo.png", badge: "/logo.png" });
      n.onclick = () => {
        window.focus();
        window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id, link } }));
        n.close();
      };
    } catch {
      /* some browsers only allow notifications from a service worker — skip quietly */
    }
  };

  if (fresh.length > 3) {
    show(`${fresh.length} new notifications`, fresh.slice(-3).map((n) => n.title).join("\n"), "hitech-summary", "/taskopad", null);
    return;
  }
  for (const n of fresh) show(n.title, n.body ?? "", `hitech-${n.id}`, n.link, n.id);
}
