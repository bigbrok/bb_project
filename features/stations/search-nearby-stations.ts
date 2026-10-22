import proj4 from "proj4";

import { SEARCH_RADIUS_METERS, type FuelType, type Station } from "./types";

// Opinet's coordinate system (KATEC). Verified against Opinet's own sample
// coordinates, which land near Gangnam Station.
const KATEC =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +no_defs";

const OPINET_AROUND_URL = "https://www.opinet.co.kr/api/aroundAll.do";

const PRODUCT_CODES: Record<FuelType, string> = {
  gasoline: "B027",
  diesel: "D047",
};

export class StationSearchError extends Error {}

type OpinetStation = {
  UNI_ID: string;
  OS_NM: string;
  PRICE: number | string;
  DISTANCE: number | string;
};

export async function searchNearbyStations(
  position: { lat: number; lng: number },
  fuel: FuelType,
  certKey: string
): Promise<Station[]> {
  const [x, y] = proj4("WGS84", KATEC, [position.lng, position.lat]);

  const url = new URL(OPINET_AROUND_URL);
  url.search = new URLSearchParams({
    certkey: certKey,
    out: "json",
    x: x.toFixed(1),
    y: y.toFixed(1),
    radius: String(SEARCH_RADIUS_METERS),
    prodcd: PRODUCT_CODES[fuel],
    sort: "1",
  }).toString();

  let body: unknown;
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new StationSearchError(`Opinet responded ${res.status}`);
    body = await res.json();
  } catch (error) {
    if (error instanceof StationSearchError) throw error;
    throw new StationSearchError("Opinet request failed");
  }

  const oil = (body as { RESULT?: { OIL?: unknown } })?.RESULT?.OIL;
  if (!Array.isArray(oil)) throw new StationSearchError("Unexpected Opinet response");

  return (oil as OpinetStation[])
    .map((item) => ({
      id: String(item.UNI_ID),
      name: String(item.OS_NM),
      price: Number(item.PRICE),
      distance: Number(item.DISTANCE),
    }))
    .filter((station) => station.distance <= SEARCH_RADIUS_METERS)
    .sort((a, b) => a.price - b.price || a.distance - b.distance);
}
