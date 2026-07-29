"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/Spinner";
import { useAuthStore } from "@/lib/authStore";
import { useMyProfile, useTodayAttendance } from "@/lib/usePayrollLive";
import { ApiError, getMyFace, saveMyFace, getMyLocations } from "@/lib/api";
import type { GeoPointApi, LocationApi } from "@/lib/api";
import { isSameFace } from "@/lib/faceApi";
import { FaceCapture, type FaceCaptureResult } from "@/components/payroll/FaceCapture";
import {
  CheckCircle,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  ScanFace,
  XCircle,
} from "lucide-react";

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function hoursWorked(inTime: string | null, outTime: string | null): number {
  if (!inTime || !outTime) return 0;
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  const mins = oh * 60 + om - (ih * 60 + im);
  return mins > 0 ? Math.round((mins / 60) * 10) / 10 : 0;
}

/** GPS fix — resolves to coords if the browser grants them, or null (never throws). */
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/** Ray-casting point-in-polygon — matches the server-side geofence check exactly. */
function isInside(lat: number, lng: number, pts: GeoPointApi[]): boolean {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].lat, xi = pts[i].lng;
    const yj = pts[j].lat, xj = pts[j].lng;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polyCenter(pts: GeoPointApi[]): { lat: number; lng: number } {
  if (!pts.length) return { lat: 0, lng: 0 };
  const s = pts.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: s.lat / pts.length, lng: s.lng / pts.length };
}

/** Haversine distance in metres — for the "you're ~Nm away" hint when a punch falls outside. */
function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Which camera step is open: enrol the reference face, or verify a punch (carrying the GPS fix).
type Modal =
  | { kind: "enroll" }
  | { kind: "punch"; type: "in" | "out"; lat: number | null; lng: number | null };

export default function PunchPage() {
  const user = useAuthStore((s) => s.user);
  // "On payroll" = the member has a real payroll profile. Attendance, face enrolment and the punch
  // itself all hit the backend now — nothing is client-only anymore.
  const { profile, loading: profileLoading } = useMyProfile(user?.id ?? null);
  const { today, punch, refresh: refreshToday } = useTodayAttendance();

  // Enrolled reference face, loaded from the backend so it works on any device the member signs into.
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [facePhoto, setFacePhoto] = useState<string | null>(null);
  const [faceLoading, setFaceLoading] = useState(true);
  // The member's assigned work sites — punch is allowed only inside one of these.
  const [myLocations, setMyLocations] = useState<LocationApi[]>([]);

  const [status, setStatus] = useState<"idle" | "detecting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f, locs] = await Promise.all([getMyFace(), getMyLocations().catch(() => [])]);
        if (!cancelled) {
          setDescriptor(f.enrolled && f.descriptor?.length ? f.descriptor : null);
          setFacePhoto(f.photo);
          setMyLocations(locs);
        }
      } catch {
        if (!cancelled) setDescriptor(null);
      } finally {
        if (!cancelled) setFaceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enrolled = !!descriptor;

  // Step 1 of a punch: require GPS + geofence — only open the camera if the member is standing
  // inside one of their assigned work sites (this mirrors the server-side check).
  async function beginPunch(type: "in" | "out") {
    if (!enrolled) {
      setStatus("error");
      setMessage("Please register your face first, then punch.");
      return;
    }
    if (myLocations.length === 0) {
      setStatus("error");
      setMessage("No work site is assigned to you yet. Ask your admin to assign one in Payroll → Locations.");
      return;
    }
    setStatus("detecting");
    setMessage("Getting your location…");
    const coords = await getCoords();
    if (!coords) {
      setStatus("error");
      setMessage("Couldn't get your location. Please enable GPS / location access and try again.");
      return;
    }
    const site = myLocations.find((loc) => isInside(coords.lat, coords.lng, loc.points));
    if (!site) {
      const nearest = myLocations
        .map((loc) => { const c = polyCenter(loc.points); return { name: loc.name, d: Math.round(metresBetween(coords.lat, coords.lng, c.lat, c.lng)) }; })
        .sort((a, b) => a.d - b.d)[0];
      setStatus("error");
      setMessage(`You're ~${nearest.d}m from ${nearest.name} and outside its boundary. Move onto the site to punch ${type}.`);
      return;
    }
    setStatus("idle");
    setMessage("");
    setModal({ kind: "punch", type, lat: coords.lat, lng: coords.lng });
  }

  // Step 2: the camera returned a selfie + faceprint. Enrol it, or match it against the enrolled one.
  async function onEnrollCaptured(result: FaceCaptureResult) {
    try {
      const saved = await saveMyFace({ descriptor: result.descriptor, photo: result.photo });
      setDescriptor(saved.descriptor?.length ? saved.descriptor : result.descriptor);
      setFacePhoto(saved.photo ?? result.photo);
      setModal(null);
      setStatus("success");
      setMessage("Face registered. You can now punch in.");
    } catch (err) {
      setModal(null);
      setStatus("error");
      setMessage(err instanceof ApiError ? err.message : "Couldn't save your face — please try again.");
    }
  }

  async function onPunchCaptured(result: FaceCaptureResult) {
    if (modal?.kind !== "punch" || !descriptor) return;
    const cmp = isSameFace(descriptor, result.descriptor);
    if (!cmp.match) {
      setModal(null);
      setStatus("error");
      setMessage(`Face didn't match your registered photo (match score ${cmp.distance.toFixed(2)}). Please try again in good light.`);
      return;
    }

    const hadGps = modal.lat != null && modal.lng != null;
    try {
      await punch({
        direction: modal.type === "in" ? "IN" : "OUT",
        lat: modal.lat,
        lng: modal.lng,
        faceScore: Number(cmp.distance.toFixed(3)),
        projectId: null,
        photo: result.photo,
      });
      await refreshToday();
      setModal(null);
      setStatus("success");
      setMessage(`${modal.type === "in" ? "Punched in" : "Punched out"} — face verified${hadGps ? " · location captured" : ""}`);
    } catch (err) {
      setModal(null);
      setStatus("error");
      setMessage(err instanceof ApiError ? err.message : "Unable to record punch — check your connection and try again.");
    }
  }

  const punchedIn = today?.inTime != null;
  const punchedOut = today?.outTime != null;
  const hrs = hoursWorked(today?.inTime ?? null, today?.outTime ?? null);
  const name = user?.fullName ?? user?.email ?? "";

  if (!user) {
    return (
      <AppShell title="Punch">
        <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Please log in first.</div>
      </AppShell>
    );
  }

  if (profileLoading || faceLoading) {
    return (
      <AppShell title="Punch">
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-gray-400">
          <Spinner size={16} className="text-brand-accent" /> Loading…
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Punch">
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
          <MapPinOff size={32} className="text-gray-300" />
          <div className="text-sm font-medium text-gray-600">No payroll profile yet</div>
          <p className="max-w-sm text-xs text-gray-400">
            Your login isn&apos;t set up for payroll yet. Ask HR to complete your payroll profile so you can punch in.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Punch">
      <div className="mx-auto max-w-md space-y-6 py-6">
        {/* Staff info card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-xl font-bold text-white">
            {facePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={facePhoto} alt={name} className="h-full w-full object-cover" />
            ) : (
              name.split(" ").map((w) => w[0]).join("").slice(0, 2)
            )}
          </div>
          <div className="mt-3 text-lg font-semibold text-gray-800">{name}</div>
          <div className="text-sm text-gray-500">{profile.designation ?? "—"}</div>
          <div className="mt-2 text-xs text-gray-400">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Face enrolment — required once before punching */}
        {!enrolled ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ScanFace size={20} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-800">Register your face to punch</div>
                <p className="mt-0.5 text-xs text-amber-700">
                  Take one clear selfie now. Every punch is checked against it, so only you can mark your attendance.
                </p>
                <button
                  onClick={() => { setStatus("idle"); setMessage(""); setModal({ kind: "enroll" }); }}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                >
                  <ScanFace size={15} /> Register My Face
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <ScanFace size={14} /> Face registered — punches are verified
            </span>
            <button
              onClick={() => { setStatus("idle"); setMessage(""); setModal({ kind: "enroll" }); }}
              className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
            >
              Re-register
            </button>
          </div>
        )}

        {/* Today's status */}
        {punchedIn && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Today&apos;s Status</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${punchedOut ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {punchedOut ? "Day Complete" : "Working"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400">In</div>
                <div className="text-sm font-semibold text-gray-800">{formatTime12(today!.inTime!)}</div>
              </div>
              {punchedOut && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Out</div>
                  <div className="text-sm font-semibold text-gray-800">{formatTime12(today!.outTime!)}</div>
                </div>
              )}
              {hrs > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Hours</div>
                  <div className="text-sm font-semibold text-gray-800">{hrs} hrs</div>
                </div>
              )}
            </div>
            {(today?.punchInPhoto || today?.punchOutPhoto) && (
              <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3">
                {today?.punchInPhoto && (
                  <figure className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={today.punchInPhoto} alt="Punch-in selfie" className="h-14 w-14 rounded-lg object-cover ring-1 ring-emerald-200" />
                    <figcaption className="mt-1 text-[9px] text-gray-400">In</figcaption>
                  </figure>
                )}
                {today?.punchOutPhoto && (
                  <figure className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={today.punchOutPhoto} alt="Punch-out selfie" className="h-14 w-14 rounded-lg object-cover ring-1 ring-rose-200" />
                    <figcaption className="mt-1 text-[9px] text-gray-400">Out</figcaption>
                  </figure>
                )}
              </div>
            )}
            {(today?.punchInLat != null || today?.punchOutLat != null) && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
                <MapPin size={10} /> GPS on record
              </div>
            )}
          </div>
        )}

        {/* Punch buttons */}
        <div className="space-y-3">
          {!punchedIn && (
            <button
              onClick={() => beginPunch("in")}
              disabled={status === "detecting" || !enrolled}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-lg font-bold text-white shadow-lg shadow-emerald-200 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-300 active:scale-[0.98] disabled:opacity-60"
            >
              {status === "detecting" ? <Loader2 size={24} className="animate-spin" /> : <LogIn size={24} />}
              {status === "detecting" ? "Detecting Location…" : "Punch In"}
            </button>
          )}
          {punchedIn && !punchedOut && (
            <button
              onClick={() => beginPunch("out")}
              disabled={status === "detecting" || !enrolled}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-6 py-5 text-lg font-bold text-white shadow-lg shadow-rose-200 transition-all duration-200 hover:shadow-xl hover:shadow-rose-300 active:scale-[0.98] disabled:opacity-60"
            >
              {status === "detecting" ? <Loader2 size={24} className="animate-spin" /> : <LogOut size={24} />}
              {status === "detecting" ? "Detecting Location…" : "Punch Out"}
            </button>
          )}
          {punchedOut && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-5 text-gray-400">
              <CheckCircle size={20} /> You have completed your attendance for today.
            </div>
          )}
          {!enrolled && !punchedOut && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
              <Clock size={12} /> Register your face above to enable punching.
            </p>
          )}
        </div>

        {/* Status message */}
        {status !== "idle" && status !== "detecting" && (
          <div className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}>
            {status === "success" ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
            <span>{message}</span>
          </div>
        )}

        {/* My work sites (the geofences this member may punch from) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">My Work Sites</div>
          {myLocations.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <MapPinOff size={12} /> No sites assigned. You can only punch once your admin assigns you a work site.
            </div>
          ) : (
            <div className="space-y-2">
              {myLocations.map((loc) => (
                <div key={loc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-700">{loc.name}</div>
                    {loc.projectName && <div className="truncate text-[11px] text-gray-400">Project · {loc.projectName}</div>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-600"><MapPin size={10} /> Geofenced</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal?.kind === "enroll" && (
        <FaceCapture
          title="Register your face"
          subtitle="Look at the camera and capture one clear selfie."
          actionLabel="Capture & Register"
          onCapture={onEnrollCaptured}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.kind === "punch" && (
        <FaceCapture
          title={`Verify to punch ${modal.type}`}
          subtitle="Capture a selfie to confirm it's you."
          actionLabel={modal.type === "in" ? "Capture & Punch In" : "Capture & Punch Out"}
          onCapture={onPunchCaptured}
          onCancel={() => setModal(null)}
        />
      )}
    </AppShell>
  );
}
