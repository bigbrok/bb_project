import { beforeEach, expect, test, vi } from "vitest";

import type { StationDataset, StationRecord } from "@/features/stations/types";

const dataset = vi.hoisted((): StationDataset => ({ priceDate: "2026-10-22", stations: [] }));
vi.mock("@/features/stations/station-data", () => ({ stationDataset: dataset }));

import { GET } from "@/app/api/stations/route";

// The search point. At latitude 37.5 one degree of longitude is about 88.3km,
// so 0.01° east is about 883m and 0.03° east about 2.65km.
const ORIGIN = { lat: 37.5, lng: 127 };

function record(overrides: Partial<StationRecord>): StationRecord {
  return {
    id: "X",
    name: "주유소",
    brand: "GS칼텍스",
    self: false,
    address: "주소",
    lat: ORIGIN.lat,
    lng: ORIGIN.lng,
    gasoline: 1800,
    diesel: 1700,
    ...overrides,
  };
}

function request(query: string) {
  return new Request(`http://localhost/api/stations?${query}`);
}

function setStations(stations: StationRecord[], priceDate: StationDataset["priceDate"] = "2026-10-22") {
  dataset.stations = stations;
  dataset.priceDate = priceDate;
}

beforeEach(() => setStations([]));

test("반경 2km 안의 주유소만 휘발유 가격순으로 돌려주고 가격 기준일을 함께 준다", async () => {
  setStations([
    record({ id: "near-cheap", gasoline: 1650, lng: ORIGIN.lng + 0.01 }),
    record({ id: "far", gasoline: 1500, lng: ORIGIN.lng + 0.03 }),
    record({ id: "here", gasoline: 1700 }),
  ]);

  const res = await GET(request(`lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`));

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.priceDate).toBe("2026-10-22");
  expect(body.stations.map((s: { id: string }) => s.id)).toEqual(["near-cheap", "here"]);
  expect(body.stations[0].distance).toBeGreaterThan(870);
  expect(body.stations[0].distance).toBeLessThan(895);
  expect(body.stations[1].distance).toBe(0);
});

test("목록 항목은 이름·가격·거리·좌표를 담는다", async () => {
  setStations([record({ id: "A", name: "평창주유소", gasoline: 1999, lat: 37.501, lng: 127 })]);

  const res = await GET(request(`lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`));

  const [station] = (await res.json()).stations;
  expect(station).toMatchObject({ id: "A", name: "평창주유소", price: 1999, lat: 37.501, lng: 127 });
  // 0.001° of latitude is about 111m.
  expect(station.distance).toBeCloseTo(111.2, 0);
});

test("경유를 고르면 경유 가격으로 정렬하고, 같은 가격이면 가까운 곳을 먼저 둔다", async () => {
  setStations([
    record({ id: "far-same", diesel: 1600, lng: ORIGIN.lng + 0.015 }),
    record({ id: "near-same", diesel: 1600, lng: ORIGIN.lng + 0.005 }),
    record({ id: "pricier", diesel: 1650 }),
  ]);

  const res = await GET(request(`lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&fuel=diesel`));

  const body = await res.json();
  expect(body.stations.map((s: { id: string; price: number }) => [s.id, s.price])).toEqual([
    ["near-same", 1600],
    ["far-same", 1600],
    ["pricier", 1650],
  ]);
});

test("그 기름을 팔지 않는 주유소는 목록에서 뺀다", async () => {
  setStations([record({ id: "no-diesel", diesel: null }), record({ id: "diesel", diesel: 1700 })]);

  const res = await GET(request(`lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&fuel=diesel`));

  expect((await res.json()).stations.map((s: { id: string }) => s.id)).toEqual(["diesel"]);
});

test("근처에 주유소가 없으면 빈 목록을 돌려준다", async () => {
  setStations([record({ id: "far", lat: 35.1, lng: 129 })]);

  const res = await GET(request(`lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ stations: [], priceDate: "2026-10-22" });
});

test("위치나 기름 종류가 올바르지 않으면 400을 돌려준다", async () => {
  for (const query of ["lng=127", "lat=abc&lng=127", "lat=37&lng=127&fuel=lpg"]) {
    expect((await GET(request(query))).status).toBe(400);
  }
});
