import { afterEach, beforeEach, expect, test, vi } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

// The route keeps a cache and a rate limiter in module state, so each test
// loads a fresh copy of it.
async function loadRoute() {
  vi.resetModules();
  return (await import("@/app/api/geocode/route")).GET;
}

function nominatimResponse(results: unknown[]) {
  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}

function request(query: string) {
  return new Request(`http://localhost/api/geocode?${query}`);
}

const GANGNAM = {
  lat: "37.4942635",
  lon: "127.0296323",
  name: "강남역",
  display_name: "강남역, 강남대로, 역삼1동, 강남구, 서울특별시, 06241, 대한민국",
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("입력한 장소를 대한민국 안에서 하나만 찾도록 Nominatim에 앱을 밝혀 요청한다", async () => {
  const GET = await loadRoute();
  fetchMock.mockResolvedValue(nominatimResponse([GANGNAM]));

  await GET(request(`q=${encodeURIComponent(" 강남역 ")}`));

  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(input);
  expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
  expect(url.searchParams.get("q")).toBe("강남역");
  expect(url.searchParams.get("countrycodes")).toBe("kr");
  expect(url.searchParams.get("limit")).toBe("1");
  expect(url.searchParams.get("format")).toBe("jsonv2");
  expect(new Headers(init.headers).get("User-Agent")).toMatch(/bb-project/);
});

test("찾은 장소의 위도·경도를 숫자로 돌려준다", async () => {
  const GET = await loadRoute();
  fetchMock.mockResolvedValue(nominatimResponse([GANGNAM]));

  const res = await GET(request("q=강남역"));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    place: { lat: 37.4942635, lng: 127.0296323, label: GANGNAM.display_name },
  });
});

test("찾지 못하면 place를 null로 돌려준다", async () => {
  const GET = await loadRoute();
  fetchMock.mockResolvedValue(nominatimResponse([]));

  const res = await GET(request("q=없는곳"));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ place: null });
});

test("검색어가 비어 있으면 400을 돌려주고 Nominatim을 부르지 않는다", async () => {
  const GET = await loadRoute();

  for (const query of ["", "q=", "q=%20%20"]) {
    expect((await GET(request(query))).status).toBe(400);
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("Nominatim이 실패하거나 네트워크가 끊기면 502를 돌려준다", async () => {
  const GET = await loadRoute();
  fetchMock.mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }));
  expect((await GET(request("q=강남역"))).status).toBe(502);

  vi.useFakeTimers();
  fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
  const pending = GET(request("q=서울역"));
  await vi.advanceTimersByTimeAsync(1000);
  expect((await pending).status).toBe(502);
});

test("같은 검색어는 다시 요청하지 않고 저장해 둔 결과를 쓴다", async () => {
  const GET = await loadRoute();
  fetchMock.mockResolvedValue(nominatimResponse([GANGNAM]));

  await GET(request("q=강남역"));
  const second = await GET(request("q=%20강남역%20"));

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await second.json()).place.lat).toBe(37.4942635);
});

test("앱 전체에서 Nominatim 요청은 1초에 한 번을 넘지 않는다", async () => {
  vi.useFakeTimers();
  const GET = await loadRoute();
  fetchMock.mockImplementation(async () => nominatimResponse([GANGNAM]));

  const first = GET(request("q=강남역"));
  const second = GET(request("q=서울역"));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(999);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await Promise.all([first, second]);
});
