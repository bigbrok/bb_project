import { searchNearbyStations } from "@/features/stations/search-nearby-stations";
import { stationDataset } from "@/features/stations/station-data";
import { DEFAULT_FUEL, isFuelType } from "@/features/stations/types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat") ?? NaN);
  const lng = Number(params.get("lng") ?? NaN);
  const fuel = params.get("fuel") ?? DEFAULT_FUEL;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isFuelType(fuel)) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  const stations = searchNearbyStations({ lat, lng }, fuel, stationDataset);
  return Response.json({ stations, priceDate: stationDataset.priceDate });
}
