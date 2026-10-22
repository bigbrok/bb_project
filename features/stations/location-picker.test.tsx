import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

import { clickMap as clickLeafletMap, leafletState, resetLeaflet } from "./testing/fake-leaflet";

vi.mock("leaflet", () => import("./testing/fake-leaflet"));

function clickMap(lat: number, lng: number) {
  act(() => clickLeafletMap(lat, lng));
}

const markers = leafletState.markers;

let fetchMock: ReturnType<typeof vi.fn>;
let getCurrentPosition: ReturnType<typeof vi.fn>;

function stationsResponse(stations: unknown[]) {
  return new Response(JSON.stringify({ stations }), {
    headers: { "Content-Type": "application/json" },
  });
}

function denyLocation() {
  getCurrentPosition.mockImplementation(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  getCurrentPosition = vi.fn();
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition },
  });
  resetLeaflet();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PICKED_STATION = { id: "A", name: "고른곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 };

/** Location is unavailable, so the default place loads first; then open the picker. */
async function openPicker() {
  denyLocation();
  fetchMock.mockResolvedValueOnce(stationsResponse([]));
  render(<StationFinder />);
  fireEvent.click(await screen.findByRole("button", { name: "위치 바꾸기" }));
  const picker = await screen.findByRole("region", { name: "위치 고르기 지도" });
  await waitFor(() => expect(picker).toHaveAttribute("aria-busy", "false"));
  // Count only the markers the picker draws, not the search map's.
  markers.length = 0;
}

function searchedPosition(call: number) {
  const url = new URL(fetchMock.mock.calls[call][0], "http://localhost");
  return [url.searchParams.get("lat"), url.searchParams.get("lng")];
}

test("위치 바꾸기를 누르면 지도가 열리고, 지도에서 고르기 전에는 검색할 수 없다", async () => {
  await openPicker();

  expect(screen.getByRole("button", { name: "이 위치로 검색" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("위치 고르기 지도는 마곡나루역에서 시작한다", async () => {
  await openPicker();

  expect(leafletState.maps.at(-1)?.view).toEqual([37.5668, 126.827]);
});

test("지도에서 누른 곳에 마커를 놓고, 이 위치로 검색하면 그 지점 기준 목록을 보여 준다", async () => {
  fetchMock.mockResolvedValue(stationsResponse([PICKED_STATION]));
  await openPicker();

  clickMap(37.55, 126.97);
  clickMap(37.5, 127.01);

  expect(markers).toHaveLength(1);
  expect(markers[0].at).toEqual([37.5, 127.01]);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));

  expect(await screen.findByText("고른곳주유소")).toBeInTheDocument();
  expect(searchedPosition(1)).toEqual(["37.5", "127.01"]);
  expect(screen.getByText(/고른 위치 반경 2km/)).toBeInTheDocument();
});

test("고른 위치로 검색한 뒤에는 기름 종류를 바꾸거나 다시 검색해도 같은 위치를 쓴다", async () => {
  fetchMock.mockImplementation(async () => stationsResponse([PICKED_STATION]));
  await openPicker();
  clickMap(37.5, 127.01);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await screen.findByText("고른곳주유소");

  fireEvent.click(screen.getByRole("button", { name: "경유" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await screen.findByText("고른곳주유소");
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

  for (const call of [1, 2, 3]) expect(searchedPosition(call)).toEqual(["37.5", "127.01"]);
  expect(new URL(fetchMock.mock.calls[2][0], "http://localhost").searchParams.get("fuel")).toBe("diesel");
  // Only the initial attempt asked the browser for its position.
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test("고른 위치로 검색 중에도 위치 바꾸기로 다른 지점을 고를 수 있다", async () => {
  fetchMock.mockImplementation(async () => stationsResponse([PICKED_STATION]));
  await openPicker();
  clickMap(37.5, 127.01);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await screen.findByText("고른곳주유소");

  fireEvent.click(screen.getByRole("button", { name: "위치 바꾸기" }));

  expect(await screen.findByRole("region", { name: "위치 고르기 지도" })).toBeInTheDocument();
  expect(screen.queryByText("고른곳주유소")).not.toBeInTheDocument();
  clickMap(37.4, 127.1);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(searchedPosition(2)).toEqual(["37.4", "127.1"]);
});

test("지도를 불러오지 못하면 안내를 보여 주고, 현재 위치로 다시 시도하는 길은 남는다", async () => {
  await openPickerExpectingFailure();

  expect(await screen.findByText("지도를 불러오지 못했습니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 위치로 다시 시도" })).toBeInTheDocument();
});

async function openPickerExpectingFailure() {
  denyLocation();
  // The default place's map opens first; the picker's map is the one that fails.
  await renderAndFailPickerMap();
}

async function renderAndFailPickerMap() {
  fetchMock.mockResolvedValueOnce(stationsResponse([]));
  render(<StationFinder />);
  const changeLocation = await screen.findByRole("button", { name: "위치 바꾸기" });
  await waitFor(() => expect(leafletState.maps.length).toBeGreaterThan(0));
  leafletState.failNext = true;
  fireEvent.click(changeLocation);
}

test("위치 바꾸기 화면에는 조회 입력창이 따로 없고, 제목 아래 입력창으로 조회하면 그 장소 목록으로 바뀐다", async () => {
  await openPicker();

  expect(screen.queryByRole("textbox", { name: "장소 또는 주소" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);

  fetchMock.mockImplementation(async (input: string) =>
    new URL(input, "http://localhost").pathname === "/api/geocode"
      ? new Response(JSON.stringify({ place: { lat: 37.5547, lng: 126.9707, label: "서울역" } }))
      : stationsResponse([PICKED_STATION])
  );
  fireEvent.change(screen.getByRole("textbox", { name: "장소 검색" }), {
    target: { value: "서울역" },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));

  expect(await screen.findByText("고른곳주유소")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "위치 고르기 지도" })).not.toBeInTheDocument();
  expect(screen.getByText(/서울역 반경 2km/)).toBeInTheDocument();
});

test("개발 모드처럼 effect가 두 번 실행돼도 위치 고르기 지도가 열린다", async () => {
  denyLocation();
  fetchMock.mockResolvedValueOnce(stationsResponse([]));
  render(<StationFinder />, { reactStrictMode: true });
  fireEvent.click(await screen.findByRole("button", { name: "위치 바꾸기" }));

  const picker = await screen.findByRole("region", { name: "위치 고르기 지도" });
  await waitFor(() => expect(picker).toHaveAttribute("aria-busy", "false"));
  expect(screen.queryByText("지도를 불러오지 못했습니다")).not.toBeInTheDocument();
});
