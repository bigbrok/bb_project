import {
  searchNearbyStations,
  StationSearchError,
} from "@/features/stations/search-nearby-stations";
import { DEFAULT_FUEL, isFuelType } from "@/features/stations/types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat") ?? NaN);
  const lng = Number(params.get("lng") ?? NaN);
  const fuel = params.get("fuel") ?? DEFAULT_FUEL;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isFuelType(fuel)) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  const certKey = process.env.OPINET_API_KEY;
  if (!certKey) {
    return Response.json({ error: "missing_api_key" }, { status: 500 });
  }

  try {
    const stations = await searchNearbyStations({ lat, lng }, fuel, certKey);
    return Response.json({ stations });
  } catch (error) {
    if (error instanceof StationSearchError) {
      return Response.json({ error: "price_unavailable" }, { status: 502 });
    }
    throw error;
  }
}
