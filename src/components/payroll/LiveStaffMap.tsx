"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import type { GeoPointApi } from "@/lib/api";

/** Marker colour: on shift and fine, outside every site, gone quiet, or not being tracked. */
export type LiveTone = "green" | "red" | "amber" | "grey";

export interface LivePerson {
  id: number;
  name: string;
  lat: number;
  lng: number;
  tone: LiveTone;
  /** Tooltip second line, e.g. "2 min ago · 81%". */
  detail: string;
}

export interface LiveSite {
  id: number;
  name: string;
  points: GeoPointApi[];
}

export interface LiveRoute {
  points: [number, number][];
  stops: { lat: number; lng: number; label: string }[];
  /** The replay slider's position, if it has been moved. */
  cursor?: { lat: number; lng: number; label: string } | null;
}

const TONE: Record<LiveTone, string> = {
  green: "#059669",
  red: "#dc2626",
  amber: "#d97706",
  grey: "#9ca3af",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function personIcon(L: typeof LeafletNS, p: LivePerson, selected: boolean): LeafletNS.DivIcon {
  const size = selected ? 38 : 32;
  const ring = selected ? "0 0 0 3px rgba(8,145,178,.45), 0 1px 4px rgba(0,0,0,.35)" : "0 1px 4px rgba(0,0,0,.35)";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${TONE[p.tone]};` +
      `border:2px solid #fff;box-shadow:${ring};color:#fff;font:600 ${selected ? 13 : 12}px/1 system-ui,sans-serif;` +
      `display:flex;align-items:center;justify-content:center">${escapeHtml(initials(p.name))}</div>`,
  });
}

/**
 * The live staff map: work-site outlines drawn faintly underneath, one initials marker per person
 * coloured by status, and — when a person is picked — their route for a day with its stops and the
 * replay cursor. It frames everyone once on first load and follows the route or the picked person
 * after that; the 20-second refresh never moves the view out from under the admin.
 */
export function LiveStaffMap({
  sites,
  people,
  selectedId,
  route,
  onSelect,
  className = "h-[560px]",
}: {
  sites: LiveSite[];
  people: LivePerson[];
  selectedId: number | null;
  route: LiveRoute | null;
  onSelect: (id: number) => void;
  className?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const layers = useRef<{ sites: LeafletNS.LayerGroup; people: LeafletNS.LayerGroup; route: LeafletNS.LayerGroup; cursor: LeafletNS.LayerGroup } | null>(null);
  const framed = useRef(false);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  const latest = useRef({ sites, people, selectedId, route });
  useEffect(() => {
    onSelectRef.current = onSelect;
    latest.current = { sites, people, selectedId, route };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof LeafletNS;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(divRef.current, { center: [23.0225, 72.5714], zoom: 11, maxZoom: 19 });
      // Leaflet only measures its box on creation; the side panel, the window or the breakpoint
      // changing its width would otherwise leave a grey strip and fit routes to the wrong size.
      resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(divRef.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
      layers.current = {
        sites: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        people: L.layerGroup().addTo(map),
        cursor: L.layerGroup().addTo(map),
      };
      ready.current = true;
      setTimeout(() => {
        map.invalidateSize();
        drawSites();
        drawPeople();
        drawRoute();
      }, 120);
    })();
    return () => {
      cancelled = true;
      resize?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layers.current = null;
      framed.current = false;
      ready.current = false;
    };
  }, []);

  function drawSites() {
    const L = LRef.current, g = layers.current?.sites;
    if (!L || !g) return;
    g.clearLayers();
    for (const s of latest.current.sites) {
      if (s.points.length < 3) continue;
      L.polygon(s.points.map((p) => [p.lat, p.lng] as [number, number]), {
        color: "#0891b2", weight: 1.5, fillColor: "#0891b2", fillOpacity: 0.08, dashArray: "4 4",
      }).bindTooltip(s.name, { sticky: true }).addTo(g);
    }
  }

  function drawPeople() {
    const L = LRef.current, map = mapRef.current, g = layers.current?.people;
    if (!L || !map || !g) return;
    g.clearLayers();
    const { people: list, selectedId: sel, route: r } = latest.current;
    for (const p of list) {
      // While a route is open only its person stays on the map, so the path reads clearly.
      if (r && p.id !== sel) continue;
      const m = L.marker([p.lat, p.lng], { icon: personIcon(L, p, p.id === sel), zIndexOffset: p.id === sel ? 1000 : 0 });
      m.bindTooltip(`<b>${escapeHtml(p.name)}</b><br/>${escapeHtml(p.detail)}`, { direction: "top", offset: [0, -16] });
      m.on("click", () => onSelectRef.current(p.id));
      m.addTo(g);
    }
    if (!framed.current && list.length > 0) {
      framed.current = true;
      if (list.length === 1) map.setView([list[0].lat, list[0].lng], 15);
      else map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 });
    }
  }

  function drawRoute() {
    const L = LRef.current, map = mapRef.current, g = layers.current?.route;
    if (!L || !map || !g) return;
    g.clearLayers();
    const r = latest.current.route;
    if (!r || r.points.length === 0) return;
    L.polyline(r.points, { color: "#0891b2", weight: 4, opacity: 0.85 }).addTo(g);
    L.circleMarker(r.points[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#059669", fillOpacity: 1 })
      .bindTooltip("Start", { direction: "top" }).addTo(g);
    for (const s of r.stops) {
      L.circleMarker([s.lat, s.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#7c3aed", fillOpacity: 1 })
        .bindTooltip(escapeHtml(s.label), { direction: "top" }).addTo(g);
    }
    // Cancel the fly-to that picking the person started, or the two animations fight.
    map.stop();
    map.fitBounds(L.latLngBounds(r.points), { padding: [40, 40], maxZoom: 17 });
  }

  function drawCursor() {
    const L = LRef.current, g = layers.current?.cursor;
    if (!L || !g) return;
    g.clearLayers();
    const c = latest.current.route?.cursor;
    if (!c) return;
    L.circleMarker([c.lat, c.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#0e7490", fillOpacity: 1 })
      .bindTooltip(escapeHtml(c.label), { permanent: true, direction: "top", offset: [0, -8] })
      .addTo(g);
  }

  useEffect(() => { if (ready.current) drawSites(); }, [sites]);
  useEffect(() => { if (ready.current) drawPeople(); }, [people, selectedId, route]);
  useEffect(() => { if (ready.current) drawRoute(); }, [route?.points, route?.stops]);
  useEffect(() => { if (ready.current) drawCursor(); }, [route?.cursor]);

  // Picking someone (without a route open) brings them into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId == null || route) return;
    const p = latest.current.people.find((x) => x.id === selectedId);
    if (p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [selectedId, route]);

  return <div ref={divRef} className={`relative z-0 w-full overflow-hidden ${className}`} />;
}
