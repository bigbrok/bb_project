# 지도 서비스

## Decisions

- 목록 위에 검색 위치를 보여 주는 지도는 OpenStreetMap 표준 타일(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)을 Leaflet으로 띄우고, 저작자 표시를 지도 오른쪽 아래에 항상 둔다.
- "위치 바꾸기"에서 지점을 눌러 고르는 지도는 카카오맵 JavaScript SDK(`dapi.kakao.com/v2/maps/sdk.js`)를 쓴다. 키는 공개용 환경 변수 `NEXT_PUBLIC_KAKAO_MAP_KEY`로 넣는다.
- 외부 지도로 위치를 보여 줄 때는 카카오맵 웹 링크(`map.kakao.com/link/map/이름,위도,경도`)를 쓴다.

## Boundaries

- 지도 표시에 대한 결정이다. 주유소와 가격 데이터는 fuel-price-source 결정대로 오피넷에서 가져오며, 카카오 로컬 API를 데이터 출처로 쓰지 않는다.
- 카카오 JavaScript 키는 브라우저에 노출되도록 설계된 키라서 서버에 숨기지 않는다. 오피넷 인증키 비노출 규칙과 다르다.

## Why

외부 지도 링크와 앱 안 지도를 같은 서비스로 맞추면 사용자가 보는 지도가 일관되고, 국내 지도 표기도 자세하다. 링크는 키 없이 PC·모바일 웹으로 자동 연결된다.

## Reconsider when

- 카카오맵 사용 권한(계정당 한 앱 기본 제공, 추가 앱은 심사)을 얻지 못하거나 잃을 때
- 무료 사용량을 넘는 트래픽이 꾸준히 생길 때

## Still-rejected alternatives

- 검색 위치 지도에 카카오맵 SDK 쓰기 — 국내 표기가 더 자세하지만 키·도메인·사용 설정 전에는 지도가 뜨지 않는다; 키를 쓸 수 있게 되면 재검토(2026-10-22 사용자 결정).

## Evidence worth preserving

- 2026-10-22 확인: SDK는 `autoload=false`로 불러온 뒤 `kakao.maps.load(callback)` 안에서 지도를 만든다. 키에는 JavaScript SDK 도메인을 등록해야 하고, 2024-12-01부터 새로 쓰는 앱은 [제품 설정] > [카카오맵] 사용 설정을 ON으로 해야 한다(꺼져 있으면 `NotAuthorizedError ... disabled OPEN_MAP_AND_LOCAL service.`로 403).
- 2026-10-22 확인한 [OSM 타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/): 표준 URL `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, 숨기지 않은 저작자 표시, 브라우저의 유효한 Referer(이를 막는 Referrer-Policy 금지), 캐시를 우회하는 헤더 금지, 보고 있지 않은 타일 미리 받기·오프라인 저장 금지, 사용량 보장 없음.
