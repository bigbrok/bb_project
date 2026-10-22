import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

import { leafletState, resetLeaflet } from "./testing/fake-leaflet";

vi.mock("leaflet", () => import("./testing/fake-leaflet"));

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  resetLeaflet();
  fetchMock = vi.fn(async (input: string) =>
    new URL(input, "http://localhost").pathname === "/api/geocode"
      ? json({ place: { lat: 37.5547, lng: 126.9707, label: "서울역" } })
      : json({ stations: [{ id: "A", name: "주유소", price: 1700, distance: 300 }] })
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      getCurrentPosition: (_ok: PositionCallback, error: PositionErrorCallback) =>
        error({ code: 1, message: "denied" } as GeolocationPositionError),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("목록이 나오면 바로 아래 지도에 검색 위치 마커와 반경 2km 원을 그린다", async () => {
  render(<StationFinder />);
  await screen.findByText("주유소");

  expect(await screen.findByRole("region", { name: "검색 위치 지도" })).toBeInTheDocument();
  await waitFor(() => expect(leafletState.markers).toHaveLength(1));
  expect(leafletState.markers[0].at).toEqual([37.5668, 126.827]);
  expect(leafletState.circles[0]).toMatchObject({ at: [37.5668, 126.827], radius: 2000 });
  expect(leafletState.maps[0].view).toEqual([37.5668, 126.827]);
});

test("OpenStreetMap 표준 타일을 쓰고 저작자 표시를 붙이며, 휠 확대는 끈다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leafletState.tiles).toHaveLength(1));

  expect(leafletState.tiles[0].url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  expect(leafletState.tiles[0].options.attribution).toContain("© OpenStreetMap contributors");
  expect(leafletState.maps[0].options.scrollWheelZoom).toBe(false);
});

test("장소를 조회해 검색 기준이 바뀌면 지도도 그 위치로 옮긴다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leafletState.markers).toHaveLength(1));

  fireEvent.change(screen.getByRole("textbox", { name: "장소 검색" }), {
    target: { value: "서울역" },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));

  await waitFor(() => expect(leafletState.markers.at(-1)!.at).toEqual([37.5547, 126.9707]));
  expect(leafletState.circles.at(-1)!.at).toEqual([37.5547, 126.9707]);
  expect(leafletState.maps.at(-1)!.view).toEqual([37.5547, 126.9707]);
});

test("위치를 고르는 화면에서는 검색 위치 지도를 보여 주지 않는다", async () => {
  render(<StationFinder />);
  await screen.findByRole("region", { name: "검색 위치 지도" });

  fireEvent.click(screen.getByRole("button", { name: "위치 바꾸기" }));

  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "검색 위치 지도" })).not.toBeInTheDocument()
  );
});
