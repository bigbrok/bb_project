import { PlaceSearchError, searchPlace } from "@/features/places/search-place";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  try {
    const place = await searchPlace(query);
    return Response.json({ place });
  } catch (error) {
    if (error instanceof PlaceSearchError) {
      return Response.json({ error: "place_search_unavailable" }, { status: 502 });
    }
    throw error;
  }
}
