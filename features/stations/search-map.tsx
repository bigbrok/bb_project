"use client";

import { useEffect, useRef } from "react";
import type { Circle, Map as LeafletMap } from "leaflet";
import { MapPinIcon } from "lucide-react";

import { openOsmMap } from "./osm-map";
import { SEARCH_RADIUS_METERS } from "./types";

// Zoom 13 fits the 2km circle inside the map's height at Korean latitudes.
const ZOOM = 13;

export type MapCenter = { lat: number; lng: number };

/**
 * An OpenStreetMap map with a pin fixed at its center and the 2km search
 * radius around it. Dragging the map moves the point under the pin and
 * reports it through `onCenterChange`; a new `lat`/`lng` recenters the map.
 */
export function SearchMap({
  lat,
  lng,
  onCenterChange,
}: {
  lat: number;
  lng: number;
  onCenterChange: (center: MapCenter) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<{ map: LeafletMap; circle: Circle } | null>(null);
  // Props the map's own event handlers read; refreshed after every render.
  const latestRef = useRef({ lat, lng, onCenterChange });
  useEffect(() => {
    latestRef.current = { lat, lng, onCenterChange };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    const start = latestRef.current;

    openOsmMap(container, [start.lat, start.lng], ZOOM, controller.signal)
      .then((opened) => {
        if (!opened) return;
        const { L, map } = opened;
        const circle = L.circle(map.getCenter(), {
          radius: SEARCH_RADIUS_METERS,
          className: "search-map-radius",
        }).addTo(map);
        map.on("move", () => circle.setLatLng(map.getCenter()));
        map.on("moveend", () => {
          const center = map.getCenter();
          latestRef.current.onCenterChange({ lat: center.lat, lng: center.lng });
        });
        layersRef.current = { map, circle };
        // The position may have changed while Leaflet was loading.
        const latest = latestRef.current;
        if (latest.lat !== start.lat || latest.lng !== start.lng) {
          map.setView([latest.lat, latest.lng]);
          circle.setLatLng([latest.lat, latest.lng]);
        }
      })
      .catch(() => {
        // The map is an aid to the list; when Leaflet cannot load, the area stays blank.
      });

    return () => {
      controller.abort();
      layersRef.current?.map.remove();
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    const center = layers.map.getCenter();
    if (center.lat === lat && center.lng === lng) return;
    layers.map.setView([lat, lng]);
    layers.circle.setLatLng([lat, lng]);
    // Leaflet also fires moveend here; reporting directly keeps the pin and
    // the search in step even if that event is skipped.
    latestRef.current.onCenterChange({ lat, lng });
  }, [lat, lng]);

  return (
    <div
      role="region"
      aria-label="검색 위치 지도"
      className="relative h-56 w-full overflow-hidden rounded-lg border bg-muted"
    >
      <div ref={containerRef} className="isolate absolute inset-0" />
      {/* The pin's tip marks the map center; it stays put while the map moves. */}
      <MapPinIcon
        role="img"
        aria-label="지도 중심 핀"
        aria-hidden={false}
        className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-9 -translate-x-1/2 -translate-y-full fill-primary stroke-background"
      />
    </div>
  );
}
