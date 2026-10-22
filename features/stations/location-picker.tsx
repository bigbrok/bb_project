"use client";

import { useEffect, useRef, useState } from "react";
import type { CircleMarker } from "leaflet";
import { MapIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { openOsmMap } from "./osm-map";
import { DEFAULT_PLACE } from "./types";

export type PickedPosition = { lat: number; lng: number };

const ZOOM = 14;

export function LocationPicker({
  onSearch,
}: {
  onSearch: (position: PickedPosition) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [picked, setPicked] = useState<PickedPosition | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    let remove: (() => void) | undefined;

    openOsmMap(container, [DEFAULT_PLACE.lat, DEFAULT_PLACE.lng], ZOOM, controller.signal)
      .then((opened) => {
        if (!opened) return;
        const { L, map } = opened;
        let marker: CircleMarker | null = null;
        map.on("click", ({ latlng }) => {
          if (marker) marker.setLatLng(latlng);
          else marker = L.circleMarker(latlng, { radius: 8, className: "search-map-marker" }).addTo(map);
          setPicked({ lat: latlng.lat, lng: latlng.lng });
        });
        remove = () => map.remove();
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });

    return () => {
      controller.abort();
      remove?.();
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
        className="isolate h-80 w-full overflow-hidden rounded-lg border bg-muted"
      />
      <Button disabled={!picked} onClick={() => picked && onSearch(picked)}>
        <SearchIcon data-icon="inline-start" />
        이 위치로 검색
      </Button>
    </div>
  );
}
