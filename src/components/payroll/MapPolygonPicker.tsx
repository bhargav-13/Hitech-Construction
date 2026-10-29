"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import { Crosshair, Loader2, MapPin, RotateCcw, Undo2 } from "lucide-react";
import type { GeoPoint } from "@/lib/payrollApi";

/**
 * Draw a free-form site boundary on a real map (OpenStreetMap tiles). The admin taps each corner of
 * the site — any number of points — and the shape closes automatically once there are 3+, so an
 * L-shaped plot, a long strip or any irregular site can be traced exactly. That polygon becomes the
 * geofence a staff member must be inside to punch. Vanilla Leaflet, loaded client-side only.
 */
export function MapPolygonPicker({ value, onChange }: { value: GeoPoint[]; onChange: (pts: GeoPoint[]) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const layerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const ptsRef = useRef<GeoPoint[]>(value ?? []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [count, setCount] = useState(ptsRef.current.length);
  const [locating, setLocating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [geoError, setGeoError] = useState("");

  function redraw() {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const pts = ptsRef.current;
    const latlngs = pts.map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length >= 3) {
      L.polygon(latlngs, { color: "#0891b2", weight: 2, fillColor: "#0891b2", fillOpacity: 0.15 }).addTo(layer);
    } else if (pts.length === 2) {
      L.polyline(latlngs, { color: "#0891b2", weight: 2, dashArray: "4" }).addTo(layer);
    }
    // Numbered corner dots on top of the shape.
    pts.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 2, fillColor: "#0891b2", fillOpacity: 1 }).addTo(layer);
    });
  }

  function commit() {
    setCount(ptsRef.current.length);
    onChangeRef.current([...ptsRef.current]);
    redraw();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof LeafletNS;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(divRef.current, { center: [23.0225, 72.5714], zoom: 12 }); // Ahmedabad default
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);

      // Draw an existing boundary and frame it.
      if (ptsRef.current.length) {
        redraw();
        const b = L.latLngBounds(ptsRef.current.map((p) => [p.lat, p.lng] as [number, number]));
        if (ptsRef.current.length >= 2) map.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
        else map.setView([ptsRef.current[0].lat, ptsRef.current[0].lng], 17);
      }

      map.on("click", (e: LeafletNS.LeafletMouseEvent) => {
        ptsRef.current = [...ptsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
        commit();
      });

      setTimeout(() => map.invalidateSize(), 120);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function undo() {
    if (!ptsRef.current.length) return;
    ptsRef.current = ptsRef.current.slice(0, -1);
    commit();
  }

  function clearAll() {
    ptsRef.current = [];
    commit();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const map = mapRef.current;
        if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 18);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  /**
   * Walk the site: standing at a corner, add where the phone is as the next point (KAN-63 — tapping
   * a small map on a phone is fiddly, and on site you are standing on the corners anyway).
   */
  function addMyLocation() {
    if (!navigator.geolocation) return setGeoError("This device can't share its location.");
    setAdding(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAdding(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        ptsRef.current = [...ptsRef.current, p];
        commit();
        mapRef.current?.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 18));
      },
      (err) => {
        setAdding(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission is off — allow it for this site in the browser settings." : "Couldn't read your location. Try again in the open.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  const hint =
    count === 0
      ? "Tap each corner of the site on the map."
      : count < 3
        ? `${count} point${count > 1 ? "s" : ""} — add at least ${3 - count} more to close the shape.`
        : `${count} points · boundary closed ✓ — keep tapping to add more corners.`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500"><MapPin size={13} className="text-brand-accent" /> {hint}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={count === 0}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <Undo2 size={13} /> Undo
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={count === 0}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Clear
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {locating ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />} Locate me
          </button>
          <button
            type="button"
            onClick={addMyLocation}
            disabled={adding}
            title="Stand at a corner of the site and add where you are"
            className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-brand-accent transition-colors hover:bg-cyan-100 disabled:opacity-50"
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />} Add my spot as corner
          </button>
        </div>
      </div>
      {geoError && <p className="text-xs text-rose-600">{geoError}</p>}
      <div ref={divRef} style={{ touchAction: "none", background: "#e5e7eb" }} className="h-72 w-full overflow-hidden rounded-xl border border-gray-200" />
    </div>
  );
}
