import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

const POSITION = { coords: { latitude: 37.4979, longitude: 127.0276 } };

let fetchMock: ReturnType<typeof vi.fn>;
let getCurrentPosition: ReturnType<typeof vi.fn>;

function stationsResponse(stations: unknown[]) {
  return new Response(JSON.stringify({ stations }), {
    headers: { "Content-Type": "application/json" },
  });
}

function allowLocation() {
  getCurrentPosition.mockImplementation((success: PositionCallback) =>
    success(POSITION as GeolocationPosition)
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("열자마자 현재 위치 기준 휘발유 가격순 목록을 이름·가격·거리와 함께 보여준다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([
      { id: "C", name: "가까운싼주유소", price: 1650, distance: 820.2 },
      { id: "A", name: "비싼주유소", price: 1799, distance: 1530 },
    ])
  );

  render(<StationFinder />);

  const items = await screen.findAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText("가까운싼주유소")).toBeInTheDocument();
  expect(within(items[0]).getByText("1,650원")).toBeInTheDocument();
  expect(within(items[0]).getByText("820m")).toBeInTheDocument();
  expect(within(items[1]).getByText("비싼주유소")).toBeInTheDocument();
  expect(within(items[1]).getByText("1.5km")).toBeInTheDocument();

  const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
  expect(url.pathname).toBe("/api/stations");
  expect(url.searchParams.get("lat")).toBe("37.4979");
  expect(url.searchParams.get("lng")).toBe("127.0276");
  expect(url.searchParams.get("fuel")).toBe("gasoline");
  expect(screen.getByRole("button", { name: "휘발유" })).toHaveAttribute("aria-pressed", "true");
});

test("주유소를 누르면 카카오맵 웹에서 그 위치를 새 탭으로 연다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([
      {
        id: "A",
        name: "SK서광주유소",
        price: 1890,
        distance: 771,
        lat: 37.494342,
        lng: 127.035092,
      },
    ])
  );

  render(<StationFinder />);

  const link = await screen.findByRole("link", { name: /SK서광주유소/ });
  expect(link).toHaveAttribute(
    "href",
    `https://map.kakao.com/link/map/${encodeURIComponent("SK서광주유소")},37.494342,127.035092`
  );
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});

test("이름의 쉼표는 지도 링크에서 빼서 좌표 구분과 겹치지 않게 한다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([
      { id: "A", name: "가,나주유소", price: 1890, distance: 771, lat: 37.5, lng: 127 },
    ])
  );

  render(<StationFinder />);

  const link = await screen.findByRole("link", { name: /가,나주유소/ });
  expect(link).toHaveAttribute(
    "href",
    `https://map.kakao.com/link/map/${encodeURIComponent("가 나주유소")},37.5,127`
  );
});

test("위치가 없는 주유소는 목록에 보이되 지도 링크가 없다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([
      { id: "A", name: "좌표없음", price: 1700, distance: 500, lat: null, lng: null },
    ])
  );

  render(<StationFinder />);

  expect(await screen.findByText("좌표없음")).toBeInTheDocument();
  expect(within(screen.getByRole("listitem")).queryByRole("link")).not.toBeInTheDocument();
});

test("경유로 바꾸면 경유 기준으로 다시 검색한다", async () => {
  allowLocation();
  fetchMock.mockImplementation(async () =>
    stationsResponse([{ id: "A", name: "주유소", price: 1500, distance: 100 }])
  );

  render(<StationFinder />);
  await screen.findByText("주유소");
  fireEvent.click(screen.getByRole("button", { name: "경유" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const url = new URL(fetchMock.mock.calls[1][0], "http://localhost");
  expect(url.searchParams.get("fuel")).toBe("diesel");
  expect(screen.getByRole("button", { name: "경유" })).toHaveAttribute("aria-pressed", "true");
});

test("검색 중에는 로딩 상태를 보여준다", async () => {
  allowLocation();
  fetchMock.mockReturnValue(new Promise(() => {}));

  render(<StationFinder />);

  expect(await screen.findByRole("status")).toHaveTextContent("검색 중");
});

test("근처에 주유소가 없으면 없다고 표시한다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(stationsResponse([]));

  render(<StationFinder />);

  expect(
    await screen.findByText("주변 2km 안에 주유소가 없습니다")
  ).toBeInTheDocument();
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});

test("위치를 얻지 못하면 마곡나루역 기준으로 바로 검색하고 그 사실을 알린다", async () => {
  getCurrentPosition.mockImplementationOnce(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "마곡주유소", price: 1650, distance: 400 }])
  );

  render(<StationFinder />);

  expect(await screen.findByText("마곡주유소")).toBeInTheDocument();
  const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
  expect([url.searchParams.get("lat"), url.searchParams.get("lng")]).toEqual(["37.5668", "126.827"]);
  expect(screen.getByText(/마곡나루역 반경 2km/)).toBeInTheDocument();
  expect(
    screen.getByText("현재 위치를 알 수 없어 마곡나루역 기준으로 보여 줍니다.")
  ).toBeInTheDocument();
});

test("마곡나루역 기준일 때 기름 종류를 바꾸면 위치를 다시 묻지 않고 마곡나루역으로 검색한다", async () => {
  getCurrentPosition.mockImplementationOnce(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );
  fetchMock.mockImplementation(async () =>
    stationsResponse([{ id: "A", name: "마곡주유소", price: 1650, distance: 400 }])
  );

  render(<StationFinder />);
  await screen.findByText("마곡주유소");
  fireEvent.click(screen.getByRole("button", { name: "경유" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const url = new URL(fetchMock.mock.calls[1][0], "http://localhost");
  expect([url.searchParams.get("lat"), url.searchParams.get("fuel")]).toEqual(["37.5668", "diesel"]);
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test("마곡나루역 기준일 때 현재 위치로 다시 시도하면 위치를 새로 얻어 검색한다", async () => {
  getCurrentPosition.mockImplementationOnce(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );
  fetchMock.mockResolvedValueOnce(
    stationsResponse([{ id: "A", name: "마곡주유소", price: 1650, distance: 400 }])
  );

  render(<StationFinder />);
  await screen.findByText("마곡주유소");

  allowLocation();
  fetchMock.mockResolvedValueOnce(
    stationsResponse([{ id: "B", name: "강남주유소", price: 1800, distance: 100 }])
  );
  fireEvent.click(screen.getByRole("button", { name: "현재 위치로 다시 시도" }));

  expect(await screen.findByText("강남주유소")).toBeInTheDocument();
  const url = new URL(fetchMock.mock.calls[1][0], "http://localhost");
  expect(url.searchParams.get("lat")).toBe("37.4979");
  expect(screen.getByText(/현재 위치 반경 2km/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "위치 바꾸기" })).not.toBeInTheDocument();
});

test("가격 정보를 가져오지 못하면 빈 상태와 다른 오류를 보여주고 다시 시도할 수 있다", async () => {
  allowLocation();
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "price_unavailable" }), { status: 502 })
  );

  render(<StationFinder />);

  expect(
    await screen.findByText("가격 정보를 가져오지 못했습니다")
  ).toBeInTheDocument();
  expect(
    screen.queryByText("주변 2km 안에 주유소가 없습니다")
  ).not.toBeInTheDocument();

  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "주유소", price: 1500, distance: 100 }])
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await screen.findByText("주유소")).toBeInTheDocument();
});

test("다시 검색하면 현재 위치를 새로 얻어 목록을 갱신한다", async () => {
  allowLocation();
  fetchMock.mockResolvedValueOnce(
    stationsResponse([{ id: "A", name: "처음주유소", price: 1500, distance: 100 }])
  );

  render(<StationFinder />);
  await screen.findByText("처음주유소");

  fetchMock.mockResolvedValueOnce(
    stationsResponse([{ id: "B", name: "새주유소", price: 1400, distance: 200 }])
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 검색" }));

  expect(await screen.findByText("새주유소")).toBeInTheDocument();
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
});

test("마곡나루역 기준 목록에서 지도에서 보기를 누르면 카카오맵 웹으로 마곡나루역을 연다", async () => {
  getCurrentPosition.mockImplementationOnce(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "마곡주유소", price: 1650, distance: 400 }])
  );

  render(<StationFinder />);

  const link = await screen.findByRole("link", { name: /마곡나루역 지도에서 보기/ });
  expect(link).toHaveAttribute(
    "href",
    `https://map.kakao.com/link/map/${encodeURIComponent("마곡나루역")},37.5668,126.827`
  );
  expect(link).toHaveAttribute("target", "_blank");
});

test("현재 위치 기준 목록에서는 지도에서 보기가 현재 위치를 연다", async () => {
  allowLocation();
  fetchMock.mockResolvedValue(stationsResponse([]));

  render(<StationFinder />);

  const link = await screen.findByRole("link", { name: /현재 위치 지도에서 보기/ });
  expect(link).toHaveAttribute(
    "href",
    `https://map.kakao.com/link/map/${encodeURIComponent("현재 위치")},37.4979,127.0276`
  );
});
