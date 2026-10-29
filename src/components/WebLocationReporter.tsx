"use client";

import { useEffect } from "react";
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

const CONFIG_EVERY_MS = 5 * 60_000;

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
 * Limits, stated plainly: a browser can only read the location while the page is open (no
 * background tracking), so a full day's route still needs the mobile app.
 */
export function WebLocationReporter() {
  const userId = useAuthStore((s) => s.user?.id);
  const canPayroll = useAuthStore((s) => (s.user?.permissions ?? []).some((p) => p === "PAYROLL:VIEW"));

  useEffect(() => {
    if (!userId || !canPayroll) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return; // phones and tablets only

    let stopped = false;
    let watchId: number | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let buffer: Ping[] = [];
    let lastSent: { lat: number; lng: number; at: number } | null = null;
    let cfg: LocationConfig | null = null;
    let battery: number | null = null;

    type BatteryNav = Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (t: string, f: () => void) => void }> };
    (navigator as BatteryNav).getBattery?.()
      .then((b) => {
        battery = Math.round(b.level * 100);
        b.addEventListener("levelchange", () => { battery = Math.round(b.level * 100); });
      })
      .catch(() => {});

    const status = (state: string) =>
      apiRequest("/api/v1/payroll/attendance/location/status", { method: "POST", body: { state, at: Date.now() } }).catch(() => {});

    async function flush() {
      if (!buffer.length) return;
      const points = buffer;
      buffer = [];
      try {
        const res = await apiRequest<{ accepted: number; trackingEnabled: boolean }>("/api/v1/payroll/attendance/location", {
          method: "POST",
          body: { points },
        });
        if (!res.trackingEnabled) stopWatch();
      } catch {
        buffer = [...points, ...buffer].slice(-200); // offline: keep them for the next try
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
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Thin the stream the way the app does: a reading per interval, or sooner after a real move.
          if (lastSent) {
            const moved = metres(lastSent, p);
            if (now - lastSent.at < everyMs && moved < Math.max(25, c.distanceFilterM || 0)) return;
          }
          lastSent = { ...p, at: now };
          buffer.push({ ...p, accuracy: pos.coords.accuracy ?? null, battery, recordedAt: now });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            void status("PERMISSION_DENIED");
            stopWatch();
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            void status("LOCATION_OFF");
          }
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
      );
      flushTimer = setInterval(() => void flush(), everyMs);
      void status("TRACKING");
    }

    async function refresh() {
      if (stopped) return;
      try {
        cfg = await apiRequest<LocationConfig>("/api/v1/payroll/attendance/location-config");
      } catch {
        return;
      }
      if (cfg.enabled) startWatch(cfg);
      else {
        await flush();
        stopWatch();
      }
    }

    void refresh();
    const cfgTimer = setInterval(() => void refresh(), CONFIG_EVERY_MS);
    // A punch-in on this page should start tracking without waiting five minutes.
    const onPunch = () => void refresh();
    window.addEventListener("hitech:punch", onPunch);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      stopped = true;
      clearInterval(cfgTimer);
      window.removeEventListener("hitech:punch", onPunch);
      document.removeEventListener("visibilitychange", onHide);
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
