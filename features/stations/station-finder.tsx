"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FuelIcon,
  MapPinIcon,
  MapPinOffIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { formatDistance, formatPrice } from "./format";
import { LocationPicker, type PickedPosition } from "./location-picker";
import { kakaoMapUrl } from "./map-link";
import { DEFAULT_FUEL, isFuelType, type FuelType, type Station } from "./types";

const FUEL_LABELS: Record<FuelType, string> = {
  gasoline: "휘발유",
  diesel: "경유",
};

type SearchState =
  | { kind: "loading" }
  | { kind: "location-error" }
  | { kind: "picking" }
  | { kind: "price-error" }
  | { kind: "done"; stations: Station[] };

/** Where a search is centered: the device's position or one picked on the map. */
type SearchOrigin = { kind: "current" } | ({ kind: "picked" } & PickedPosition);

const CURRENT_POSITION: SearchOrigin = { kind: "current" };

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

async function findStations(
  fuel: FuelType,
  origin: SearchOrigin
): Promise<SearchState> {
  let position: PickedPosition;
  if (origin.kind === "picked") {
    position = origin;
  } else {
    try {
      const { coords } = await getPosition();
      position = { lat: coords.latitude, lng: coords.longitude };
    } catch {
      return { kind: "location-error" };
    }
  }

  const params = new URLSearchParams({
    lat: String(position.lat),
    lng: String(position.lng),
    fuel,
  });

  try {
    const res = await fetch(`/api/stations?${params}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const body = (await res.json()) as { stations: Station[] };
    return { kind: "done", stations: body.stations };
  } catch {
    return { kind: "price-error" };
  }
}

export function StationFinder() {
  const [fuel, setFuel] = useState<FuelType>(DEFAULT_FUEL);
  const [origin, setOrigin] = useState<SearchOrigin>(CURRENT_POSITION);
  const [state, setState] = useState<SearchState>({ kind: "loading" });
  // Ignores responses from searches that a newer search has replaced.
  const latestSearch = useRef(0);

  const runSearch = useCallback((fuelType: FuelType, from: SearchOrigin) => {
    const searchId = ++latestSearch.current;
    return findStations(fuelType, from).then((result) => {
      if (searchId === latestSearch.current) setState(result);
    });
  }, []);

  const search = useCallback(
    (fuelType: FuelType, from: SearchOrigin) => {
      setState({ kind: "loading" });
      void runSearch(fuelType, from);
    },
    [runSearch]
  );

  useEffect(() => {
    void runSearch(DEFAULT_FUEL, CURRENT_POSITION);
  }, [runSearch]);

  function handleFuelChange(value: string[]) {
    const next = value[0];
    if (!next || !isFuelType(next) || next === fuel) return;
    setFuel(next);
    search(next, origin);
  }

  function searchFrom(from: SearchOrigin) {
    setOrigin(from);
    search(fuel, from);
  }

  function startPicking() {
    // Drops any in-flight search so its result cannot replace the map.
    latestSearch.current++;
    setState({ kind: "picking" });
  }

  const usingPicked = origin.kind === "picked";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          근처 최저가 주유소
        </h1>
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="text-sm text-muted-foreground">
            {usingPicked ? "고른 위치" : "현재 위치"} 반경 2km · 가격 낮은 순
          </p>
          {usingPicked && state.kind !== "picking" && (
            <Button variant="link" size="sm" className="px-0" onClick={startPicking}>
              위치 다시 고르기
            </Button>
          )}
        </div>
      </header>

      <div className="flex items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          value={[fuel]}
          onValueChange={handleFuelChange}
          aria-label="기름 종류"
        >
          {(Object.keys(FUEL_LABELS) as FuelType[]).map((type) => (
            <ToggleGroupItem key={type} value={type}>
              {FUEL_LABELS[type]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          variant="outline"
          onClick={() => search(fuel, origin)}
          disabled={state.kind === "loading"}
        >
          <RefreshCwIcon data-icon="inline-start" />
          다시 검색
        </Button>
      </div>

      <SearchResult
        state={state}
        fuel={fuel}
        onRetry={() => search(fuel, origin)}
        onRetryCurrentPosition={() => searchFrom(CURRENT_POSITION)}
        onPick={(position) => searchFrom({ kind: "picked", ...position })}
      />
    </div>
  );
}

function StationItem({ station }: { station: Station }) {
  const mapUrl = kakaoMapUrl(station);
  const content = (
    <>
      <ItemContent className="min-w-0">
        <ItemTitle className="break-all">{station.name}</ItemTitle>
        <ItemDescription>{formatDistance(station.distance)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="text-lg font-semibold tabular-nums">
          {formatPrice(station.price)}
        </span>
        {mapUrl && <MapPinIcon className="text-muted-foreground" aria-hidden />}
      </ItemActions>
    </>
  );

  if (!mapUrl) {
    return (
      <Item variant="outline" role="listitem">
        {content}
      </Item>
    );
  }

  return (
    <div role="listitem">
      <Item
        variant="outline"
        render={<a href={mapUrl} target="_blank" rel="noopener noreferrer" />}
      >
        {content}
        <span className="sr-only">카카오맵에서 위치 보기 (새 탭)</span>
      </Item>
    </div>
  );
}

function SearchResult({
  state,
  fuel,
  onRetry,
  onRetryCurrentPosition,
  onPick,
}: {
  state: SearchState;
  fuel: FuelType;
  onRetry: () => void;
  onRetryCurrentPosition: () => void;
  onPick: (position: PickedPosition) => void;
}) {
  switch (state.kind) {
    case "loading":
      return (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">검색 중</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      );
    case "location-error":
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 font-medium">
              <MapPinOffIcon className="size-4 text-muted-foreground" aria-hidden />
              현재 위치를 알 수 없습니다
            </p>
            <Button
              variant="link"
              size="sm"
              className="w-fit px-0"
              onClick={onRetryCurrentPosition}
            >
              현재 위치로 다시 시도
            </Button>
          </div>
          <LocationPicker onSearch={onPick} />
        </div>
      );
    case "picking":
      return <LocationPicker onSearch={onPick} />;
    case "price-error":
      return (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>가격 정보를 가져오지 못했습니다</AlertTitle>
          <AlertDescription>잠시 후 다시 시도해 주세요.</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={onRetry}>
              다시 시도
            </Button>
          </AlertAction>
        </Alert>
      );
    case "done":
      if (state.stations.length === 0) {
        return (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FuelIcon />
              </EmptyMedia>
              <EmptyTitle>주변 2km 안에 주유소가 없습니다</EmptyTitle>
              <EmptyDescription>
                다른 곳으로 이동한 뒤 다시 검색해 보세요.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        );
      }
      return (
        <ItemGroup aria-label={`${FUEL_LABELS[fuel]} 가격 낮은 순 주유소`}>
          {state.stations.map((station) => (
            <StationItem key={station.id} station={station} />
          ))}
        </ItemGroup>
      );
  }
}
