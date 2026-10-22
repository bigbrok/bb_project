import type { Station } from "./types";

/** Kakao Map web link that shows a named position; opens without an API key. */
export function kakaoMapLink(name: string, lat: number, lng: number) {
  // Commas separate name, lat and lng in Kakao's link format.
  const label = encodeURIComponent(name.replace(/,/g, " "));
  return `https://map.kakao.com/link/map/${label},${lat},${lng}`;
}

/**
 * Kakao Map web link that shows the station's position.
 * Returns null when the station has no position.
 */
export function kakaoMapUrl(station: Station) {
  if (station.lat == null || station.lng == null) return null;
  return kakaoMapLink(station.name, station.lat, station.lng);
}
