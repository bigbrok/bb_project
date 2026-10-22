# 지도 서비스

## Decisions

- 앱 안에 띄우는 지도는 카카오맵 JavaScript SDK(`dapi.kakao.com/v2/maps/sdk.js`)를 쓴다. 키는 공개용 환경 변수 `NEXT_PUBLIC_KAKAO_MAP_KEY`로 넣는다.
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

- OpenStreetMap(Leaflet) — 키 없이 쓸 수 있지만 국내 지도 표기가 덜 자세하고, 무료 타일 서버는 많은 사용량을 허용하지 않는다; 카카오맵 권한을 얻지 못하면 재검토.

## Evidence worth preserving

- 2026-10-22 확인: SDK는 `autoload=false`로 불러온 뒤 `kakao.maps.load(callback)` 안에서 지도를 만든다. 키에는 JavaScript SDK 도메인을 등록해야 하고, 2024-12-01부터 새로 쓰는 앱은 [제품 설정] > [카카오맵] 사용 설정을 ON으로 해야 한다(꺼져 있으면 `NotAuthorizedError ... disabled OPEN_MAP_AND_LOCAL service.`로 403).
