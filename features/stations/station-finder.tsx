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
import { kakaoMapUrl } from "./map-link";
import { DEFAULT_FUEL, isFuelType, type FuelType, type Station } from "./types";

const FUEL_LABELS: Record<FuelType, string> = {
  gasoline: "휘발유",
  diesel: "경유",
};

type SearchState =
  | { kind: "loading" }
  | { kind: "location-error" }
  | { kind: "price-error" }
  | { kind: "done"; stations: Station[] };

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

async function findStations(fuel: FuelType): Promise<SearchState> {
  let position: GeolocationPosition;
  try {
    position = await getPosition();
  } catch {
    return { kind: "location-error" };
  }

  const params = new URLSearchParams({
    lat: String(position.coords.latitude),
    lng: String(position.coords.longitude),
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
  const [state, setState] = useState<SearchState>({ kind: "loading" });
  // Ignores responses from searches that a newer search has replaced.
  const latestSearch = useRef(0);

  const runSearch = useCallback((fuelType: FuelType) => {
    const searchId = ++latestSearch.current;
    return findStations(fuelType).then((result) => {
      if (searchId === latestSearch.current) setState(result);
    });
  }, []);

  const search = useCallback(
    (fuelType: FuelType) => {
      setState({ kind: "loading" });
      void runSearch(fuelType);
    },
    [runSearch]
  );

  useEffect(() => {
    void runSearch(DEFAULT_FUEL);
  }, [runSearch]);

  function handleFuelChange(value: string[]) {
    const next = value[0];
    if (!next || !isFuelType(next) || next === fuel) return;
    setFuel(next);
    search(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          근처 최저가 주유소
        </h1>
        <p className="text-sm text-muted-foreground">
          현재 위치 반경 2km · 가격 낮은 순
        </p>
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
          onClick={() => search(fuel)}
          disabled={state.kind === "loading"}
        >
          <RefreshCwIcon data-icon="inline-start" />
          다시 검색
        </Button>
      </div>

      <SearchResult state={state} fuel={fuel} onRetry={() => search(fuel)} />
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
}: {
  state: SearchState;
  fuel: FuelType;
  onRetry: () => void;
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
        <Alert>
          <MapPinOffIcon />
          <AlertTitle>현재 위치가 필요합니다</AlertTitle>
          <AlertDescription>
            브라우저에서 위치 권한을 허용한 뒤 다시 시도해 주세요.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={onRetry}>
              다시 시도
            </Button>
          </AlertAction>
        </Alert>
      );
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
