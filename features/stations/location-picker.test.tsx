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

function installFakeKakao() {
  mapClick = undefined;
  markers = [];
  vi.stubGlobal("kakao", {
    maps: {
      load: (callback: () => void) => callback(),
      LatLng: FakeLatLng,
      Map: class {
        constructor(
          public container: HTMLElement,
          public options: unknown
        ) {}
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
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});
