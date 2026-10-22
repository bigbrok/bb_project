"use client";

import { useEffect, useRef, useState } from "react";
import { MapIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { loadKakaoMaps, type KakaoMarker } from "./kakao-maps";
import { DEFAULT_PLACE } from "./types";

export type PickedPosition = { lat: number; lng: number };

export function LocationPicker({
  onSearch,
}: {
  onSearch: (position: PickedPosition) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [picked, setPicked] = useState<PickedPosition | null>(null);

  useEffect(() => {
    let cancelled = false;
    let marker: KakaoMarker | null = null;

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(DEFAULT_PLACE.lat, DEFAULT_PLACE.lng),
          level: 5,
        });
        maps.event.addListener(map, "click", ({ latLng }) => {
          if (marker) {
            marker.setPosition(latLng);
          } else {
            marker = new maps.Marker({ position: latLng });
            marker.setMap(map);
          }
          setPicked({ lat: latLng.getLat(), lng: latLng.getLng() });
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, []);

  if (status === "error") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapIcon />
          </EmptyMedia>
          <EmptyTitle>지도를 불러오지 못했습니다</EmptyTitle>
          <EmptyDescription>
            위의 입력창으로 장소를 조회하거나, 위치 권한을 허용한 뒤 다시 시도해 주세요.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {picked
          ? "마커 위치로 검색합니다. 지도를 누르면 마커를 옮길 수 있습니다."
          : "지도에서 내 위치를 눌러 주세요."}
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
