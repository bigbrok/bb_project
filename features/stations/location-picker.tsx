"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

import {
  findPlace,
  loadKakaoMaps,
  type KakaoMap,
  type KakaoMaps,
  type KakaoMarker,
} from "./kakao-maps";

export type PickedPosition = { lat: number; lng: number };

// Seoul City Hall: a recognizable starting point when the user's position is unknown.
const INITIAL_CENTER = { lat: 37.5665, lng: 126.978 };

type MapHandle = {
  maps: KakaoMaps;
  map: KakaoMap;
  /** Places (or moves) the single marker and records it as the picked position. */
  pick: (position: PickedPosition, options?: { center?: boolean }) => void;
};

export function LocationPicker({
  onSearch,
}: {
  onSearch: (position: PickedPosition) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [picked, setPicked] = useState<PickedPosition | null>(null);
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let marker: KakaoMarker | null = null;

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(INITIAL_CENTER.lat, INITIAL_CENTER.lng),
          level: 5,
        });
        const pick: MapHandle["pick"] = (position, options) => {
          const latLng = new maps.LatLng(position.lat, position.lng);
          if (options?.center) map.setCenter(latLng);
          if (marker) {
            marker.setPosition(latLng);
          } else {
            marker = new maps.Marker({ position: latLng });
            marker.setMap(map);
          }
          setPicked(position);
        };
        maps.event.addListener(map, "click", ({ latLng }) =>
          pick({ lat: latLng.getLat(), lng: latLng.getLng() })
        );
        handleRef.current = { maps, map, pick };
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      handleRef.current = null;
      marker?.setMap(null);
    };
  }, []);

  async function handleLookUp(event: FormEvent) {
    event.preventDefault();
    const handle = handleRef.current;
    const text = query.trim();
    if (!handle || !text) return;
    const position = await findPlace(handle.maps, text);
    if (handleRef.current !== handle) return;
    if (!position) {
      setNotFound(text);
      return;
    }
    setNotFound(null);
    handle.pick(position, { center: true });
  }

  if (status === "error") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapIcon />
          </EmptyMedia>
          <EmptyTitle>지도를 불러오지 못했습니다</EmptyTitle>
          <EmptyDescription>
            위치 권한을 허용한 뒤 다시 시도해 주세요.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const canLookUp = status === "ready" && query.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleLookUp}>
        <Field data-invalid={notFound ? true : undefined}>
          <FieldLabel htmlFor="location-query">장소 또는 주소</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="location-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 강남역, 서울 중구 세종대로 110"
              aria-invalid={notFound ? true : undefined}
              autoComplete="off"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="secondary" size="sm" disabled={!canLookUp}>
                조회
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {notFound && <FieldError>&apos;{notFound}&apos; 위치를 찾지 못했습니다.</FieldError>}
        </Field>
      </form>
      <p className="text-sm text-muted-foreground">
        {picked
          ? "마커 위치로 검색합니다. 지도를 누르면 마커를 옮길 수 있습니다."
          : "장소 이름이나 주소로 조회하거나, 지도에서 내 위치를 눌러 주세요."}
      </p>
      <div
        ref={containerRef}
        role="region"
        aria-label="위치 고르기 지도"
        aria-busy={status === "loading"}
        className="h-80 w-full overflow-hidden rounded-lg border bg-muted"
      />
      <Button disabled={!picked} onClick={() => picked && onSearch(picked)}>
        <SearchIcon data-icon="inline-start" />
        이 위치로 검색
      </Button>
    </div>
  );
}
