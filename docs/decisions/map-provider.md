# 지도 서비스

## Decisions

- 앱 안의 지도(목록 위 검색 위치 지도, 정중앙 고정 핀으로 위치를 옮긴다)는 OpenStreetMap 표준 타일(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)을 Leaflet으로 띄우고, 저작자 표시를 지도 오른쪽 아래에 항상 둔다. 키가 필요 없다.
- 외부 지도로 위치를 보여 줄 때(주유소, 검색 기준 위치)는 카카오맵 웹 링크(`map.kakao.com/link/map/이름,위도,경도`)를 쓴다. 키가 필요 없다.

## Boundaries

- 지도 표시에 대한 결정이다. 주유소와 가격 데이터는 fuel-price-source 결정대로 오피넷에서, 장소 좌표는 place-search 결정대로 Nominatim에서 가져온다.
- 카카오 지도 JavaScript SDK와 카카오 API 키는 쓰지 않는다.

## Why

사용자가 키 없이 바로 동작하는 쪽을 골랐다(2026-10-22). 앱 안 지도는 OSM으로 통일해 키·도메인 등록·사용 설정 없이 뜨게 하고, 국내 지도 표기가 자세한 카카오맵은 새 탭에서 여는 웹 링크로 쓴다.

## Reconsider when

- 여러 사람이 쓰거나 상용으로 쓰게 되어 OSM 표준 타일 서버의 사용량 한계에 닿을 때
- 앱 안 지도에서 국내 지도 표기가 부족하다는 근거가 쌓일 때

## Still-rejected alternatives

- 앱 안 지도에 카카오맵 JavaScript SDK 쓰기 — 국내 표기가 더 자세하지만 JavaScript 키, 도메인 등록, [카카오맵] 사용 설정 전에는 지도가 뜨지 않는다; 키를 쓸 수 있게 되면 재검토.

## Evidence worth preserving

- 2026-10-22 확인: 카카오 지도 SDK는 키에 JavaScript SDK 도메인을 등록해야 하고, 2024-12-01부터 새로 쓰는 앱은 [제품 설정] > [카카오맵] 사용 설정을 ON으로 해야 한다(꺼져 있으면 `NotAuthorizedError ... disabled OPEN_MAP_AND_LOCAL service.`로 403).
- 2026-10-22 확인한 [OSM 타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/): 표준 URL `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, 숨기지 않은 저작자 표시, 브라우저의 유효한 Referer(이를 막는 Referrer-Policy 금지), 캐시를 우회하는 헤더 금지, 보고 있지 않은 타일 미리 받기·오프라인 저장 금지, 사용량 보장 없음.
