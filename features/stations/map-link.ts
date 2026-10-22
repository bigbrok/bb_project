import type { Station } from "./types";

/**
 * Kakao Map web link that shows the station's position.
 * Returns null when the station has no position.
 */
export function kakaoMapUrl(station: Station) {
  if (station.lat == null || station.lng == null) return null;
  // Commas separate name, lat and lng in Kakao's link format.
  const name = encodeURIComponent(station.name.replace(/,/g, " "));
  return `https://map.kakao.com/link/map/${name},${station.lat},${station.lng}`;
}
