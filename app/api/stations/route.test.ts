import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GET } from "@/app/api/stations/route";

const CERT_KEY = "test-cert-key";

function opinetResponse(oil: unknown[]) {
  return new Response(JSON.stringify({ RESULT: { OIL: oil } }), {
    headers: { "Content-Type": "application/json" },
  });
}

function request(query: string) {
  return new Request(`http://localhost/api/stations?${query}`);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPINET_API_KEY", CERT_KEY);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("현재 위치를 KATEC으로 바꿔 반경 2km 휘발유 가격순으로 오피넷을 검색한다", async () => {
  fetchMock.mockResolvedValue(opinetResponse([]));

  await GET(request("lat=37.4979&lng=127.0276"));

  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe(
    "https://www.opinet.co.kr/api/aroundAll.do"
  );
  expect(url.searchParams.get("radius")).toBe("2000");
  expect(url.searchParams.get("prodcd")).toBe("B027");
  expect(url.searchParams.get("sort")).toBe("1");
  expect(url.searchParams.get("out")).toBe("json");
  expect(url.searchParams.get("certkey")).toBe(CERT_KEY);
  // 강남역 근처: 오피넷 예시 좌표(314681.8, 544837)와 같은 지역이다.
  expect(Number(url.searchParams.get("x"))).toBeCloseTo(314213, -1);
  expect(Number(url.searchParams.get("y"))).toBeCloseTo(544414, -1);
});

test("경유를 고르면 경유 코드로 검색한다", async () => {
  fetchMock.mockResolvedValue(opinetResponse([]));

  await GET(request("lat=37.4979&lng=127.0276&fuel=diesel"));

  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.searchParams.get("prodcd")).toBe("D047");
});

test("주유소를 가격이 싼 순서로, 같은 가격이면 가까운 순서로 돌려준다", async () => {
  fetchMock.mockResolvedValue(
    opinetResponse([
      { UNI_ID: "A", OS_NM: "비싼주유소", PRICE: 1799, DISTANCE: 300 },
      { UNI_ID: "B", OS_NM: "먼싼주유소", PRICE: 1650, DISTANCE: 1500.5 },
      { UNI_ID: "C", OS_NM: "가까운싼주유소", PRICE: 1650, DISTANCE: 820.2 },
    ])
  );

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(200);
  const { stations } = await res.json();
  expect(
    stations.map(({ id, name, price, distance }: Record<string, unknown>) => ({
      id,
      name,
      price,
      distance,
    }))
  ).toEqual([
    { id: "C", name: "가까운싼주유소", price: 1650, distance: 820.2 },
    { id: "B", name: "먼싼주유소", price: 1650, distance: 1500.5 },
    { id: "A", name: "비싼주유소", price: 1799, distance: 300 },
  ]);
});

test("주유소 위치를 오피넷 KATEC 좌표에서 위도·경도로 바꿔 돌려준다", async () => {
  fetchMock.mockResolvedValue(
    opinetResponse([
      {
        UNI_ID: "A0009879",
        OS_NM: "SK서광주유소",
        PRICE: 1890,
        DISTANCE: 771,
        // Opinet's documented KATEC coordinates for this station (역삼동).
        GIS_X_COOR: 314871.8,
        GIS_Y_COOR: 544012.0,
      },
    ])
  );

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  const [station] = (await res.json()).stations;
  expect(station.lat).toBeCloseTo(37.4943, 3);
  expect(station.lng).toBeCloseTo(127.0351, 3);
});

test("좌표가 없는 주유소도 목록에 남기고 위치만 비워 둔다", async () => {
  fetchMock.mockResolvedValue(
    opinetResponse([{ UNI_ID: "A", OS_NM: "좌표없음", PRICE: 1700, DISTANCE: 500 }])
  );

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(200);
  const [station] = (await res.json()).stations;
  expect(station).toMatchObject({ id: "A", lat: null, lng: null });
});

test("2km를 넘는 주유소는 목록에서 뺀다", async () => {
  fetchMock.mockResolvedValue(
    opinetResponse([
      { UNI_ID: "A", OS_NM: "안쪽", PRICE: 1700, DISTANCE: 1999 },
      { UNI_ID: "B", OS_NM: "바깥", PRICE: 1600, DISTANCE: 2000.1 },
    ])
  );

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  const body = await res.json();
  expect(body.stations.map((s: { id: string }) => s.id)).toEqual(["A"]);
});

test("근처에 주유소가 없으면 빈 목록을 돌려준다", async () => {
  fetchMock.mockResolvedValue(opinetResponse([]));

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ stations: [] });
});

test("오피넷 응답이 실패하면 502를 돌려주고 인증키를 드러내지 않는다", async () => {
  fetchMock.mockResolvedValue(
    new Response(`error certkey=${CERT_KEY}`, { status: 500 })
  );

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(502);
  expect(await res.text()).not.toContain(CERT_KEY);
});

test("오피넷 응답 형식이 예상과 다르면 502를 돌려준다", async () => {
  fetchMock.mockResolvedValue(new Response("호출 한도를 초과했습니다"));

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(502);
});

test("네트워크 오류가 나도 502를 돌려준다", async () => {
  fetchMock.mockRejectedValue(new TypeError("fetch failed"));

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(502);
});

test("위치나 기름 종류가 올바르지 않으면 400을 돌려주고 오피넷을 부르지 않는다", async () => {
  for (const query of ["lng=127.0276", "lat=abc&lng=127", "lat=37&lng=127&fuel=lpg"]) {
    const res = await GET(request(query));
    expect(res.status).toBe(400);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("인증키가 설정되지 않으면 500을 돌려준다", async () => {
  vi.stubEnv("OPINET_API_KEY", "");

  const res = await GET(request("lat=37.4979&lng=127.0276"));

  expect(res.status).toBe(500);
  expect(fetchMock).not.toHaveBeenCalled();
});
