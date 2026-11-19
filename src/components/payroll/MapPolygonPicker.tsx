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
    const latlngs = () => ptsRef.current.map((p) => [p.lat, p.lng] as [number, number]);
    let shape: LeafletNS.Polygon | LeafletNS.Polyline | null = null;
    if (pts.length >= 3) {
      shape = L.polygon(latlngs(), { color: "#0891b2", weight: 2, fillColor: "#0891b2", fillOpacity: 0.15 }).addTo(layer);
    } else if (pts.length === 2) {
      shape = L.polyline(latlngs(), { color: "#0891b2", weight: 2, dashArray: "4" }).addTo(layer);
    }
    const live = () => shape?.setLatLngs(latlngs());

    // KAN-128: corners are draggable dots — pull one to reshape the site. Double-click removes it.
    const cornerIcon = L.divIcon({
      className: "",
      html: '<div style="width:16px;height:16px;border-radius:9999px;background:#0891b2;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:grab"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    pts.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: cornerIcon, draggable: true, title: "Drag to move · double-click or right-click to remove" }).addTo(layer);
      m.on("drag", () => {
        const ll = m.getLatLng();
        ptsRef.current[i] = { lat: ll.lat, lng: ll.lng };
        live();
      });
      m.on("dragend", () => commit());
      const remove = (e: LeafletNS.LeafletMouseEvent) => {
        L.DomEvent.stop(e.originalEvent);
        ptsRef.current = ptsRef.current.filter((_, j) => j !== i);
        commit();
      };
      m.on("dblclick", remove);
      m.on("contextmenu", remove);
    });

    // Stretch a side: a small handle in the middle of each edge — drag it out to add a corner there.
    if (pts.length >= 2) {
      const midIcon = L.divIcon({
        className: "",
        html: '<div style="width:12px;height:12px;border-radius:9999px;background:#fff;border:2px solid #0891b2;opacity:.9;cursor:grab"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const edges = pts.length >= 3 ? pts.length : 1;
      for (let i = 0; i < edges; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const mid = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], {
          icon: midIcon,
          draggable: true,
          title: "Drag to add a corner here",
        }).addTo(layer);
        let at = -1;
        mid.on("dragstart", () => {
          const ll = mid.getLatLng();
          at = i + 1;
          ptsRef.current = [...ptsRef.current.slice(0, at), { lat: ll.lat, lng: ll.lng }, ...ptsRef.current.slice(at)];
        });
        mid.on("drag", () => {
          if (at < 0) return;
          const ll = mid.getLatLng();
          ptsRef.current[at] = { lat: ll.lat, lng: ll.lng };
          live();
        });
        mid.on("dragend", () => commit());
      }
    }
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

      // Double-click removes a corner here, so it must not also zoom the map.
      map.doubleClickZoom.disable();
      map.on("click", (e: LeafletNS.LeafletMouseEvent) => {
        // A click on (or right beside) an existing dot is meant for that dot — never a new corner.
        const near = ptsRef.current.some((p) => map.latLngToContainerPoint([p.lat, p.lng]).distanceTo(e.containerPoint) < 14);
        if (near) return;
        ptsRef.current = [...ptsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
        commit();
      });
      // Double-clicking a dot removes it, whether the browser hands the event to the dot or the map.
      map.on("dblclick", (e: LeafletNS.LeafletMouseEvent) => {
        const i = ptsRef.current.findIndex((p) => map.latLngToContainerPoint([p.lat, p.lng]).distanceTo(e.containerPoint) < 14);
        if (i < 0) return;
        ptsRef.current = ptsRef.current.filter((_, j) => j !== i);
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
      ? "Tap each corner of the site on the map. Drag a dot to move it, or pull the small dot on a side to add a corner."
      : count < 3
        ? `${count} point${count > 1 ? "s" : ""} — add at least ${3 - count} more to close the shape.`
        : `${count} points · boundary closed ✓ — drag dots to adjust, pull a side's middle dot to add a corner, double-click a dot to remove it.`;

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
