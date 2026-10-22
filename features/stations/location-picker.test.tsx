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
          public options: unknown
        ) {}
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

test("현재 위치를 얻지 못하면 위치를 고를 지도를 보여 주고, 고르기 전에는 검색할 수 없다", async () => {
  denyLocation();

  render(<StationFinder />);

  expect(await screen.findByText("현재 위치를 알 수 없습니다")).toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "위치 고르기 지도" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 위치로 검색" })).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("지도에서 누른 곳에 마커를 놓고, 이 위치로 검색하면 그 지점 기준 목록을 보여 준다", async () => {
  denyLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "고른곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 }])
  );

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });

  clickMap(37.55, 126.97);
  clickMap(37.5, 127.01);

  expect(markers).toHaveLength(1);
  expect(markers[0].position.getLat()).toBe(37.5);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));

  expect(await screen.findByText("고른곳주유소")).toBeInTheDocument();
  const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
  expect(url.searchParams.get("lat")).toBe("37.5");
  expect(url.searchParams.get("lng")).toBe("127.01");
  expect(screen.getByText(/고른 위치 반경 2km/)).toBeInTheDocument();
});

test("고른 위치로 검색한 뒤에는 기름 종류를 바꾸거나 다시 검색해도 같은 위치를 쓴다", async () => {
  denyLocation();
  fetchMock.mockImplementation(async () =>
    stationsResponse([{ id: "A", name: "고른곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 }])
  );

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  clickMap(37.5, 127.01);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await screen.findByText("고른곳주유소");

  fireEvent.click(screen.getByRole("button", { name: "경유" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await screen.findByText("고른곳주유소");
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

  for (const [input] of fetchMock.mock.calls.slice(1)) {
    const url = new URL(input, "http://localhost");
    expect([url.searchParams.get("lat"), url.searchParams.get("lng")]).toEqual(["37.5", "127.01"]);
  }
  expect(new URL(fetchMock.mock.calls[1][0], "http://localhost").searchParams.get("fuel")).toBe("diesel");
  // Only the initial attempt asked the browser for its position.
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test("위치 다시 고르기를 누르면 지도로 돌아가 다른 지점을 고를 수 있다", async () => {
  denyLocation();
  fetchMock.mockImplementation(async () =>
    stationsResponse([{ id: "A", name: "고른곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 }])
  );

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  clickMap(37.5, 127.01);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await screen.findByText("고른곳주유소");

  fireEvent.click(screen.getByRole("button", { name: "위치 다시 고르기" }));

  expect(await screen.findByRole("region", { name: "위치 고르기 지도" })).toBeInTheDocument();
  expect(screen.queryByText("고른곳주유소")).not.toBeInTheDocument();
  clickMap(37.4, 127.1);
  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const url = new URL(fetchMock.mock.calls[1][0], "http://localhost");
  expect([url.searchParams.get("lat"), url.searchParams.get("lng")]).toEqual(["37.4", "127.1"]);
});

test("지도를 불러오지 못하면 안내를 보여 주고, 위치 권한으로 다시 시도할 수 있다", async () => {
  vi.stubEnv("NEXT_PUBLIC_KAKAO_MAP_KEY", "");
  denyLocation();

  render(<StationFinder />);

  expect(await screen.findByText("지도를 불러오지 못했습니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 위치로 다시 시도" })).toBeInTheDocument();
});

function lookUp(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "장소 또는 주소" }), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
}

test("위치를 얻지 못하면 안내 상자 대신 위치 입력창과 조회 버튼을 보여 주고, 비어 있으면 조회할 수 없다", async () => {
  denyLocation();

  render(<StationFinder />);

  expect(await screen.findByRole("textbox", { name: "장소 또는 주소" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "조회" })).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 위치로 다시 시도" })).toBeInTheDocument();
});

test("장소 이름을 조회하면 지도를 그 위치로 옮겨 마커를 놓고, 이 위치로 검색할 수 있다", async () => {
  denyLocation();
  keywordResults["강남역"] = [{ x: "127.0276", y: "37.4979" }];
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "조회한곳주유소", price: 1700, distance: 300, lat: 37.5, lng: 127 }])
  );

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  lookUp("강남역");

  expect(keywordQueries).toEqual(["강남역"]);
  await waitFor(() =>
    expect([mapCenter?.getLat(), mapCenter?.getLng()]).toEqual([37.4979, 127.0276])
  );
  expect(markers).toHaveLength(1);
  expect([markers[0].position.getLat(), markers[0].position.getLng()]).toEqual([37.4979, 127.0276]);
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "이 위치로 검색" }));
  expect(await screen.findByText("조회한곳주유소")).toBeInTheDocument();
  const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
  expect([url.searchParams.get("lat"), url.searchParams.get("lng")]).toEqual(["37.4979", "127.0276"]);
});

test("입력창에서 Enter를 쳐도 조회한다", async () => {
  denyLocation();
  keywordResults["서울역"] = [{ x: "126.9707", y: "37.5547" }];

  render(<StationFinder />);
  const input = await screen.findByRole("textbox", { name: "장소 또는 주소" });
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  fireEvent.change(input, { target: { value: "서울역" } });
  fireEvent.submit(input);

  expect(keywordQueries).toEqual(["서울역"]);
  await waitFor(() => expect(mapCenter?.getLat()).toBe(37.5547));
});

test("장소 이름으로 찾지 못하면 주소로 다시 찾는다", async () => {
  denyLocation();
  addressResults["서울 중구 세종대로 110"] = [{ x: "126.978", y: "37.5665" }];

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  lookUp("서울 중구 세종대로 110");

  expect(addressQueries).toEqual(["서울 중구 세종대로 110"]);
  await waitFor(() =>
    expect([mapCenter?.getLat(), mapCenter?.getLng()]).toEqual([37.5665, 126.978])
  );
  expect(markers).toHaveLength(1);
});

test("조회 결과가 없으면 입력한 말과 함께 찾지 못했다고 알리고 마커는 그대로 둔다", async () => {
  denyLocation();

  render(<StationFinder />);
  await screen.findByRole("region", { name: "위치 고르기 지도" });
  clickMap(37.5, 127.01);
  lookUp("없는곳");

  expect(await screen.findByText("'없는곳' 위치를 찾지 못했습니다.")).toBeInTheDocument();
  expect([markers[0].position.getLat(), markers[0].position.getLng()]).toEqual([37.5, 127.01]);
  expect(screen.getByRole("button", { name: "이 위치로 검색" })).toBeEnabled();
});
