// Stand-in for Leaflet, the external boundary of the app's maps. Tests install
// it with `vi.mock("leaflet", () => import("./testing/fake-leaflet"))`.

type LatLng = [number, number];
type LatLngInput = LatLng | { lat: number; lng: number };

const toPair = (at: LatLngInput): LatLng => (Array.isArray(at) ? at : [at.lat, at.lng]);

type FakeMap = {
  options: Record<string, unknown>;
  view?: LatLng;
  zoom?: number;
  removed: boolean;
  handlers: Record<string, (event: unknown) => void>;
};

export const leafletState = {
  maps: [] as FakeMap[],
  tiles: [] as { url: string; options: { attribution?: string } }[],
  markers: [] as { at: LatLng }[],
  circles: [] as { at: LatLng; radius: number }[],
  /** When true, the next map fails to open, as if Leaflet could not load. */
  failNext: false,
};

export function resetLeaflet() {
  leafletState.maps.length = 0;
  leafletState.tiles.length = 0;
  leafletState.markers.length = 0;
  leafletState.circles.length = 0;
  leafletState.failNext = false;
}

/** Simulates a click on the most recently opened map. */
export function clickMap(lat: number, lng: number) {
  leafletState.maps.at(-1)?.handlers.click?.({ latlng: { lat, lng } });
}

/** Simulates the user dragging the most recently opened map to a new center. */
export function panMap(lat: number, lng: number) {
  const target = leafletState.maps.at(-1);
  if (!target) return;
  target.view = [lat, lng];
  target.handlers.move?.({});
  target.handlers.moveend?.({});
}

function addable<T extends object>(item: T) {
  return Object.assign(item, { addTo: () => item });
}

// Like Leaflet, a container holds at most one live map.
const liveContainers = new WeakSet<HTMLElement>();

export function map(container: HTMLElement, options: Record<string, unknown>) {
  if (leafletState.failNext) {
    leafletState.failNext = false;
    throw new Error("Leaflet failed to load");
  }
  if (liveContainers.has(container)) throw new Error("Map container is already initialized.");
  liveContainers.add(container);
  const created: FakeMap & {
    setView(at: LatLngInput, zoom: number): typeof created;
    getCenter(): { lat: number; lng: number };
    on(type: string, handler: (event: unknown) => void): typeof created;
    remove(): void;
  } = {
    options,
    removed: false,
    handlers: {},
    setView(at, zoom) {
      created.view = toPair(at);
      created.zoom = zoom;
      return created;
    },
    getCenter() {
      const [lat, lng] = created.view ?? [0, 0];
      return { lat, lng };
    },
    on(type, handler) {
      created.handlers[type] = handler;
      return created;
    },
    remove() {
      created.removed = true;
      liveContainers.delete(container);
    },
  };
  leafletState.maps.push(created);
  return created;
}

export function tileLayer(url: string, options: { attribution?: string }) {
  const tile = addable({ url, options });
  leafletState.tiles.push(tile);
  return tile;
}

export function circleMarker(at: LatLngInput) {
  const marker = addable({
    at: toPair(at),
    setLatLng(next: LatLngInput) {
      marker.at = toPair(next);
    },
  });
  leafletState.markers.push(marker);
  return marker;
}

export function circle(at: LatLngInput, options: { radius: number }) {
  const created = addable({
    at: toPair(at),
    radius: options.radius,
    setLatLng(next: LatLngInput) {
      created.at = toPair(next);
    },
  });
  leafletState.circles.push(created);
  return created;
}

const fakeLeaflet = { map, tileLayer, circleMarker, circle };

export default fakeLeaflet;
