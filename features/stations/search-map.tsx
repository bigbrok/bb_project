"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

import { SEARCH_RADIUS_METERS } from "./types";

// OpenStreetMap's standard tiles. Its tile policy requires this URL, a visible
// attribution, and fetching only the tiles the user is looking at.
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';

// Zoom 13 fits the 2km circle inside the map's height at Korean latitudes.
const ZOOM = 13;

/**
 * Shows the search position and its 2km radius on an OpenStreetMap map.
 * Render it with a key per position; it draws once for the position it gets.
 */
export function SearchMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;

    // Leaflet touches `window` on import, so it loads only in the browser.
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        const at: [number, number] = [lat, lng];
        const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(at, ZOOM);
        L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        L.circle(at, { radius: SEARCH_RADIUS_METERS, className: "search-map-radius" }).addTo(map);
        L.circleMarker(at, { radius: 7, className: "search-map-marker" }).addTo(map);
        remove = () => map.remove();
      })
      .catch(() => {
        // The map is an aid to the list; when Leaflet cannot load, the area stays blank.
      });

    return () => {
      cancelled = true;
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
