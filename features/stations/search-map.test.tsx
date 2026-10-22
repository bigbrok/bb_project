import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

import { leafletState, panMap, resetLeaflet } from "./testing/fake-leaflet";

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

test("목록이 나오면 지도 정중앙에 고정 핀을, 그 둘레에 반경 2km 원을 둔다", async () => {
  render(<StationFinder />);
  await screen.findByText("주유소");

  const map = await screen.findByRole("region", { name: "검색 위치 지도" });
  expect(within(map).getByRole("img", { name: "지도 중심 핀" })).toBeInTheDocument();
  await waitFor(() => expect(leafletState.circles).toHaveLength(1));
  expect(leafletState.circles[0]).toMatchObject({ at: [37.5668, 126.827], radius: 2000 });
  expect(leafletState.maps[0].view).toEqual([37.5668, 126.827]);
});

test("OpenStreetMap 표준 타일을 쓰고 저작자 표시를 붙이며, 휠 확대와 관성은 끈다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leafletState.tiles).toHaveLength(1));

  expect(leafletState.tiles[0].url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  expect(leafletState.tiles[0].options.attribution).toContain("© OpenStreetMap contributors");
  expect(leafletState.maps[0].options.scrollWheelZoom).toBe(false);
  expect(leafletState.maps[0].options.inertia).toBe(false);
});

test("장소를 조회해 검색 기준이 바뀌면 지도도 그 위치로 옮긴다", async () => {
  render(<StationFinder />);
  await waitFor(() => expect(leafletState.circles).toHaveLength(1));

  fireEvent.change(screen.getByRole("textbox", { name: "장소 검색" }), {
    target: { value: "서울역" },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));

  await waitFor(() => expect(leafletState.maps.at(-1)!.view).toEqual([37.5547, 126.9707]));
  expect(leafletState.circles.at(-1)!.at).toEqual([37.5547, 126.9707]);
});

test("위치 바꾸기 버튼은 없고, 위치는 지도 고정 핀으로 옮긴다", async () => {
  render(<StationFinder />);
  await screen.findByRole("region", { name: "검색 위치 지도" });

  expect(screen.queryByRole("button", { name: "위치 바꾸기" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 위치로 다시 시도" })).toBeInTheDocument();
});

function stationsCalls() {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input, "http://localhost"))
    .filter((url) => url.pathname === "/api/stations");
}

async function renderWithMap() {
  render(<StationFinder />);
  await screen.findByText("주유소");
  await waitFor(() => expect(leafletState.circles).toHaveLength(1));
}

test("지도를 옮기면 핀은 가운데 그대로 있고 원이 따라오지만, 옮기기만 해서는 검색하지 않는다", async () => {
  await renderWithMap();

  act(() => panMap(37.56, 126.84));

  expect(leafletState.circles[0].at).toEqual([37.56, 126.84]);
  expect(stationsCalls()).toHaveLength(1);
  expect(
    await screen.findByText("다시 검색을 누르면 핀 위치로 검색합니다.")
  ).toBeInTheDocument();
});

test("지도를 옮긴 뒤 다시 검색을 누르면 핀 위치 기준으로 검색한다", async () => {
  await renderWithMap();

  act(() => panMap(37.56, 126.84));
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));

  await waitFor(() => expect(stationsCalls()).toHaveLength(2));
  expect([stationsCalls()[1].searchParams.get("lat"), stationsCalls()[1].searchParams.get("lng")]).toEqual([
    "37.56",
    "126.84",
  ]);
  expect(await screen.findByText(/고른 위치 반경 2km/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText("다시 검색을 누르면 핀 위치로 검색합니다.")).not.toBeInTheDocument()
  );
});

test("핀 위치로 검색해도 지도를 새로 만들지 않고 그 자리에 둔다", async () => {
  await renderWithMap();

  act(() => panMap(37.56, 126.84));
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await screen.findByText(/고른 위치 반경 2km/);

  expect(leafletState.maps).toHaveLength(1);
  expect(leafletState.maps[0].removed).toBe(false);
  expect(leafletState.maps[0].view).toEqual([37.56, 126.84]);
});

test("지도를 옮기지 않고 다시 검색하면 지금 기준 위치로 다시 검색한다", async () => {
  await renderWithMap();

  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));

  await waitFor(() => expect(stationsCalls()).toHaveLength(2));
  expect(stationsCalls()[1].searchParams.get("lat")).toBe("37.5668");
  expect(screen.getByText(/마곡나루역 반경 2km/)).toBeInTheDocument();
});

test("지도를 옮긴 뒤 기름 종류를 바꿔도 핀 위치는 유지되고, 다시 검색은 핀 위치로 한다", async () => {
  await renderWithMap();

  act(() => panMap(37.56, 126.84));
  fireEvent.click(screen.getByRole("button", { name: "경유" }));
  await waitFor(() => expect(stationsCalls()).toHaveLength(2));
  await screen.findByText("주유소");

  expect(screen.getByText("다시 검색을 누르면 핀 위치로 검색합니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(stationsCalls()).toHaveLength(3));
  expect([stationsCalls()[2].searchParams.get("lat"), stationsCalls()[2].searchParams.get("fuel")]).toEqual([
    "37.56",
    "diesel",
  ]);
});
