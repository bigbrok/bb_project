import { SEARCH_RADIUS_METERS, type FuelType, type Position, type Station, type StationDataset } from "./types";

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in meters (haversine). */
function distanceMeters(a: Position, b: Position) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Stations within the search radius that sell the fuel, cheapest first and
 * nearest first among equal prices.
 */
export function searchNearbyStations(
  position: Position,
  fuel: FuelType,
  dataset: StationDataset
): Station[] {
  return dataset.stations
    .flatMap((record) => {
      const price = record[fuel];
      if (price == null) return [];
      const distance = Math.round(distanceMeters(position, record) * 10) / 10;
      if (distance > SEARCH_RADIUS_METERS) return [];
      return [{ id: record.id, name: record.name, price, distance, lat: record.lat, lng: record.lng }];
    })
    .sort((a, b) => a.price - b.price || a.distance - b.distance);
}
