import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// OpenStreetMap's standard tiles. Its tile policy requires this URL, a visible
// attribution, and fetching only the tiles the user is looking at.
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';

let leaflet: Promise<typeof import("leaflet")> | null = null;

// Leaflet loads once and every map shares it.
function loadLeaflet() {
  leaflet ??= import("leaflet").catch((error) => {
    leaflet = null;
    throw error;
  });
  return leaflet;
}

/**
 * Loads Leaflet and opens an OpenStreetMap map in the container. Leaflet
 * touches `window` on import, so this runs only in the browser. Resolves to
 * null when the signal aborts first, so a cancelled caller never claims the
 * container (React runs effects twice in development).
 */
export async function openOsmMap(
  container: HTMLElement,
  center: [number, number],
  zoom: number,
  signal: AbortSignal
): Promise<{ L: typeof import("leaflet"); map: LeafletMap } | null> {
  const L = await loadLeaflet();
  if (signal.aborted) return null;
  // No inertia: the map stops where the user lets go, so the center pin can
  // be placed precisely. No wheel zoom, so the page scrolls over the map.
  const map = L.map(container, { scrollWheelZoom: false, inertia: false }).setView(center, zoom);
  L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  return { L, map };
}
