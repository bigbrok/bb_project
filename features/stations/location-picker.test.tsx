import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

let fetchMock: ReturnType<typeof vi.fn>;
let getCurrentPosition: ReturnType<typeof vi.fn>;

// Minimal stand-in for the Kakao Maps SDK, the external boundary of the picker.
class FakeLatLng {
  constructor(
    private lat: number,
    private lng: number
  ) {}
  getLat() {
    return this.lat;
  }
  getLng() {
    return this.lng;
  }
}

let mapClick: ((event: { latLng: FakeLatLng }) => void) | undefined;
let markers: { position: FakeLatLng; map: unknown }[];
let mapCenter: FakeLatLng | undefined;
let initialCenter: FakeLatLng | undefined;

type FakePlace = { x: string; y: string };
// Search results the fake SDK returns, keyed by the exact query.
let keywordResults: Record<string, FakePlace[]>;
let addressResults: Record<string, FakePlace[]>;
let keywordQueries: string[];
let addressQueries: string[];

const Status = { OK: "OK", ZERO_RESULT: "ZERO_RESULT", ERROR: "ERROR" };

function respond(table: Record<string, FakePlace[]>, query: string) {
  const found = table[query] ?? [];
  return [found, found.length ? Status.OK : Status.ZERO_RESULT] as const;
}

function installFakeKakao() {
  mapClick = undefined;
  markers = [];
  mapCenter = undefined;
  keywordResults = {};
  addressResults = {};
  keywordQueries = [];
  addressQueries = [];
  vi.stubGlobal("kakao", {
    maps: {
      load: (callback: () => void) => callback(),
      LatLng: FakeLatLng,
      Map: class {
        constructor(
          public container: HTMLElement,
          options: { center: FakeLatLng }
        ) {
          initialCenter = options.center;
        }
        setCenter(position: FakeLatLng) {
          mapCenter = position;
        }
      },
      services: {
        Status,
        Places: class {
          keywordSearch(query: string, callback: (...args: unknown[]) => void) {
            keywordQueries.push(query);
            callback(...respond(keywordResults, query));
          }
        },
        Geocoder: class {
          addressSearch(query: string, callback: (...args: unknown[]) => void) {
            addressQueries.push(query);
            callback(...respond(addressResults, query));
          }
        },
      },
      Marker: class {
        position: FakeLatLng;
        map: unknown = null;
        constructor(options: { position: FakeLatLng }) {
          this.position = options.position;
          markers.push(this);
        }
        setPosition(position: FakeLatLng) {
          this.position = position;
        }
        setMap(map: unknown) {
          this.map = map;
        }
      },
      event: {
        addListener: (_target: unknown, type: string, handler: typeof mapClick) => {
          if (type === "click") mapClick = handler;
        },
      },
    },
  });
}

function clickMap(lat: number, lng: number) {
  act(() => mapClick?.({ latLng: new FakeLatLng(lat, lng) }));
}

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
  vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_KEY", "test-js-key");
  installFakeKakao();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function lookUp(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "장소 또는 주소" }), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
}

const PICKED_STATION = { id: "A", name: "고른곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 };

/** Location is unavailable, so the default place loads first; then open the picker. */
async function openPicker() {
  denyLocation();
  fetchMock.mockResolvedValueOnce(stationsResponse([]));
  render(<StationFinder />);
  fireEvent.click(await screen.findByRole("button", { name: "위치 바꾸기" }));
  await screen.findByRole("region", { name: "위치 고르기 지도" });
}

function searchedPosition(call: number) {
  const url = new URL(fetchMock.mock.calls[call][0], "http://localhost");
  return [url.searchParams.get("lat"), url.searchParams.get("lng")];
}

test("위치 바꾸기를 누르면 입력창과 지도가 열리고, 고르거나 조회하기 전에는 검색할 수 없다", async () => {
  await openPicker();

  expect(screen.getByRole("textbox", { name: "장소 또는 주소" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "조회" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "이 위치로 검색" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("위치 고르기 지도는 마곡나루역에서 시작한다", async () => {
  await openPicker();

  expect([initialCenter?.getLat(), initialCenter?.getLng()]).toEqual([37.5668, 126.827]);
});

test("지도에서 누른 곳에 마커를 놓고, 이 위치로 검색하면 그 지점 기준 목록을 보여 준다", async () => {
  fetchMock.mockResolvedValue(stationsResponse([PICKED_STATION]));
  await openPicker();

  clickMap(37.55, 126.97);
  clickMap(37.5, 127.01);

  expect(markers).toHaveLength(1);
  expect(markers[0].position.getLat()).toBe(37.5);
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
  vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_KEY", "");
  await openPickerExpectingFailure();

  expect(await screen.findByText("지도를 불러오지 못했습니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 위치로 다시 시도" })).toBeInTheDocument();
});

async function openPickerExpectingFailure() {
  denyLocation();
  fetchMock.mockResolvedValueOnce(stationsResponse([]));
  render(<StationFinder />);
  fireEvent.click(await screen.findByRole("button", { name: "위치 바꾸기" }));
}

test("장소 이름을 조회하면 지도를 그 위치로 옮겨 마커를 놓고, 이 위치로 검색할 수 있다", async () => {
  keywordResults["강남역"] = [{ x: "127.0276", y: "37.4979" }];
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "조회한곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 }])
  );
  await openPicker();
  lookUp("강남역");

  expect(keywordQueries).toEqual(["강남역"]);
  await waitFor(() =>
    expect([mapCenter?.getLat(), mapCenter?.getLng()]).toEqual([37.4979, 127.0276])
  );
  expect(markers).toHaveLength(1);
  expect([markers[0].position.getLat(), markers[0].position.getLng()]).toEqual([37.4979, 127.0276]);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  expect(await screen.findByText("조회한곳주유소")).toBeInTheDocument();
  expect(searchedPosition(1)).toEqual(["37.4979", "127.0276"]);
});

test("입력창에서 Enter를 쳐도 조회한다", async () => {
  keywordResults["서울역"] = [{ x: "126.9707", y: "37.5547" }];
  await openPicker();
  const input = screen.getByRole("textbox", { name: "장소 또는 주소" });
  fireEvent.change(input, { target: { value: "서울역" } });
  fireEvent.submit(input);

  expect(keywordQueries).toEqual(["서울역"]);
  await waitFor(() => expect(mapCenter?.getLat()).toBe(37.5547));
});

test("장소 이름으로 찾지 못하면 주소로 다시 찾는다", async () => {
  addressResults["서울 중구 세종대로 110"] = [{ x: "126.978", y: "37.5665" }];
  await openPicker();
  lookUp("서울 중구 세종대로 110");

  expect(addressQueries).toEqual(["서울 중구 세종대로 110"]);
  await waitFor(() =>
    expect([mapCenter?.getLat(), mapCenter?.getLng()]).toEqual([37.5665, 126.978])
  );
  expect(markers).toHaveLength(1);
});

test("조회 결과가 없으면 입력한 말과 함께 찾지 못했다고 알리고 마커는 그대로 둔다", async () => {
  await openPicker();
  clickMap(37.5, 127.01);
  lookUp("없는곳");

  expect(await screen.findByText("'없는곳' 위치를 찾지 못했습니다.")).toBeInTheDocument();
  expect([markers[0].position.getLat(), markers[0].position.getLng()]).toEqual([37.5, 127.01]);
  expect(screen.getByRole("button", { name: "이 위치로 검색" })).toBeEnabled();
});
