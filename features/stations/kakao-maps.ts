// The subset of the Kakao Maps JavaScript SDK this app uses.
export type KakaoLatLng = { getLat(): number; getLng(): number };

export type KakaoMap = { setCenter(position: KakaoLatLng): void };

type KakaoStatus = "OK" | "ZERO_RESULT" | "ERROR";

/** A search result; x is longitude and y is latitude, both as strings. */
type KakaoPlace = { x: string; y: string };

type KakaoSearchCallback = (result: KakaoPlace[], status: KakaoStatus) => void;

export type KakaoMarker = {
  setPosition(position: KakaoLatLng): void;
  setMap(map: KakaoMap | null): void;
};

export type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number }
  ) => KakaoMap;
  Marker: new (options: { position: KakaoLatLng }) => KakaoMarker;
  event: {
    addListener(
      target: KakaoMap,
      type: "click",
      handler: (event: { latLng: KakaoLatLng }) => void
    ): void;
  };
  services: {
    Status: Record<KakaoStatus, KakaoStatus>;
    Places: new () => {
      keywordSearch(keyword: string, callback: KakaoSearchCallback): void;
    };
    Geocoder: new () => {
      addressSearch(address: string, callback: KakaoSearchCallback): void;
    };
  };
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let pending: Promise<KakaoMaps> | null = null;

function whenReady(maps: KakaoMaps) {
  return new Promise<KakaoMaps>((resolve) => maps.load(() => resolve(maps)));
}

/** Loads the Kakao Maps SDK once and resolves when it is ready to use. */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) return Promise.reject(new Error("Kakao Maps key is not set"));
  if (window.kakao?.maps) return whenReady(window.kakao.maps);

  pending ??= new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    script.async = true;
    const fail = () => {
      pending = null;
      script.remove();
      reject(new Error("Kakao Maps SDK failed to load"));
    };
    script.onload = () => {
      if (window.kakao?.maps) whenReady(window.kakao.maps).then(resolve);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return pending;
}

/**
 * Finds a position for a place name or an address: tries a place search
 * first and falls back to an address search. Null when neither finds it.
 */
export function findPlace(
  maps: KakaoMaps,
  query: string
): Promise<{ lat: number; lng: number } | null> {
  const { services } = maps;
  const firstHit: (result: KakaoPlace[], status: KakaoStatus) => KakaoPlace | null = (
    result,
    status
  ) => (status === services.Status.OK && result[0] ? result[0] : null);
  const toPosition = (place: KakaoPlace) => ({ lat: Number(place.y), lng: Number(place.x) });

  return new Promise((resolve) => {
    new services.Places().keywordSearch(query, (result, status) => {
      const place = firstHit(result, status);
      if (place) return resolve(toPosition(place));
      new services.Geocoder().addressSearch(query, (addresses, addressStatus) => {
        const address = firstHit(addresses, addressStatus);
        resolve(address ? toPosition(address) : null);
      });
    });
  });
}
