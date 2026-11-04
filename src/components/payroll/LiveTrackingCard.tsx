"use client";

import { Navigation, NavigationOff, Loader2, RefreshCw } from "lucide-react";
import { useWebTracking, type WebTrackingState } from "@/components/WebLocationReporter";

const COPY: Partial<Record<WebTrackingState, { tone: "green" | "amber" | "red" | "grey"; title: string; body: string; action?: string }>> = {
  starting: { tone: "grey", title: "Finding your location…", body: "Allow location if your phone asks. Keep GPS on." },
  sharing: { tone: "green", title: "Live location is being shared", body: "Keep this page open in the browser while you work — it stops when the page is closed." },
  denied: {
    tone: "red",
    title: "Location is blocked for this site",
    body: "Tap the lock / ⓘ icon next to the address bar → Permissions → Location → Allow. Then tap Try again.",
    action: "Try again",
  },
  unavailable: {
    tone: "amber",
    title: "No GPS signal yet",
    body: "Turn on Location (GPS) in your phone's quick settings, set it to high accuracy, and step near a window or outdoors.",
    action: "Try again",
  },
  offline: { tone: "amber", title: "Saved offline", body: "Your locations will be sent when the internet is back.", action: "Send now" },
};

const TONE = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  grey: "border-gray-200 bg-gray-50 text-gray-700",
};

/**
 * Live Map status for the person on their own phone (KAN-73). Shown only while tracking applies
 * to them (admin set Yes and they are inside the window) — otherwise there is nothing to say.
 */
export function LiveTrackingCard() {
  const { state, lastSentAt, accuracy, retry } = useWebTracking();
  const c = COPY[state];
  if (!c) return null;
  const Icon = state === "starting" ? Loader2 : state === "sharing" ? Navigation : NavigationOff;
  return (
    <div className={`rounded-xl border p-3.5 ${TONE[c.tone]}`} role="status">
      <div className="flex items-start gap-2.5">
        <Icon size={18} className={`mt-0.5 shrink-0 ${state === "starting" ? "animate-spin" : ""}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{c.title}</div>
          <p className="mt-0.5 text-xs opacity-90">{c.body}</p>
          {state === "sharing" && lastSentAt && (
            <p className="mt-1 text-[11px] opacity-75">
              Last sent {new Date(lastSentAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              {accuracy != null && ` · ± ${Math.round(accuracy)} m`}
            </p>
          )}
          {c.action && (
            <button
              onClick={retry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold ring-1 ring-current/20 transition-all hover:bg-white active:scale-95"
            >
              <RefreshCw size={12} /> {c.action}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
