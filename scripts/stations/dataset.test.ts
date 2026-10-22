import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

import {
  buildDataset,
  kakaoGeocoder,
  nominatimGeocoder,
  parseOpinetCsv,
  type CsvStation,
} from "./dataset";

const sample = readFileSync(join(__dirname, "fixtures", "opinet-sample.csv"));

function station(overrides: Partial<CsvStation> = {}): CsvStation {
  return {
    id: "A0000035",
    region: "서울 종로구",
    name: "평창주유소",
    address: "서울 종로구 평창문화로 135 (평창동)",
    brand: "HD현대오일뱅크",
    self: true,
    gasoline: 1999,
    diesel: 1994,
    ...overrides,
  };
}

function kakaoReply(documents: { x: string; y: string }[]) {
  return new Response(JSON.stringify({ documents, meta: { total_count: documents.length } }), {
    headers: { "Content-Type": "application/json" },
  });
}

test("오피넷 CP949 CSV를 읽어 주유소 이름·주소·휘발유·경유 가격을 꺼낸다", () => {
  const rows = parseOpinetCsv(sample);

  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual({
    id: "A0000035",
    region: "서울 종로구",
    name: "㈜지에스이앤알 평창주유소",
    address: "서울 종로구 평창문화로 135 (평창동)",
    brand: "HD현대오일뱅크",
    self: true,
    gasoline: 1999,
    diesel: 1994,
  });
});

test("판매하지 않는 기름(가격 0)은 null로 둔다", () => {
  const [, noGasoline, noDiesel] = parseOpinetCsv(sample);

  expect(noGasoline).toMatchObject({ self: false, gasoline: null, diesel: 1994 });
  expect(noDiesel).toMatchObject({ gasoline: 1850, diesel: null });
});

test("머리행이 오피넷 형식과 다르면 바로 알린다", () => {
  const wrong = new TextEncoder().encode("id,name\r\nA,B\r\n");

  expect(() => parseOpinetCsv(wrong)).toThrow(/열/);
});

test("카카오 주소 검색으로 좌표를 찾고, 괄호 속 동 이름은 빼고 묻는다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(kakaoReply([{ x: "126.9690", y: "37.6120" }]));
  const geocode = kakaoGeocoder("rest-key", fetchMock);

  expect(await geocode(station())).toEqual({ lat: 37.612, lng: 126.969 });

  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(input);
  expect(url.origin + url.pathname).toBe("https://dapi.kakao.com/v2/local/search/address.json");
  expect(url.searchParams.get("query")).toBe("서울 종로구 평창문화로 135");
  expect(new Headers(init.headers).get("Authorization")).toBe("KakaoAK rest-key");
});

test("주소로 못 찾으면 상호와 지역으로 키워드 검색을 한다", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(kakaoReply([]))
    .mockResolvedValueOnce(kakaoReply([{ x: "126.97", y: "37.61" }]));
  const geocode = kakaoGeocoder("rest-key", fetchMock);

  expect(await geocode(station())).toEqual({ lat: 37.61, lng: 126.97 });

  const url = new URL(fetchMock.mock.calls[1][0]);
  expect(url.pathname).toBe("/v2/local/search/keyword.json");
  expect(url.searchParams.get("query")).toBe("평창주유소 서울 종로구");
});

test("둘 다 못 찾으면 null을 돌려준다", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => kakaoReply([]));

  expect(await kakaoGeocoder("rest-key", fetchMock)(station())).toBeNull();
});

test("키가 틀렸거나 카카오맵 사용 설정이 꺼져 있으면 멈추고 이유를 알린다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ errorType: "NotAuthorizedError", message: "disabled OPEN_MAP_AND_LOCAL service." }), {
      status: 403,
    })
  );

  await expect(kakaoGeocoder("rest-key", fetchMock)(station())).rejects.toThrow(/403/);
});

test("데이터셋은 좌표를 붙인 주유소만 담고, 못 찾은 주유소는 따로 알린다", async () => {
  const geocode = vi.fn(async (s: CsvStation) => (s.id === "B" ? null : { lat: 37.5, lng: 127 }));

  const result = await buildDataset([station({ id: "A" }), station({ id: "B" })], {}, geocode);

  expect(result.stations).toEqual([
    {
      id: "A",
      name: "평창주유소",
      brand: "HD현대오일뱅크",
      self: true,
      address: "서울 종로구 평창문화로 135 (평창동)",
      lat: 37.5,
      lng: 127,
      gasoline: 1999,
      diesel: 1994,
    },
  ]);
  expect(result.unresolved.map((s) => s.id)).toEqual(["B"]);
  expect(result.coords.A).toEqual({ address: "서울 종로구 평창문화로 135 (평창동)", lat: 37.5, lng: 127 });
});

test("주소가 그대로인 주유소는 저장해 둔 좌표를 쓰고 다시 묻지 않는다", async () => {
  const geocode = vi.fn<(station: CsvStation) => Promise<{ lat: number; lng: number }>>(async () => ({ lat: 1, lng: 1 }));
  const cache = {
    A: { address: "서울 종로구 평창문화로 135 (평창동)", lat: 37.6, lng: 126.9 },
    B: { address: "예전 주소", lat: 35, lng: 129 },
  };

  const result = await buildDataset([station({ id: "A" }), station({ id: "B" })], cache, geocode);

  expect(geocode).toHaveBeenCalledTimes(1);
  expect(geocode.mock.calls[0][0].id).toBe("B");
  expect(result.stations.find((s) => s.id === "A")).toMatchObject({ lat: 37.6, lng: 126.9 });
  expect(result.coords.B).toMatchObject({ address: "서울 종로구 평창문화로 135 (평창동)", lat: 1 });
});

function nominatimReply(results: { lat: string; lon: string; addresstype: string }[]) {
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
}

test("Nominatim은 주소로 찾은 결과가 건물이면 그 좌표를 쓰고, 앱을 밝혀 대한민국 안에서 하나만 묻는다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    nominatimReply([{ lat: "37.612", lon: "126.969", addresstype: "building" }])
  );
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station())).toEqual({ lat: 37.612, lng: 126.969 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(input);
  expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
  expect(url.searchParams.get("q")).toBe("서울 종로구 평창문화로 135");
  expect(url.searchParams.get("countrycodes")).toBe("kr");
  expect(url.searchParams.get("limit")).toBe("1");
  expect(new Headers(init.headers).get("User-Agent")).toMatch(/bb-project/);
});

test("Nominatim이 주소를 도로 단위로만 찾으면 주유소 이름으로 다시 찾아 더 정확한 쪽을 쓴다", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.6", lon: "126.9", addresstype: "road" }]))
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.611", lon: "126.968", addresstype: "amenity" }]));
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station({ name: "㈜지에스이앤알 평창주유소" }))).toEqual({ lat: 37.611, lng: 126.968 });

  const url = new URL(fetchMock.mock.calls[1][0]);
  expect(url.searchParams.get("q")).toBe("평창주유소 서울 종로구");
});

test("이름으로도 못 찾으면 도로 단위 좌표라도 쓴다", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.6", lon: "126.9", addresstype: "road" }]))
    .mockResolvedValueOnce(nominatimReply([]));
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station())).toEqual({ lat: 37.6, lng: 126.9 });
});

test("주소와 이름 모두 못 찾으면 null을 돌려준다", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => nominatimReply([]));
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station())).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("Nominatim 요청은 직전 요청을 보낸 때부터 1초 넘게 지나야 보낸다", async () => {
  // A fake clock: waiting and each response (300ms) move time forward.
  let clock = 0;
  const starts: number[] = [];
  const fetchMock = vi.fn().mockImplementation(async () => {
    starts.push(clock);
    clock += 300;
    return nominatimReply([]);
  });
  const geocode = nominatimGeocoder({
    fetchImpl: fetchMock,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });

  await geocode(station());
  await geocode(station({ id: "B" }));

  expect(starts).toHaveLength(4);
  for (let i = 1; i < starts.length; i++) {
    expect(starts[i] - starts[i - 1]).toBeGreaterThan(1000);
  }
  // The response time counts toward the gap, so the app does not wait extra.
  expect(starts[1] - starts[0]).toBe(1100);
});

test("이름 검색이 행정구역만 찾으면 버리고 주소로 찾은 도로 좌표를 쓴다", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.6", lon: "126.9", addresstype: "road" }]))
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.57", lon: "126.98", addresstype: "city_district" }]));
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station())).toEqual({ lat: 37.6, lng: 126.9 });
});

test("주소 검색도 행정구역만 찾고 이름으로도 못 찾으면 null을 돌려준다", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(nominatimReply([{ lat: "37.57", lon: "126.98", addresstype: "suburb" }]))
    .mockResolvedValueOnce(nominatimReply([]));
  const geocode = nominatimGeocoder({ fetchImpl: fetchMock, wait: async () => {} });

  expect(await geocode(station())).toBeNull();
});
