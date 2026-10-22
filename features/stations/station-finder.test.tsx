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

test("위치를 얻지 못하면 위치가 필요하다고 안내하고 다시 시도할 수 있다", async () => {
  getCurrentPosition.mockImplementationOnce(
    (_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied" } as GeolocationPositionError)
  );

  render(<StationFinder />);

  expect(await screen.findByText("현재 위치가 필요합니다")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();

  allowLocation();
  fetchMock.mockResolvedValue(
    stationsResponse([{ id: "A", name: "주유소", price: 1500, distance: 100 }])
  );
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await screen.findByText("주유소")).toBeInTheDocument();
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
