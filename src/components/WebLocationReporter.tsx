"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";

/** What GET /attendance/location-config says — the same answer the mobile app reads. */
interface LocationConfig {
  enabled: boolean;
  trackingAllowed: boolean;
  mode: string;
  intervalSec: number;
  distanceFilterM: number;
  maxHours: number;
  punchedIn: boolean;
}

type Ping = { lat: number; lng: number; accuracy: number | null; battery: number | null; recordedAt: number };

/**
 * Where browser tracking stands for the signed-in person, so the Punch screen can say it plainly
 * instead of tracking silently failing (KAN-73).
 */
export type WebTrackingState =
  | "idle" // not checked yet
  | "unsupported" // desktop, or a browser with no geolocation
  | "not-allowed" // admin set tracking to No for this person
  | "waiting" // allowed, but outside the window (not punched in, in PUNCH mode)
  | "starting" // asking the phone for a position
  | "sharing" // positions are reaching the server
  | "denied" // the person (or the browser) blocked location for this site
  | "unavailable" // GPS off / no fix
  | "offline"; // readings taken but the server couldn't be reached

interface TrackingStore {
  state: WebTrackingState;
  lastSentAt: number | null;
  accuracy: number | null;
  /** Re-ask now — a tap gives the browser a user gesture, which some phones need to prompt. */
  retry: () => void;
  set: (p: Partial<Omit<TrackingStore, "set" | "retry">>) => void;
}

export const useWebTracking = create<TrackingStore>((set) => ({
  state: "idle",
  lastSentAt: null,
  accuracy: null,
  retry: () => window.dispatchEvent(new Event("hitech:punch")),
  set: (p) => set(p),
}));

const CONFIG_EVERY_MS = 2 * 60_000;

/** Phones and tablets. A touch laptop also reports a fine pointer, so it stays out. */
function isPhone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Live tracking from the browser (KAN-73: "location is on but tracking is not done").
 *
 * The Live Map is fed by the Hitech mobile app posting the phone's position. Someone who uses the
 * ERP in their phone's browser — or a build of the app that doesn't send positions yet — never
 * appears on it. This posts the same readings to the same endpoint while the site is open on a
 * phone, following the same rules the app does: only when the admin set tracking to Yes for this
 * person and they are inside the tracking window (punched in, in PUNCH mode). It stops the moment
 * the server says so. Desktops are left alone — an office PC's position isn't anyone's location.
 *
 * The first fix is sent at once (it used to wait a full interval, so a quick look at the site
 * never put anyone on the map), and every outcome lands in {@link useWebTracking} so the Punch
 * screen can show it, and in /location/status so the admin's map says why someone is missing.
 *
 * Limits, stated plainly: a browser can only read the location while the page is open (no
 * background tracking), so a full day's route still needs the mobile app.
 */
export function WebLocationReporter() {
  const userId = useAuthStore((s) => s.user?.id);
  const canPayroll = useAuthStore((s) => (s.user?.permissions ?? []).some((p) => p === "PAYROLL:VIEW"));

  useEffect(() => {
    const store = useWebTracking.getState();
    if (!userId || !canPayroll) return;
    if (typeof window === "undefined" || !navigator.geolocation || !isPhone()) {
      store.set({ state: "unsupported" });
      return;
    }

    let stopped = false;
    let watchId: number | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let buffer: Ping[] = [];
    let lastTaken: { lat: number; lng: number; at: number } | null = null;
    let sentAny = false;
    let reported: string | null = null;
    let battery: number | null = null;

    type BatteryNav = Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (t: string, f: () => void) => void }> };
    (navigator as BatteryNav).getBattery?.()
      .then((b) => {
        battery = Math.round(b.level * 100);
        b.addEventListener("levelchange", () => { battery = Math.round(b.level * 100); });
      })
      .catch(() => {});

    /** Tell the server once per change, not on every reading. */
    const status = (state: string) => {
      if (reported === state) return;
      reported = state;
      apiRequest("/api/v1/payroll/attendance/location/status", { method: "POST", body: { state, at: Date.now() } }).catch(() => {
        reported = null;
      });
    };

    async function flush() {
      if (!buffer.length) return;
      const points = buffer;
      buffer = [];
      try {
        const res = await apiRequest<{ accepted: number; trackingEnabled: boolean }>("/api/v1/payroll/attendance/location", {
          method: "POST",
          body: { points },
        });
        sentAny = true;
        reported = "TRACKING"; // a position marks the tracker as running on the server
        useWebTracking.getState().set({ state: "sharing", lastSentAt: Date.now() });
        if (!res.trackingEnabled) {
          stopWatch();
          void refresh();
        }
      } catch {
        buffer = [...points, ...buffer].slice(-200); // offline: keep them for the next try
        useWebTracking.getState().set({ state: "offline" });
      }
    }

    function stopWatch() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = null;
    }

    function startWatch(c: LocationConfig) {
      if (watchId != null) return;
      const everyMs = Math.max(30, c.intervalSec || 60) * 1000;
      if (!sentAny) useWebTracking.getState().set({ state: "starting" });
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          useWebTracking.getState().set({ accuracy: pos.coords.accuracy ?? null });
          // Thin the stream the way the app does: a reading per interval, or sooner after a real move.
          if (lastTaken) {
            const moved = metres(lastTaken, p);
            if (now - lastTaken.at < everyMs && moved < Math.max(25, c.distanceFilterM || 0)) return;
          }
          const first = !lastTaken;
          lastTaken = { ...p, at: now };
          buffer.push({ ...p, accuracy: pos.coords.accuracy ?? null, battery, recordedAt: now });
          if (first) void flush(); // on the map straight away, not one interval later
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            status("PERMISSION_DENIED");
            useWebTracking.getState().set({ state: "denied" });
            stopWatch();
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            status("LOCATION_OFF");
            useWebTracking.getState().set({ state: "unavailable" });
          } else if (!sentAny) {
            // TIMEOUT before any fix: usually GPS off or indoors. Keep watching.
            useWebTracking.getState().set({ state: "unavailable" });
          }
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
      );
      flushTimer = setInterval(() => void flush(), everyMs);
    }

    async function refresh() {
      if (stopped) return;
      let cfg: LocationConfig;
      try {
        cfg = await apiRequest<LocationConfig>("/api/v1/payroll/attendance/location-config");
      } catch {
        return;
      }
      if (stopped) return;
      if (cfg.enabled) {
        // A tap on "Share location" after a denial: start over so the browser asks again.
        if (useWebTracking.getState().state === "denied") stopWatch();
        startWatch(cfg);
        return;
      }
      await flush();
      stopWatch();
      lastTaken = null;
      useWebTracking.getState().set({ state: cfg.trackingAllowed ? "waiting" : "not-allowed" });
      if (sentAny && cfg.trackingAllowed) status("STOPPED");
    }

    void refresh();
    const cfgTimer = setInterval(() => void refresh(), CONFIG_EVERY_MS);
    // A punch-in on this page should start tracking without waiting for the next check.
    const onPunch = () => void refresh();
    window.addEventListener("hitech:punch", onPunch);
    const onVis = () => {
      if (document.visibilityState === "hidden") void flush();
      else void refresh(); // back on the page: re-check at once
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      clearInterval(cfgTimer);
      window.removeEventListener("hitech:punch", onPunch);
      document.removeEventListener("visibilitychange", onVis);
      void flush();
      stopWatch();
    };
  }, [userId, canPayroll]);

  return null;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
