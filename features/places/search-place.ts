// Place-name and address lookup through the public OpenStreetMap Nominatim
// server. Its usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// requires an identifying User-Agent, cached results, and at most one request
// per second for the whole app, so every lookup goes through this module.

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

const MIN_INTERVAL_MS = 1000;

const MAX_CACHED_QUERIES = 500;

const DEFAULT_USER_AGENT = "bb-project-gas-finder/0.1 (local development)";

export type Place = { lat: number; lng: number; label: string };

export class PlaceSearchError extends Error {}

const cache = new Map<string, Place | null>();

// The earliest time the next request may start.
let nextSlot = 0;

function waitForSlot() {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + MIN_INTERVAL_MS;
  const wait = start - now;
  return wait > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, wait))
    : Promise.resolve();
}

function remember(query: string, place: Place | null) {
  if (cache.size >= MAX_CACHED_QUERIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(query, place);
}

type NominatimResult = { lat: string; lon: string; display_name: string };

/** Finds one place in South Korea for the query; null when nothing matches. */
export async function searchPlace(rawQuery: string): Promise<Place | null> {
  const query = rawQuery.trim();
  if (cache.has(query)) return cache.get(query) ?? null;

  await waitForSlot();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "kr",
    limit: "1",
    "accept-language": "ko",
  }).toString();

  let results: unknown;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": process.env.NOMINATIM_USER_AGENT || DEFAULT_USER_AGENT,
      },
    });
    if (!res.ok) throw new PlaceSearchError(`Nominatim responded ${res.status}`);
    results = await res.json();
  } catch (error) {
    if (error instanceof PlaceSearchError) throw error;
    throw new PlaceSearchError("Nominatim request failed");
  }
  if (!Array.isArray(results)) throw new PlaceSearchError("Unexpected Nominatim response");

  const [first] = results as NominatimResult[];
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  const place =
    first && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, label: String(first.display_name) }
      : null;
  remember(query, place);
  return place;
}
