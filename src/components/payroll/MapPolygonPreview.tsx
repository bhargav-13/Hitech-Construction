"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletNS from "leaflet";
import type { GeoPoint } from "@/lib/payrollApi";

export interface PreviewShape {
  id: number | string;
  name: string;
  points: GeoPoint[];
  /** Amber for sites that let punches outside go for approval. */
  tone?: "cyan" | "amber";
}

const COLORS = { cyan: "#0891b2", amber: "#d97706" };

function drawShapes(
  L: typeof LeafletNS,
  layer: LeafletNS.LayerGroup,
  shapes: PreviewShape[],
  interactive: boolean,
  onSelect: ((id: PreviewShape["id"]) => void) | undefined,
) {
  layer.clearLayers();
  for (const s of shapes) {
    if (s.points.length === 0) continue;
    const color = COLORS[s.tone ?? "cyan"];
    const latlngs = s.points.map((p) => [p.lat, p.lng] as [number, number]);
    const shape = s.points.length >= 3
      ? L.polygon(latlngs, { color, weight: 2, fillColor: color, fillOpacity: 0.18 })
      : L.circleMarker(latlngs[0], { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 });
    if (interactive) shape.bindTooltip(s.name, { sticky: true });
    if (onSelect) shape.on("click", () => onSelect(s.id));
    shape.addTo(layer);
    // On the all-sites map a site is a few pixels wide when zoomed out to the whole state — a dot
    // at its centre keeps every site findable at any zoom.
    if (interactive && s.points.length >= 3) {
      const c = latlngs.reduce((a, p) => [a[0] + p[0] / latlngs.length, a[1] + p[1] / latlngs.length], [0, 0]) as [number, number];
      const dot = L.circleMarker(c, { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 });
      dot.bindTooltip(s.name, { direction: "top", offset: [0, -6] });
      if (onSelect) dot.on("click", () => onSelect(s.id));
      dot.addTo(layer);
    }
  }
}

function fitShapes(L: typeof LeafletNS, map: LeafletNS.Map, shapes: PreviewShape[]) {
  const all = shapes.flatMap((s) => s.points.map((p) => [p.lat, p.lng] as [number, number]));
  if (all.length === 0) return;
  if (all.length === 1) map.setView(all[0], 17);
  else map.fitBounds(L.latLngBounds(all), { padding: [16, 16], maxZoom: 18 });
}

/**
 * A read-only map of one or more site boundaries, framed to fit them. On a card it is a still
 * preview (no dragging or zoom, so the page scrolls normally over it); `interactive` turns on pan
 * and zoom for the all-sites map. Clicking a shape calls `onSelect`.
 */
export function MapPolygonPreview({
  shapes,
  interactive = false,
  className = "h-40",
  onSelect,
}: {
  shapes: PreviewShape[];
  interactive?: boolean;
  className?: string;
  onSelect?: (id: PreviewShape["id"]) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const layerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const shapesRef = useRef(shapes);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    shapesRef.current = shapes;
    onSelectRef.current = onSelect;
  }, [shapes, onSelect]);

  // Create the map once (per interactive mode).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof LeafletNS;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(divRef.current, {
        center: [23.0225, 72.5714],
        zoom: 12,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        attributionControl: interactive,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      drawShapes(L, layer, shapesRef.current, interactive, (id) => onSelectRef.current?.(id));
      setTimeout(() => {
        map.invalidateSize();
        fitShapes(L, map, shapesRef.current);
      }, 120);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  // Redraw and re-frame whenever the shapes change.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!L || !map || !layer) return;
    drawShapes(L, layer, shapes, interactive, (id) => onSelectRef.current?.(id));
    fitShapes(L, map, shapes);
  }, [shapes, interactive]);

  return <div ref={divRef} className={`relative z-0 w-full overflow-hidden ${className}`} />;
}
