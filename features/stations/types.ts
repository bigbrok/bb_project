export const FUEL_TYPES = ["gasoline", "diesel"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const DEFAULT_FUEL: FuelType = "gasoline";

export const SEARCH_RADIUS_METERS = 2000;

export type Station = {
  id: string;
  name: string;
  /** Won per liter. */
  price: number;
  /** Meters from the search position. */
  distance: number;
};

export function isFuelType(value: string): value is FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value);
}
