export const FUEL_TYPES = ["gasoline", "diesel"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const DEFAULT_FUEL: FuelType = "gasoline";

export const SEARCH_RADIUS_METERS = 2000;

/** A WGS84 position. */
export type Position = { lat: number; lng: number };

/** Where searches center when the device's position is unavailable (approximate). */
export const DEFAULT_PLACE = { name: "마곡나루역", lat: 37.5668, lng: 126.827 };

/** One station in `data/stations.json`, built from Opinet's CSV. */
export type StationRecord = {
  id: string;
  name: string;
  brand: string;
  self: boolean;
  address: string;
  lat: number;
  lng: number;
  /** Won per liter; null when the station does not sell it. */
  gasoline: number | null;
  diesel: number | null;
};

export type StationDataset = {
  /** The day the prices were downloaded (YYYY-MM-DD); null before the first build. */
  priceDate: string | null;
  stations: StationRecord[];
};

export type Station = {
  id: string;
  name: string;
  /** Won per liter. */
  price: number;
  /** Meters from the search position. */
  distance: number;
  /** WGS84 position of the station; null when Opinet gives no coordinates. */
  lat: number | null;
  lng: number | null;
};

export function isFuelType(value: string): value is FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value);
}
