import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { StationFinder } from "@/features/stations/station-finder";

const POSITION = { coords: { latitude: 37.4979, longitude: 127.0276 } };

let fetchMock: ReturnType<typeof vi.fn>;
let geocodeReply: () => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stationsCalls() {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input, "http://localhost"))
    .filter((url) => url.pathname === "/api/stations");
}

function geocodeCalls() {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input, "http://localhost"))
    .filter((url) => url.pathname === "/api/geocode");
}

beforeEach(() => {
  geocodeReply = () => json({ place: null });
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/geocode") return geocodeReply();
    const near = url.searchParams.get("lat") === "37.4979" ? "현재위치주유소" : "검색한곳주유소";
    return json({ stations: [{ id: near, name: near, price: 1700, distance: 300 }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      getCurrentPosition: (success: PositionCallback) =>
        success(POSITION as GeolocationPosition),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function placeInput() {
  return screen.getByRole("textbox", { name: "장소 검색" });
}

async function searchPlace(query: string) {
  fireEvent.change(placeInput(), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: "조회" }));
}

test("제목 아래에 장소 입력창과 조회 버튼이 있고, 비어 있으면 조회할 수 없다", async () => {
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  expect(placeInput()).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "조회" })).toBeDisabled();
});

test("장소를 조회하면 그 장소 기준 주유소를 보여 주고 부제목과 저작자 표시를 바꾼다", async () => {
  geocodeReply = () => json({ place: { lat: 37.4943, lng: 127.0296, label: "강남역, 강남구" } });
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  await searchPlace("강남역");

  expect(await screen.findByText("검색한곳주유소")).toBeInTheDocument();
  expect(geocodeCalls()[0].searchParams.get("q")).toBe("강남역");
  const last = stationsCalls().at(-1)!;
  expect([last.searchParams.get("lat"), last.searchParams.get("lng")]).toEqual(["37.4943", "127.0296"]);
  expect(screen.getByText(/강남역 반경 2km/)).toBeInTheDocument();
  expect(screen.getByText(/© OpenStreetMap contributors/)).toBeInTheDocument();
});

test("입력창에서 Enter를 쳐도 조회한다", async () => {
  geocodeReply = () => json({ place: { lat: 37.5547, lng: 126.9707, label: "서울역" } });
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  fireEvent.change(placeInput(), { target: { value: "서울역" } });
  fireEvent.submit(placeInput());

  expect(await screen.findByText("검색한곳주유소")).toBeInTheDocument();
});

test("입력하는 동안에는 장소 검색을 요청하지 않는다", async () => {
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  fireEvent.change(placeInput(), { target: { value: "강" } });
  fireEvent.change(placeInput(), { target: { value: "강남" } });
  fireEvent.change(placeInput(), { target: { value: "강남역" } });

  expect(geocodeCalls()).toHaveLength(0);
});

test("장소를 찾지 못하면 입력한 말과 함께 알리고 기존 목록은 그대로 둔다", async () => {
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  await searchPlace("없는곳");

  expect(await screen.findByText("'없는곳' 위치를 찾지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByText("현재위치주유소")).toBeInTheDocument();
  expect(stationsCalls()).toHaveLength(1);
});

test("장소 검색 서비스가 실패하면 다시 조회하라고 알린다", async () => {
  geocodeReply = () => json({ error: "place_search_unavailable" }, 502);
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");

  await searchPlace("강남역");

  expect(
    await screen.findByText("장소를 검색하지 못했습니다. 잠시 후 다시 조회해 주세요.")
  ).toBeInTheDocument();
});

test("조회한 장소로 검색한 뒤 기름 종류를 바꾸면 같은 장소로, 현재 위치로 다시 시도하면 현재 위치로 검색한다", async () => {
  geocodeReply = () => json({ place: { lat: 37.4943, lng: 127.0296, label: "강남역" } });
  render(<StationFinder />);
  await screen.findByText("현재위치주유소");
  await searchPlace("강남역");
  await screen.findByText("검색한곳주유소");

  fireEvent.click(screen.getByRole("button", { name: "경유" }));
  await waitFor(() => expect(stationsCalls()).toHaveLength(3));
  expect(stationsCalls()[2].searchParams.get("lat")).toBe("37.4943");
  expect(stationsCalls()[2].searchParams.get("fuel")).toBe("diesel");

  await screen.findByText("검색한곳주유소");
  fireEvent.click(screen.getByRole("button", { name: "현재 위치로 다시 시도" }));
  expect(await screen.findByText("현재위치주유소")).toBeInTheDocument();
  expect(screen.queryByText(/© OpenStreetMap contributors/)).not.toBeInTheDocument();
});
