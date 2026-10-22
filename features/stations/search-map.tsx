"use client";

import { useEffect, useRef } from "react";

import { openOsmMap } from "./osm-map";
import { SEARCH_RADIUS_METERS } from "./types";

// Zoom 13 fits the 2km circle inside the map's height at Korean latitudes.
const ZOOM = 13;

/**
 * Shows the search position and its 2km radius on an OpenStreetMap map.
 * Render it with a key per position; it draws once for the position it gets.
 */
export function SearchMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    let remove: (() => void) | undefined;

    const at: [number, number] = [lat, lng];
    openOsmMap(container, at, ZOOM, controller.signal)
      .then((opened) => {
        if (!opened) return;
        const { L, map } = opened;
        L.circle(at, { radius: SEARCH_RADIUS_METERS, className: "search-map-radius" }).addTo(map);
        L.circleMarker(at, { radius: 7, className: "search-map-marker" }).addTo(map);
        remove = () => map.remove();
      })
      .catch(() => {
        // The map is an aid to the list; when Leaflet cannot load, the area stays blank.
      });

    return () => {
      controller.abort();
      remove?.();
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="검색 위치 지도"
      className="isolate h-56 w-full overflow-hidden rounded-lg border bg-muted"
    />
  );
}
