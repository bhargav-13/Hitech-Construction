"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PayrollShell, PayrollEmpty } from "@/components/payroll/PayrollShell";
import { Spinner } from "@/components/Spinner";
import { LiveStaffMap } from "@/components/payroll/LiveStaffMap";
import type { LivePerson, LiveRoute, LiveSite, LiveTone } from "@/components/payroll/LiveStaffMap";
import {
  ApiError,
  getLiveLocations,
  getLocationSettings,
  getLocationTrail,
  getLocations,
  getLocationTracking,
  saveLocationSettings,
  setLocationTracking,
  unlinkTrackingDevice,
} from "@/lib/api";
import type { GeoPointApi, LiveLocationApi, LocationSettingsApi, TrackingPersonApi, TrackingState, TrailPointApi } from "@/lib/api";
import { formatDateTimeIST, formatTimeIST, msIST, todayIST } from "@/lib/datetime";
import { useCan } from "@/lib/permissions";
import {
  ArrowLeft, BatteryLow, BatteryMedium, Crosshair, LocateFixed, Map as MapIcon, RefreshCw, Route, Search,
  Settings2, Smartphone, Unlink, Users,
} from "lucide-react";

/** The map re-reads positions this often. Phones report every 1-5 minutes, so faster gains nothing. */
const POLL_MS = 20_000;

// ---- Status: one word per person, shared by the map colours, the list and the filters ----

type StatusKey = "onsite" | "outside" | "stale" | "trackingoff" | "offshift";

interface Status {
  key: StatusKey;
  tone: LiveTone;
  label: string;
  /** A problem with the phone worth showing even when the person is fine otherwise. */
  warning?: string;
}

const STATE_TEXT: Record<TrackingState, string> = {
  TRACKING: "Tracking",
  STOPPED: "Tracker stopped",
  PERMISSION_DENIED: "Location permission denied",
  PERMISSION_FOREGROUND_ONLY: "Tracks only while the app is open",
  LOCATION_OFF: "GPS turned off",
};

const FILTERS: { key: "all" | StatusKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "onsite", label: "On shift" },
  { key: "outside", label: "Outside site" },
  { key: "stale", label: "Not updating" },
  { key: "trackingoff", label: "Tracking off" },
  { key: "offshift", label: "Off shift" },
];

const DOT: Record<LiveTone, string> = {
  green: "bg-emerald-600",
  red: "bg-red-600",
  amber: "bg-amber-600",
  grey: "bg-gray-400",
};

function insideSite(lat: number, lng: number, pts: GeoPointApi[]): boolean {
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].lat, xi = pts[i].lng, yj = pts[j].lat, xj = pts[j].lng;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function siteAt(lat: number, lng: number, sites: LiveSite[]): LiveSite | undefined {
  return sites.find((s) => insideSite(lat, lng, s.points));
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const mins = Math.floor((now - msIST(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatDateTimeIST(iso);
}

function statusOf(r: LiveLocationApi, sites: LiveSite[], now: number): Status {
  const phoneProblem =
    r.trackingState && r.trackingState !== "TRACKING" && r.trackingState !== "STOPPED" ? STATE_TEXT[r.trackingState] : undefined;
  if (!r.trackingEnabled) return { key: "trackingoff", tone: "grey", label: "Tracking set to No" };
  if (r.trackingState === "PERMISSION_DENIED" || r.trackingState === "LOCATION_OFF") {
    return { key: "trackingoff", tone: r.punchedIn ? "amber" : "grey", label: STATE_TEXT[r.trackingState] };
  }
  if (!r.punchedIn) {
    return { key: "offshift", tone: "grey", label: r.outTime ? `Punched out at ${r.outTime}` : "Not punched in", warning: phoneProblem };
  }
  if (r.stale || r.lat == null || r.lng == null) {
    return {
      key: "stale",
      tone: "amber",
      label: r.recordedAt ? `Not updating · last ${ago(r.recordedAt, now)}` : "No location from phone yet",
      warning: phoneProblem,
    };
  }
  if (sites.length > 0) {
    const site = siteAt(r.lat, r.lng, sites);
    if (!site) return { key: "outside", tone: "red", label: "Outside all work sites", warning: phoneProblem };
    return { key: "onsite", tone: "green", label: `At ${site.name}`, warning: phoneProblem };
  }
  return { key: "onsite", tone: "green", label: `On shift since ${r.inTime}`, warning: phoneProblem };
}

// ---- Route replay helpers ----

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Stop {
  lat: number;
  lng: number;
  from: string;
  to: string;
  minutes: number;
  site?: string;
}

/** Places someone stayed: readings within 100 m of where they arrived, for 10 minutes or more. */
function findStops(points: TrailPointApi[], sites: LiveSite[]): Stop[] {
  const out: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length && metres(points[i], points[j + 1]) <= 100) j++;
    const minutes = (msIST(points[j].recordedAt) - msIST(points[i].recordedAt)) / 60_000;
    if (minutes >= 10) {
      const group = points.slice(i, j + 1);
      const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
      const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
      out.push({
        lat, lng, from: points[i].recordedAt, to: points[j].recordedAt,
        minutes: Math.round(minutes), site: siteAt(lat, lng, sites)?.name,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

function duration(mins: number): string {
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

// ---- Page ----

/**
 * Live Map — where staff are right now, from the mobile app's background tracker (backend
 * V91/V92), and who is tracked at all. The Tracking tab is where an admin sets Yes or No per
 * person; nobody is tracked until they do.
 */
export default function LiveMapPage() {
  const can = useCan();
  const canEdit = can("PAYROLL_LIVE_LOCATION:EDIT");
  const [tab, setTab] = useState<"map" | "tracking">("map");

  return (
    <PayrollShell requireAdmin>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Live Staff Map</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Where staff are now, from the Hitech mobile app. Only people set to <b>Yes</b> on the Tracking tab are tracked.
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button onClick={() => setTab("map")} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${tab === "map" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              <MapIcon size={14} /> Map
            </button>
            <button onClick={() => setTab("tracking")} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${tab === "tracking" ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              <Users size={14} /> Tracking
            </button>
          </div>
        </div>
        {tab === "map" ? <MapTab onManage={() => setTab("tracking")} /> : <TrackingTab canEdit={canEdit} />}
      </div>
    </PayrollShell>
  );
}

// ---- Map tab ----

function MapTab({ onManage }: { onManage: () => void }) {
  const [rows, setRows] = useState<LiveLocationApi[]>([]);
  const [sites, setSites] = useState<LiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | StatusKey>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(
    () =>
      getLiveLocations()
        .then((list) => {
          setRows(list);
          setError("");
          setLoadedAt(Date.now());
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load live locations."))
        .finally(() => setLoading(false)),
    [],
  );

  // Poll while the tab is visible; catch up at once when it comes back.
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Site outlines are context, not essential: a role without them still gets the map.
  useEffect(() => {
    getLocations()
      .then((ls) => setSites(ls.map((l) => ({ id: l.id, name: l.name, points: l.points }))))
      .catch(() => setSites([]));
  }, []);

  const withStatus = useMemo(() => rows.map((r) => ({ r, s: statusOf(r, sites, now) })), [rows, sites, now]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: withStatus.length };
    for (const { s } of withStatus) c[s.key] = (c[s.key] ?? 0) + 1;
    return c;
  }, [withStatus]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return withStatus.filter(({ r, s }) => (filter === "all" || s.key === filter) && (!t || r.name.toLowerCase().includes(t)));
  }, [withStatus, filter, q]);

  const selected = withStatus.find((x) => x.r.userId === selectedId) ?? null;
  const [route, setRoute] = useState<LiveRoute | null>(null);

  const markers: LivePerson[] = useMemo(
    () => shown
      .filter(({ r }) => r.lat != null && r.lng != null)
      .map(({ r, s }) => ({
        id: r.userId,
        name: r.name,
        lat: r.lat!,
        lng: r.lng!,
        tone: s.tone,
        detail: `${s.label} · ${ago(r.recordedAt, now)}${r.battery != null ? ` · ${r.battery}%` : ""}`,
      })),
    [shown, now],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-16 text-sm text-gray-400">
        <Spinner size={16} className="text-brand-accent" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {rows.length === 0 ? (
        <PayrollEmpty
          icon={LocateFixed}
          title="Nobody is being tracked yet"
          hint="Set tracking to Yes for the people you want on the map. Their phones start sending their location once they open the Hitech app and allow location access."
          action={<button onClick={onManage} className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Choose who is tracked</button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <LiveStaffMap
              className="h-[420px] lg:h-[620px]"
              sites={sites}
              people={markers}
              selectedId={selectedId}
              route={selected ? route : null}
              onSelect={(id) => { setSelectedId(id); setRoute(null); }}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.green}`} /> On shift, inside a site</span>
              <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.red}`} /> On shift, outside every site</span>
              <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.amber}`} /> On shift, not updating</span>
              <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.grey}`} /> Off shift or tracking off</span>
              <span className="ml-auto flex items-center gap-2">
                Updated {loadedAt ? ago(new Date(loadedAt).toISOString(), now) : "—"}
                <button onClick={() => void load()} title="Refresh now" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-accent">
                  <RefreshCw size={13} />
                </button>
              </span>
            </div>
          </div>

          <div className="flex max-h-[680px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            {selected ? (
              <PersonPanel
                row={selected.r}
                status={selected.s}
                sites={sites}
                now={now}
                onBack={() => { setSelectedId(null); setRoute(null); }}
                onRoute={setRoute}
              />
            ) : (
              <>
                <div className="space-y-2 border-b border-gray-100 p-3">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="input w-full pl-8" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FILTERS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${filter === f.key ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        {f.label} <span className="text-gray-400">{counts[f.key] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
                  {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">No one matches.</li>}
                  {shown.map(({ r, s }) => (
                    <li key={r.userId}>
                      <button onClick={() => { setSelectedId(r.userId); setRoute(null); }} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-cyan-50/50">
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s.tone]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-800">{r.name}</span>
                          <span className="block truncate text-xs text-gray-500">{s.label}</span>
                          {s.warning && <span className="block truncate text-xs text-amber-700">{s.warning}</span>}
                        </span>
                        <span className="shrink-0 text-right text-[11px] text-gray-400">
                          {ago(r.recordedAt, now)}
                          {r.battery != null && (
                            <span className={`flex items-center justify-end gap-0.5 ${r.battery < 15 ? "text-rose-600" : ""}`}>
                              {r.battery < 15 ? <BatteryLow size={12} /> : <BatteryMedium size={12} />} {r.battery}%
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonPanel({
  row: r,
  status: s,
  sites,
  now,
  onBack,
  onRoute,
}: {
  row: LiveLocationApi;
  status: Status;
  sites: LiveSite[];
  now: number;
  onBack: () => void;
  onRoute: (route: LiveRoute | null) => void;
}) {
  const [date, setDate] = useState(todayIST());
  const [trail, setTrail] = useState<TrailPointApi[] | null>(null);
  const [loadingTrail, setLoadingTrail] = useState(false);
  const [trailError, setTrailError] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);

  const stops = useMemo(() => (trail ? findStops(trail, sites) : []), [trail, sites]);
  const km = useMemo(() => {
    if (!trail) return 0;
    let m = 0;
    for (let i = 1; i < trail.length; i++) m += metres(trail[i - 1], trail[i]);
    return m / 1000;
  }, [trail]);

  // The map draws whatever route is loaded, plus the slider's point.
  const points = useMemo(() => trail?.map((p) => [p.lat, p.lng] as [number, number]) ?? [], [trail]);
  const stopMarks = useMemo(
    () => stops.map((st) => ({ lat: st.lat, lng: st.lng, label: `${st.site ?? "Stop"} · ${formatTimeIST(st.from)}–${formatTimeIST(st.to)}` })),
    [stops],
  );
  const onRouteRef = useRef(onRoute);
  useEffect(() => { onRouteRef.current = onRoute; });
  useEffect(() => {
    if (!trail || trail.length === 0) { onRouteRef.current(null); return; }
    const c = cursor != null ? trail[cursor] : null;
    onRouteRef.current({
      points,
      stops: stopMarks,
      cursor: c ? { lat: c.lat, lng: c.lng, label: formatTimeIST(c.recordedAt) } : null,
    });
  }, [trail, points, stopMarks, cursor]);

  async function showRoute() {
    setLoadingTrail(true);
    setTrailError("");
    setCursor(null);
    try {
      setTrail(await getLocationTrail(r.userId, date));
    } catch (err) {
      setTrailError(err instanceof ApiError ? err.message : "Unable to load the route.");
      setTrail(null);
    } finally {
      setLoadingTrail(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <button onClick={onBack} className="rounded p-1 text-gray-500 hover:bg-gray-100" title="Back to everyone"><ArrowLeft size={16} /></button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-800">{r.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-2 w-2 rounded-full ${DOT[s.tone]}`} /> {s.label}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {s.warning && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{s.warning}</div>}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Fact label="Last location" value={r.recordedAt ? `${ago(r.recordedAt, now)}` : "None yet"} sub={r.recordedAt ? formatDateTimeIST(r.recordedAt) : undefined} />
          <Fact label="Accuracy" value={r.accuracy != null ? `± ${Math.round(r.accuracy)} m` : "—"} />
          <Fact label="Battery" value={r.battery != null ? `${r.battery}%` : "—"} />
          <Fact label="Punch" value={r.inTime ? `${r.inTime} – ${r.outTime ?? "now"}` : "Not punched in"} />
          <Fact label="Phone" value={r.trackingState ? STATE_TEXT[r.trackingState] : "No report yet"} sub={r.stateAt ? ago(r.stateAt, now) : undefined} />
          <Fact label="Tracking" value={r.trackingEnabled ? "Yes" : "No"} />
        </dl>
        {r.lat != null && r.lng != null && (
          <a
            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-accent hover:underline"
          >
            <Crosshair size={12} /> Open in Google Maps
          </a>
        )}

        <div className="space-y-2 rounded-lg border border-gray-100 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><Route size={14} /> Route</div>
          <div className="flex gap-2">
            <input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} className="input flex-1" />
            <button
              onClick={() => void showRoute()}
              disabled={loadingTrail}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {loadingTrail ? <Spinner size={13} /> : null} Show
            </button>
          </div>
          {trailError && <div className="text-xs text-rose-600">{trailError}</div>}
          {trail && trail.length === 0 && <div className="text-xs text-gray-500">No locations recorded on this day.</div>}
          {trail && trail.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Fact label="From" value={formatTimeIST(trail[0].recordedAt)} />
                <Fact label="To" value={formatTimeIST(trail[trail.length - 1].recordedAt)} />
                <Fact label="Distance" value={`${km.toFixed(1)} km`} />
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={trail.length - 1}
                  value={cursor ?? trail.length - 1}
                  onChange={(e) => setCursor(Number(e.target.value))}
                  className="w-full accent-cyan-600"
                  aria-label="Replay the route"
                />
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>Drag to replay</span>
                  <span>{formatTimeIST(trail[cursor ?? trail.length - 1].recordedAt)}</span>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-gray-600">Stops (10 min or more)</div>
                {stops.length === 0 ? (
                  <div className="text-xs text-gray-400">No stops — kept moving.</div>
                ) : (
                  <ul className="space-y-1">
                    {stops.map((st, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-violet-50/60 px-2 py-1 text-xs">
                        <span className="truncate text-gray-700">{st.site ?? "Outside sites"}</span>
                        <span className="shrink-0 text-gray-500">{formatTimeIST(st.from)}–{formatTimeIST(st.to)} · {duration(st.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => { setTrail(null); setCursor(null); }} className="text-xs text-gray-500 hover:text-brand-accent">Hide route</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-700">{value}</dd>
      {sub && <dd className="text-[11px] text-gray-400">{sub}</dd>}
    </div>
  );
}

// ---- Tracking tab: Yes / No per person, and the company's tracking settings ----

function TrackingTab({ canEdit }: { canEdit: boolean }) {
  const [people, setPeople] = useState<TrackingPersonApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "yes" | "no">("all");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    () =>
      getLocationTracking()
        .then((list) => {
          setPeople(list);
          setError("");
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load people."))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter((p) =>
      (show === "all" || (show === "yes") === p.enabled) && (!t || p.name.toLowerCase().includes(t)));
  }, [people, q, show]);
  const yesCount = people.filter((p) => p.enabled).length;

  async function setTracking(ids: number[], enabled: boolean) {
    if (ids.length === 0) return;
    const before = people;
    setPeople((ps) => ps.map((p) => (ids.includes(p.userId) ? { ...p, enabled } : p)));
    setSaving((s) => new Set([...s, ...ids]));
    try {
      setPeople(await setLocationTracking(ids, enabled));
      setError("");
    } catch (err) {
      setPeople(before);
      setError(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setSaving((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
    }
  }

  async function unlink(p: TrackingPersonApi) {
    if (!confirm(`Unlink ${p.name}'s phone? It stops sending location until they sign in to the app again.`)) return;
    try {
      await unlinkTrackingDevice(p.userId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to unlink.");
    }
  }

  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.userId));

  return (
    <div className="space-y-4">
      <SettingsCard canEdit={canEdit} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <div className="relative w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="input w-full pl-8" />
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
            {(["all", "yes", "no"] as const).map((k) => (
              <button key={k} onClick={() => setShow(k)} className={`px-3 py-1.5 text-xs font-medium ${show === k ? "bg-brand-accent text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {k === "all" ? `All ${people.length}` : k === "yes" ? `Yes ${yesCount}` : `No ${people.length - yesCount}`}
              </button>
            ))}
          </div>
          {canEdit && picked.size > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-gray-500">{picked.size} selected</span>
              <button onClick={() => { void setTracking([...picked], true); setPicked(new Set()); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:opacity-90">Set Yes</button>
              <button onClick={() => { void setTracking([...picked], false); setPicked(new Set()); }} className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Set No</button>
            </div>
          )}
        </div>

        {error && <div className="bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"><Spinner size={16} className="text-brand-accent" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  {canEdit && (
                    <th className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={allShownPicked}
                        onChange={() => setPicked(allShownPicked ? new Set() : new Set(shown.map((p) => p.userId)))}
                        aria-label="Select all shown"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Location tracking</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Last location</th>
                  <th className="px-4 py-2">Status</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No one matches.</td></tr>
                )}
                {shown.map((p) => (
                  <tr key={p.userId} className="hover:bg-gray-50/60">
                    {canEdit && (
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={picked.has(p.userId)}
                          onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.userId)) n.delete(p.userId); else n.add(p.userId); return n; })}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-2">
                      <div role="radiogroup" aria-label={`Location tracking for ${p.name}`} className="flex items-center gap-4">
                        {[true, false].map((v) => (
                          <label key={String(v)} className={`flex items-center gap-1.5 ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                            <input
                              type="radio"
                              name={`track-${p.userId}`}
                              checked={p.enabled === v}
                              disabled={!canEdit || saving.has(p.userId)}
                              onChange={() => void setTracking([p.userId], v)}
                              className="accent-cyan-600"
                            />
                            <span className={p.enabled === v ? (v ? "font-medium text-emerald-700" : "font-medium text-gray-700") : "text-gray-500"}>{v ? "Yes" : "No"}</span>
                          </label>
                        ))}
                        {saving.has(p.userId) && <Spinner size={12} className="text-brand-accent" />}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {p.deviceLinked ? (
                        <span className="flex items-center gap-1 text-gray-700"><Smartphone size={13} className="text-emerald-600" /> Linked · {ago(p.deviceLastUsedAt, now)}</span>
                      ) : (
                        <span className="text-gray-400">Not linked yet</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{ago(p.lastSeenAt, now)}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{p.trackingState ? STATE_TEXT[p.trackingState] : "—"}</td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        {p.deviceLinked && (
                          <button onClick={() => void unlink(p)} title="Unlink phone" className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600">
                            <Unlink size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          <b>Yes</b>: the person&apos;s phone tracks their location in the background, even with the app closed. <b>No</b>: the phone stops on its next sync and anything it still sends is discarded.
          {!canEdit && " You can view this list; changing it needs Live Staff Location edit access."}
        </div>
      </div>
    </div>
  );
}

const INTERVALS = [
  { v: 60, label: "Every 1 minute" },
  { v: 120, label: "Every 2 minutes" },
  { v: 300, label: "Every 5 minutes" },
  { v: 600, label: "Every 10 minutes" },
];
const DISTANCES = [
  { v: 0, label: "Any movement" },
  { v: 25, label: "25 m" },
  { v: 50, label: "50 m" },
  { v: 100, label: "100 m" },
  { v: 250, label: "250 m" },
];

function SettingsCard({ canEdit }: { canEdit: boolean }) {
  const [saved, setSaved] = useState<LocationSettingsApi | null>(null);
  const [form, setForm] = useState<LocationSettingsApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getLocationSettings()
      .then((s) => { setSaved(s); setForm(s); })
      .catch((err) => setMsg(err instanceof ApiError ? err.message : "Unable to load settings."));
  }, []);

  if (!form) {
    return msg ? <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{msg}</div> : null;
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg("");
    try {
      const s = await saveLocationSettings(form);
      setSaved(s);
      setForm(s);
      setMsg("Saved. Phones pick this up on their next sync.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<LocationSettingsApi>) => { setForm({ ...form, ...patch }); setMsg(""); };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700"><Settings2 size={15} /> Tracking settings</div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <fieldset disabled={!canEdit}>
          <legend className="mb-1 text-xs font-medium text-gray-500">When to track (people set to Yes)</legend>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" name="track-mode" checked={form.mode === "PUNCH"} onChange={() => set({ mode: "PUNCH" })} className="mt-0.5 accent-cyan-600" />
              <span><span className="font-medium text-gray-800">Punch-in to punch-out</span><span className="block text-xs text-gray-500">Even with the app closed. Recommended.</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="track-mode" checked={form.mode === "ALWAYS"} onChange={() => set({ mode: "ALWAYS" })} className="mt-0.5 accent-cyan-600" />
              <span><span className="font-medium text-gray-800">All the time</span><span className="block text-xs text-gray-500">Including off-duty hours.</span></span>
            </label>
          </div>
        </fieldset>
        <label className="text-xs font-medium text-gray-500">
          Send location
          <select disabled={!canEdit} value={form.intervalSec} onChange={(e) => set({ intervalSec: Number(e.target.value) })} className="input mt-1 w-full">
            {INTERVALS.some((i) => i.v === form.intervalSec) ? null : <option value={form.intervalSec}>Every {form.intervalSec} s</option>}
            {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-500">
          Only after moving
          <select disabled={!canEdit} value={form.distanceFilterM} onChange={(e) => set({ distanceFilterM: Number(e.target.value) })} className="input mt-1 w-full">
            {DISTANCES.some((d) => d.v === form.distanceFilterM) ? null : <option value={form.distanceFilterM}>{form.distanceFilterM} m</option>}
            {DISTANCES.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-500">
          Forgot to punch out: stop after
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={24}
              disabled={!canEdit || form.mode === "ALWAYS"}
              value={form.maxHours}
              onChange={(e) => set({ maxHours: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })}
              className="input w-20"
            />
            <span className="text-gray-500">hours</span>
          </div>
        </label>
      </div>
      {(canEdit || msg) && (
        <div className="mt-3 flex items-center justify-end gap-3">
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
          {canEdit && (
            <button
              onClick={() => void save()}
              disabled={!dirty || busy}
              className="rounded-lg bg-brand-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
