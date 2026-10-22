import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

// Stand-in for Leaflet, the external boundary of the search map.
const leaflet = vi.hoisted(() => {
  type LatLng = [number, number];
  const state = {
    maps: [] as { options: Record<string, unknown>; view?: LatLng; zoom?: number; removed: boolean }[],
    tiles: [] as { url: string; options: { attribution?: string } }[],
    markers: [] as { at: LatLng }[],
    circles: [] as { at: LatLng; radius: number }[],
  };
  const addable = <T extends object>(item: T) => Object.assign(item, { addTo: () => item });
  const api = {
    map: (_el: HTMLElement, options: Record<string, unknown>) => {
      const map = {
        options,
        removed: false,
        view: undefined as LatLng | undefined,
        zoom: undefined as number | undefined,
        setView(at: LatLng, zoom: number) {
          map.view = at;
          map.zoom = zoom;
          return map;
        },
        remove() {
          map.removed = true;
        },
      };
      state.maps.push(map);
      return map;
    },
    tileLayer: (url: string, options: { attribution?: string }) => {
      const tile = addable({ url, options });
      state.tiles.push(tile);
      return tile;
    },
    circleMarker: (at: LatLng) => {
      const marker = addable({
        at,
        setLatLng(next: LatLng) {
          marker.at = next;
        },
      });
      state.markers.push(marker);
      return marker;
    },
    circle: (at: LatLng, options: { radius: number }) => {
      const circle = addable({
        at,
        radius: options.radius,
        setLatLng(next: LatLng) {
          circle.at = next;
        },
      });
      state.circles.push(circle);
      return circle;
    },
  };
  return { state, api };
});

vi.mock("leaflet", () => ({ default: leaflet.api, ...leaflet.api }));

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  leaflet.state.maps.length = 0;
  leaflet.state.tiles.length = 0;
  leaflet.state.markers.length = 0;
  leaflet.state.circles.length = 0;
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
  await waitFor(() => expect(leaflet.state.markers).toHaveLength(1));
  expect(leaflet.state.markers[0].at).toEqual([37.5668, 126.827]);
  expect(leaflet.state.circles[0]).toMatchObject({ at: [37.5668, 126.827], radius: 2000 });
  expect(leaflet.state.maps[0].view).toEqual([37.5668, 126.827]);
});

test("OpenStreetMap 표준 타일을 쓰고 저작자 표시를 붙이며, 휠 확대는 끈다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leaflet.state.tiles).toHaveLength(1));

  expect(leaflet.state.tiles[0].url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  expect(leaflet.state.tiles[0].options.attribution).toContain("© OpenStreetMap contributors");
  expect(leaflet.state.maps[0].options.scrollWheelZoom).toBe(false);
});

test("장소를 조회해 검색 기준이 바뀌면 지도도 그 위치로 옮긴다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leaflet.state.markers).toHaveLength(1));

  fireEvent.change(screen.getByRole("textbox", { name: "장소 검색" }), {
    target: { value: "서울역" },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));

  await waitFor(() => expect(leaflet.state.markers.at(-1)!.at).toEqual([37.5547, 126.9707]));
  expect(leaflet.state.circles.at(-1)!.at).toEqual([37.5547, 126.9707]);
  expect(leaflet.state.maps.at(-1)!.view).toEqual([37.5547, 126.9707]);
});

test("위치를 고르는 화면에서는 검색 위치 지도를 보여 주지 않는다", async () => {
  render(<StationFinder />);
  await screen.findByRole("region", { name: "검색 위치 지도" });

  fireEvent.click(screen.getByRole("button", { name: "위치 바꾸기" }));

  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "검색 위치 지도" })).not.toBeInTheDocument()
  );
});
