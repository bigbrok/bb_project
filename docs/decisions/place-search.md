# 장소 검색(지오코딩)

## Decisions

- 제목 아래 입력창의 장소 이름·주소는 OpenStreetMap Nominatim 공개 서버(`nominatim.openstreetmap.org/search`)로 좌표를 찾는다. 대한민국으로 한정하고(`countrycodes=kr`), 첫 결과 하나만 쓴다.
- Nominatim은 브라우저가 아니라 서버 경로(`/api/geocode`)에서 호출한다. 앱을 식별하는 User-Agent를 보내고, 같은 질의는 캐시하고, 앱 전체에서 초당 1회를 넘지 않게 한다.
- 검색은 사용자가 "조회"를 누를 때만 하고, 결과를 쓰는 화면에 "© OpenStreetMap contributors"를 표시한다.

## Boundaries

- 장소를 좌표로 바꾸는 데에만 쓴다. 지도 표시와 외부 지도 링크는 map-provider 결정을 따른다.
- 장소 이름·주소 조회는 제목 아래 입력창 하나로만 한다. "위치 바꾸기" 지도는 지점을 눌러 고르는 데에만 쓴다(2026-10-22 사용자 결정).

## Why

사용자가 키 없이 쓸 수 있는 방법으로 골랐다. 카카오 로컬 REST API는 국내 검색이 더 정확하지만 REST API 키와 카카오맵 사용 설정이 필요하다.

## Reconsider when

- 사용자가 여러 명이 되어 초당 1회 한도에 닿거나, OSMF가 접근을 막을 때
- 국내 장소 검색 품질이 실사용에 부족하다는 근거가 쌓일 때

## Still-rejected alternatives

- 카카오 로컬 REST API — 국내 장소 검색이 정확하지만 키 발급과 카카오맵 사용 설정이 필요하다; 키를 쓸 수 있게 되거나 Nominatim 한도에 닿으면 재검토.

## Evidence worth preserving

- 2026-10-22 확인한 [Nominatim 사용 정책](https://operations.osmfoundation.org/policies/nominatim/): 앱 전체 합계 초당 최대 1회, 기본 라이브러리가 아닌 식별 가능한 User-Agent, 결과 캐시, 자동완성 금지, 저작자 표시(ODbL), 사전 고지 없이 접근 철회 가능.
- 같은 날 `q=강남역` 검색의 첫 결과는 역이 아닌 "강남역" 버스정류장(37.49426, 127.02963)이었다.
