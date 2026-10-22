// Turns Opinet's "현재 판매가격(주유소)" CSV into the station dataset the app
// searches. The CSV has no coordinates, so addresses are geocoded with the
// Kakao Local REST API; found coordinates are cached per station ID.

import type { StationRecord } from "../../features/stations/types";

const EXPECTED_HEADER = [
  "고유번호",
  "지역",
  "상호",
  "주소",
  "상표",
  "셀프여부",
  "고급휘발유",
  "휘발유",
  "경유",
  "실내등유",
];

export type CsvStation = {
  id: string;
  region: string;
  name: string;
  address: string;
  brand: string;
  self: boolean;
  gasoline: number | null;
  diesel: number | null;
};

export type CoordsCache = Record<string, { address: string; lat: number; lng: number }>;

export type Geocoder = (station: CsvStation) => Promise<{ lat: number; lng: number } | null>;

function price(value: string) {
  const won = Number(value);
  return Number.isFinite(won) && won > 0 ? won : null;
}

/** Reads Opinet's CP949 CSV. The file has no quoted fields. */
export function parseOpinetCsv(bytes: Uint8Array): CsvStation[] {
  const text = new TextDecoder("euc-kr").decode(bytes);
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const columns = header?.split(",").map((name) => name.trim()) ?? [];
  if (columns.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error(`오피넷 CSV 열이 예상과 다릅니다: ${columns.join(", ")}`);
  }

  return lines.map((line) => {
    const [id, region, name, address, brand, self, , gasoline, diesel] = line.split(",");
    return {
      id: id.trim(),
      region: region.trim(),
      name: name.trim(),
      address: address.trim(),
      brand: brand.trim(),
      self: self.trim() === "셀프",
      gasoline: price(gasoline),
      diesel: price(diesel),
    };
  });
}

const KAKAO_LOCAL = "https://dapi.kakao.com/v2/local/search";

/**
 * Geocodes with Kakao: the road address first (without the trailing
 * "(동 이름)"), then the station name and region as a keyword search.
 */
export function kakaoGeocoder(apiKey: string, fetchImpl: typeof fetch = fetch): Geocoder {
  async function search(kind: "address" | "keyword", query: string) {
    const url = `${KAKAO_LOCAL}/${kind}.json?${new URLSearchParams({ query, size: "1" })}`;
    const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (!res.ok) {
      throw new Error(`카카오 로컬 API가 ${res.status}로 응답했습니다: ${await res.text()}`);
    }
    const body = (await res.json()) as { documents?: { x: string; y: string }[] };
    const first = body.documents?.[0];
    if (!first) return null;
    const lat = Number(first.y);
    const lng = Number(first.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  return async (station) => {
    const address = station.address.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return (
      (await search("address", address)) ??
      (await search("keyword", `${station.name} ${station.region}`))
    );
  };
}

/**
 * Attaches coordinates to every station, reusing cached ones whose address
 * has not changed. Stations that cannot be placed are left out and reported.
 */
export async function buildDataset(
  csv: CsvStation[],
  cache: CoordsCache,
  geocode: Geocoder,
  {
    concurrency = 4,
    onProgress,
  }: {
    concurrency?: number;
    onProgress?: (done: number, coords: CoordsCache, unresolved: CsvStation[]) => void;
  } = {}
) {
  const coords: CoordsCache = {};
  const placed = new Map<string, { lat: number; lng: number }>();
  const unresolved: CsvStation[] = [];

  const toGeocode = csv.filter((station) => {
    const cached = cache[station.id];
    if (cached && cached.address === station.address) {
      coords[station.id] = cached;
      placed.set(station.id, cached);
      return false;
    }
    return true;
  });

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < toGeocode.length) {
      const station = toGeocode[next++];
      const found = await geocode(station);
      if (found) {
        coords[station.id] = { address: station.address, ...found };
        placed.set(station.id, found);
      } else {
        unresolved.push(station);
      }
      onProgress?.(++done, coords, unresolved);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toGeocode.length) }, worker));

  const stations: StationRecord[] = csv.flatMap((station) => {
    const at = placed.get(station.id);
    if (!at) return [];
    return [
      {
        id: station.id,
        name: station.name,
        brand: station.brand,
        self: station.self,
        address: station.address,
        lat: at.lat,
        lng: at.lng,
        gasoline: station.gasoline,
        diesel: station.diesel,
      },
    ];
  });

  return { stations, coords, unresolved, geocoded: toGeocode.length };
}

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

// Nominatim answers with these when it only knows the road, not the building:
// the point is somewhere on that road, possibly far from the station.
const ROAD_TYPES = new Set([
  "road", "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
  "residential", "service", "living_street", "highway",
]);

// And with these when it only knows the area; such a point is no use.
const AREA_TYPES = new Set([
  "neighbourhood", "quarter", "suburb", "city_district", "borough", "city", "town",
  "village", "hamlet", "municipality", "county", "province", "state", "region", "country",
]);

type Precision = "exact" | "road" | "area";

function precisionOf(addressType: string | undefined): Precision {
  if (addressType && ROAD_TYPES.has(addressType)) return "road";
  if (addressType && AREA_TYPES.has(addressType)) return "area";
  return "exact";
}

/** "㈜지에스이앤알 평창주유소" → "평창주유소": drops the operator in front. */
function stationName(name: string) {
  const words = name.replace(/㈜|\(주\)|주식회사/g, " ").trim().split(/\s+/);
  return words.at(-1) ?? name;
}

/**
 * Geocodes with the public Nominatim server, within its usage policy: one
 * request at a time, more than a second apart, with an identifying
 * User-Agent. Tries the road address; when that locates only the road, tries
 * the station name and region and uses it if it finds the station itself.
 * Area-level answers are never used.
 */
export function nominatimGeocoder({
  fetchImpl = fetch,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  userAgent = "bb-project-gas-finder/0.1 (station dataset build)",
}: {
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  userAgent?: string;
} = {}): Geocoder {
  // Requests start at least this far apart, counted from the previous start.
  const MIN_INTERVAL_MS = 1100;
  let lastStart = -Infinity;

  async function search(query: string) {
    const sinceLast = now() - lastStart;
    if (sinceLast < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - sinceLast);
    lastStart = now();
    const url = `${NOMINATIM_SEARCH}?${new URLSearchParams({
      q: query,
      format: "jsonv2",
      countrycodes: "kr",
      limit: "1",
      "accept-language": "ko",
    })}`;
    const res = await fetchImpl(url, { headers: { "User-Agent": userAgent } });
    if (!res.ok) throw new Error(`Nominatim이 ${res.status}로 응답했습니다.`);
    const [first] = (await res.json()) as { lat: string; lon: string; addresstype?: string }[];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, precision: precisionOf(first.addresstype) };
  }

  return async (station) => {
    const address = station.address.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const byAddress = await search(address);
    if (byAddress?.precision === "exact") return { lat: byAddress.lat, lng: byAddress.lng };
    const byName = await search(`${stationName(station.name)} ${station.region}`);
    if (byName?.precision === "exact") return { lat: byName.lat, lng: byName.lng };
    return byAddress?.precision === "road" ? { lat: byAddress.lat, lng: byAddress.lng } : null;
  };
}
