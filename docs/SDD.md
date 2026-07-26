# SDD (Software Design Document) — PinPaw

## 7. 제보 피드백 및 지도/추천 연동

### 7-5. 유저별 제보 상태(본/안 본, 내 강아지 인정)

#### 7-5.1 개요

- **목적**: 유저가 본 제보와 보지 않은 제보를 구분하고, “내 강아지 제보”로 인정한 항목을 추천 최상단에 고정·표시한다.
- **범위**: 지도 마커 스타일(빨강/회색/초록), 추천 목록 정렬, 상세에서 버튼(내 강아지 인정).
- **특성**: 모든 상태는 **유저별**로 저장·적용된다 (유저 A와 B는 서로 다른 상태를 본다).

#### 7-5.2 요구사항 요약

| 구분 | 요구사항 |
|------|----------|
| 지도 | 안 본 제보: 빨간 테두리(현행 유지). 본 제보: 회색 테두리. |
| 지도 | “내 강아지로 인정”한 제보: 초록 테두리 (유실글 컨텍스트 있을 때). |
| 추천 | “내 강아지로 인정”한 제보는 **최상단 고정**, 그 아래 유사도 순. |
| 추천 | “내 강아지로 인정”한 제보에 “내가 인정한 제보” 배지 표시. |
| 상세 | “내 강아지로 인정” 체크/해제 가능 (인스타 좋아요처럼 토글). |

#### 7-5.3 데이터 설계

**원칙**: 인스타 좋아요처럼 “한 유저·한 제보” 또는 “한 유실글·한 제보”당 최소 행으로 관리.

**테이블 1: `user_sighting_views` (본 적 있음)**

- **역할**: 유저별로 “해당 제보를 봤는지” 저장. **지도 마커 색상**(회색=본 제보)용 (유실글 무관).
- **스키마** (현재 코드·마이그레이션 기준):
  - `user_id` (uuid, FK → auth.users) — 유저
  - `sighting_id` (uuid, FK → sightings) — 제보
  - `seen_at` (timestamptz, nullable) — NULL = 안 봄, 값 있음 = 본 시각 → 지도에서 회색
  - `created_at`, `updated_at` (timestamptz)
  - PK: `(user_id, sighting_id)`
- **인덱스**: `(user_id)`, `(sighting_id)` (조회용).
- **참고**: “다시 보지 않기”(dismissed) 기능은 제거됨 — `dismissed_at` 컬럼 없음 (마이그레이션 20250218160000).

**테이블 2: `lost_post_sighting_claims` (내 강아지로 인정)**

- **역할**: “이 유실글에서 이 제보를 내 강아지로 인정했는가”만 저장. 존재 = 인정, 삭제 = 인정 해제.
- **스키마**:
  - `lost_post_id` (uuid, FK → lost_posts)
  - `sighting_id` (uuid, FK → sightings)
  - `claimed_at` (timestamptz, default now())
  - PK: `(lost_post_id, sighting_id)`
- **인덱스**: `(lost_post_id)` (추천 정렬/필터용).

**RLS**

- `user_sighting_views`: `user_id = auth.uid()` 인 행만 SELECT/INSERT/UPDATE/DELETE 허용.
- `lost_post_sighting_claims`: `lost_posts.owner_id = auth.uid()` 인 lost_post에 대해서만 SELECT/INSERT/DELETE 허용.

#### 7-5.4 API 설계

**인증 (서버 검증)**  
`/api/v1/me/*` 및 인증이 필요한 API에서는 쿠키 세션에서 **access_token만 읽은 뒤** Supabase Auth 서버로 검증하는 **`getAuthenticatedUser()`**를 사용한다. `getSession()`의 user 객체는 저장소(쿠키) 기반이라 서버에서 신뢰하지 않고, **`getUser(access_token)`**으로 검증된 user만 사용한다. 공용 헬퍼: `@/shared/supabase/server`의 `getAuthenticatedUser(supabase)`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/me/sighting-views?sightingIds=id1,id2,...` | 현재 유저의 제보별 seen 상태 반환. 지도 마커 색상(회색)용. |
| POST | `/api/v1/me/sighting-views` | body: `{ sightingId }` — “본 적 있음” 기록 (seen_at 설정). |
| GET | `/api/v1/me/lost-posts/map?limit=50` | 지도 “내 유실글+북마크” 레이어용. 본인 유실글 목록 + 위도·경도·표시용 필드. RPC `get_my_lost_posts_with_location` 호출. |
| GET | `/api/v1/me/lost-posts/map/paths` | 지도 "내 유실글+북마크" 레이어용. 유실 위치→제보(occurred_at 순) 경로 데이터. RPC `get_my_lost_post_paths` 호출. 반환: `[{ lost_post_id, lost_lat, lost_lng, lost_at, points: [{ sighting_id, lat, lng, occurred_at, photo_keys?, note? }, ...] }, ...]`. |
| GET | `/api/v1/me/lost-posts/[lostPostId]/sighting-claims` | 해당 유실글에서 “내 강아지로 인정”한 sighting_id 목록. |
| POST | `/api/v1/me/lost-posts/[lostPostId]/sighting-claims` | body: `{ sightingId }` — 인정 추가. 성공 시 해당 `lost_post_id`의 `recommendation_cache` 삭제(다음 추천 조회 시 반영). |
| DELETE | `/api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]` | 인정 해제. 성공 시 해당 `lost_post_id`의 `recommendation_cache` 삭제. |
| GET | `/api/v1/auth/sightings/[sightingId]` | 인증 유저용 제보 단건 상세. 지도 상세 카드/추천 모달과 동일한 형식(id, photo_keys, occurred_at, author_type, trait_*, note) 반환. Service role로 sightings 테이블 직접 조회. |

#### 7-5.5 프론트 연동

- **지도**
  - **레이어 필터** (실제 구현): 지도 상단에서 전환 가능. **전체**(default) / **안 본 제보**(unseen) / **내 유실글+북마크**(bookmark). default·unseen은 클러스터 수신 후 메모리에서 필터링; bookmark 레이어는 zoom 17로 포인트만 요청·표시(클러스터 없음), 캐시 키에 레이어 포함.
  - 인증 유저: 클러스터 수신 후 `GET /api/v1/me/sighting-views?sightingIds=...` 및 (유실글 컨텍스트 시) `GET .../sighting-claims` 로 상태 조회. sighting ID 정규화(소문자·trim)로 API/DB 포맷 차이 시에도 인정 상태가 초록으로 반영되도록 함.
  - claimed → 초록 테두리, seen만 있음 → 회색 테두리, 그 외 → 빨간 테두리.
  - 지도에서 마커(포인트) 클릭 시 상세 카드 열기 직전 `POST /api/v1/me/sighting-views` 로 "본 적 있음" 기록.
  - **내 유실글+북마크 레이어**: `GET /api/v1/me/lost-posts/map`으로 유실글 위치 목록 조회. RPC에 `cover_photo_key` 등이 없을 수 있어 `GET /api/v1/lost-posts`와 병합해 이미지·특징 보강. 유실글 위치에 **둥근 네모 마커**(커버 이미지, 주황 테두리) 표시, 터치 시 **유실글 카드**(사진·유실일·특징·메모) 표시. 제보 카드와 별도 상태(`selectedLostPostForCard`).
  - **북마크 레이어 경로·제보**: `GET /api/v1/me/lost-posts/map/paths`로 유실 위치→제보(occurred_at 순) 경로 데이터 조회. **경로 폴리라인**(연두색 배경선) + **방향 애니메이션**(초록 선이 유실→제보 순으로 따라 그려짐, 1초 텀으로 무한 반복). pathData 기반으로 **제보 마커만** 그리며 `sightingFeedbackMap`(인정=초록)과 연동. `lastMyPositionRef`로 경로 선이 '내 위치' 마커에 붙지 않도록 처리. idle 시 북마크 레이어일 때는 `fetchClusters` 호출 생략.
  - **클레임(인정/해제) 후**: `fetchBookmarkLayerData()` 호출로 경로·제보 마커 갱신, 북마크 모달 닫기·선택 제보 초기화. 등록 가능한 유실글이 없을 때 "조회 가능한 유실글이 없습니다" 안내.
  - **추천 "지도에서 보기" 진입**: `initialCenter`+`initialFocusSightingId`가 있으면 클러스터 대기 없이 `GET /api/v1/auth/sightings/[sightingId]`로 상세 조회 후 제보 상세 카드 자동 오픈.
  - **지도 상세 카드(하단 패널)**: 인증 + 선택된 제보에 `id` 있음 + **내 유실글이 1개 이상 로드된 경우**에만 우측 상단에 **북마크 별 아이콘** 표시. 별만 노출(버튼 형태 아님). 클릭 시 인정이면 해제(DELETE), 아니면 유실글 선택 모달(등록) 또는 바로 등록. `effectiveLostPostId` = URL의 `lostPostId` 우선, 없으면 내 유실글 1개 또는 모달 선택값.
  - **내 유실글 로드 조건**: URL에 `lostPostId`가 **없을 때만** 마커 상세 열림 시 `GET /api/v1/lost-posts?limit=50` 호출로 `myLostPosts` 설정. **추천 페이지에서 지도로 진입한 경우**(`?lostPostId=...` 있음)에는 해당 유실글 1건을 `GET /api/v1/lost-posts/[lostPostId]`로 로드해 `myLostPosts`에 넣어 북마크 별이 보이도록 함(7-5.6.1).
- **추천**
  - 기존 추천 API 응답에 대해: 해당 유실글의 claimed 제보를 **최상단 고정** 후 유사도 순 정렬. 응답에 `claimedAsMyDog` 플래그 포함.
  - **추천 카드(RecommendationCard)**:
    - “내가 인정한 제보” 배지(✓ 북마크한 제보) 유지.
    - **메인 액션**: 카드 클릭 시 **팝업 모달**로 제보 상세 표시(지도 상세 카드와 동일한 내용: 사진·일시·익명/회원 제보·색·크기·종·추가 설명·북마크·지도에서 보기 버튼). 모달 열 때 `POST /api/v1/me/sighting-views`로 “본 적 있음” 기록.
    - **서브 액션**: 카드 **우측 상단** “지도에서 보기 →” 링크로 지도 탭 이동. 모달 내 “지도에서 보기” 버튼은 모달 닫은 뒤 지도로 이동.
    - **북마크**: 카드 및 모달 내 **별 아이콘**으로 등록/해제(지도 상세와 동일 UX). `lostPostId`는 현재 선택된 유실글로 고정.
    - 지도 링크 시 `lostPostId` 쿼리 전달(초록 마커용).
  - **공통 컴포넌트**: 지도·추천에서 동일한 제보 상세 UI 사용. **SightingDetailCard**: 제보 상세 내용(사진·제목·일시·특징·설명·rightSlot·footer) 표시. **SightingDetailSheet**: 지도 전용 래퍼(absolute 하단 고정, 터치/스크롤 시 지도 이벤트 전파 차단). 추천 상세는 **중앙 팝업 모달**(fixed overlay + flex center)로 SightingDetailCard만 사용.
- **상세(제보 진입 시)**
  - “본 적 있음” 기록: 지도 마커 클릭·추천 모달 열기·지도 링크 클릭 시 `POST /api/v1/me/sighting-views` with `sightingId`.
- **특징(색상) 입력 공통화**: 유실글·제보의 색상(`trait_color`)을 자유 텍스트 대신 **공통 옵션 선택**으로 통일. 상수 `TRAIT_COLOR_OPTIONS`(검정, 흰색, 갈색, 회색, 크림/연한색, 얼룩(복합), 기타)를 `@/shared/constants/traitColors`에서 정의. **유실글 등록(LostPostForm)**·**유실글 수정([lostPostId]/page)**·**제보 등록(SightingForm)**에서 색상 입력을 `<select>`로 표시. 기존 자유 텍스트 값은 옵션에 없으면 "선택"으로 표시되며, 수정 시 위 옵션 중 선택 가능.

#### 7-5.6 체크리스트 (구현 완료 기준)

- [x] **DB**
  - [x] `user_sighting_views` 테이블 생성 (PK, FK, 인덱스). `dismissed_at` 제거 반영(마이그레이션 20250218160000).
  - [x] `lost_post_sighting_claims` 테이블 생성 (PK, FK, 인덱스)
  - [x] 두 테이블 RLS 활성화 및 정책 적용
  - [x] RPC `get_my_lost_posts_with_location(limit_count)` — 지도용 유실글 목록(id, pet_name, lost_at, cover_photo_key, trait_*, note, lat, lng). 마이그레이션 20250219100000, 20250219110000.
  - [x] RPC `get_my_lost_post_paths` — 북마크 레이어용 경로 데이터(유실 위치→제보 occurred_at 순). 반환: lost_post_id, lost_lat, lost_lng, lost_at, points(sighting_id, lat, lng, occurred_at, photo_keys?, note?). 마이그레이션 20250222100000.
- [x] **API**
  - [x] GET/POST `/api/v1/me/sighting-views` 구현
  - [x] GET `/api/v1/me/lost-posts/map?limit=50` 구현 (RPC 호출)
  - [x] GET `/api/v1/me/lost-posts/map/paths` 구현 (RPC `get_my_lost_post_paths` 호출, 경로 데이터 반환)
  - [x] GET/POST/DELETE `/api/v1/me/lost-posts/[lostPostId]/sighting-claims` 구현 (POST/DELETE 성공 시 해당 lost_post_id의 recommendation_cache 삭제)
  - [x] GET `/api/v1/auth/sightings/[sightingId]` 구현 (제보 단건 상세, 추천 모달용)
  - [x] 추천 API: claimed 최상단 정렬 및 `claimedAsMyDog` 필드 반환
- [x] **지도**
  - [x] 레이어 필터: 전체 / 안 본 제보 / 내 유실글+북마크. 북마크 레이어는 zoom 17 포인트만, 클러스터 없음.
  - [x] 인증 시 클러스터 수신 후 sighting-views·sighting-claims 조회·병합 (ID 정규화로 claimed 초록 반영 보장)
  - [x] claimed → 초록, seen → 회색, 기본 빨간 테두리
  - [x] 지도 마커 클릭 시 "본 적 있음" 기록 후 상세 카드 표시
  - [x] 지도 상세 카드에 북마크 **별 아이콘**(우측 상단, 버튼 형태 아님). 내 유실글 1개 이상 로드된 경우에만 표시. 클릭 시 인정/해제 또는 유실글 선택 모달.
  - [x] 내 유실글+북마크 레이어: 유실글 위치 마커(둥근 네모·커버 이미지), 터치 시 유실글 카드(사진·유실일·특징·메모). 목록 API와 병합해 cover_photo_key 보강.
  - [x] 북마크 레이어 경로·제보: GET `/api/v1/me/lost-posts/map/paths`로 경로 데이터 조회. 경로 폴리라인(연두색) + 방향 애니메이션(초록 선 따라 그리기, 1초 텀 무한 반복). pathData 기반 제보 마커만 그리며 sightingFeedbackMap 연동. 클레임(인정/해제) 후 fetchBookmarkLayerData 호출, 등록 가능 유실글 없을 때 "조회 가능한 유실글이 없습니다" 안내. 추천 "지도에서 보기" 진입 시 initialCenter+initialFocusSightingId로 상세 카드 자동 오픈.
- [x] **특징(색상) 입력**
  - [x] TRAIT_COLOR_OPTIONS 상수(검정/흰색/갈색/회색/크림·연한색/얼룩(복합)/기타) 정의. 유실글 등록·수정·제보 등록 폼에서 색상 select 적용.
- [x] **추천 UI**
  - [x] RecommendationCard에 “내가 인정한 제보” 배지
  - [x] RecommendationCard **카드 클릭 → 팝업 모달**로 제보 상세(지도 상세와 동일 SightingDetailCard). 우측 상단 “지도에서 보기 →” 링크(서브). 모달 열 때 “본 적 있음” 기록.
  - [x] RecommendationCard·모달 내 **별 아이콘**으로 북마크 등록/해제 (지도 상세와 동일 UX).
  - [x] 지도 링크 시 lostPostId 쿼리 전달(초록 마커용)
- [x] **공통 컴포넌트**
  - [x] SightingDetailCard: 제보 상세 공통 UI (지도·추천 모달)
  - [x] SightingDetailSheet: 지도 위 상세 카드 래퍼(하단 고정, 이벤트 전파 차단). 지도에서만 사용.
- [x] **상세**
  - [x] 제보 상세 진입 시 "본 적 있음" API 호출 (URL 진입 + 지도 마커 클릭 시)
  - [x] 지도 상세 카드에서도 동일 버튼 제공 “본 적 있음” API 호출

#### 7-5.6.1 알려진 동작·제한 (해결됨)

| 구분 | 내용 |
|------|------|
| 지도 북마크 별 | **해결:** 추천 → "지도에서 보기" 진입 시(`lostPostId` 있음)에도 상세 패널에 북마크 별이 보이도록, 해당 유실글 1건을 `GET /api/v1/lost-posts/[lostPostId]`로 로드해 `myLostPosts`에 넣는 로딩 정책을 추가함. |

#### 7-5.7 검증 시나리오

**시나리오 1: 본/안 본 구분 (지도)**  
1. 유저 A 로그인 → 지도 열기.  
2. 제보 X가 빨간 테두리로 보임.  
3. 제보 X 클릭 → 상세 진입 → “본 적 있음” 기록.  
4. 지도로 돌아와서 같은 영역 다시 로드.  
5. **검증**: 제보 X가 회색 테두리로 보인다.  
6. 유저 B로 로그인 후 같은 영역 확인.  
7. **검증**: 제보 X는 유저 B에게 빨간 테두리(안 본 상태)로 보인다.

**시나리오 2: 내 강아지 인정 (추천 최상단 + 지도 초록)**  
1. 유저 A가 유실글 L 선택 → 추천 목록에서 제보 Z에 “내 강아지로 인정” 클릭.  
2. **검증**: 제보 Z가 목록 최상단으로 이동하고 “내가 인정한 제보” 배지가 보인다.  
3. 지도에서 `lostPostId=L` 컨텍스트로 제보 Z 위치 확인.  
4. **검증**: 제보 Z 마커가 초록 테두리로 보인다.  
5. “내 강아지로 인정” 다시 클릭(해제).  
6. **검증**: 배지 사라지고, 목록에서 유사도 순으로 재정렬되며, 지도에서 해당 마커는 회색/빨강으로 보인다.

**시나리오 3: 인정 해제**  
1. 위 상태에서 제보 Z의 “내 강아지로 인정” 버튼을 다시 눌러 해제.  
2. **검증**: 목록에서 최상단 고정이 해제되고, “내가 인정한 제보” 배지가 사라진다.  
3. **검증**: 지도에서 제보 Z는 회색(본 제보) 또는 빨강(상태에 따라)으로만 보인다.

---

이 문서는 7-5 기능 구현 및 검증의 기준이 된다.

---

## 7-6. 추천 유사도 공식 개선 (필드별 임베딩 + 위치·시간 가중)

### 7-6.1 개요

- **목적**: 유실글–목격 제보 간 유사도를 “종·색·크기·메모” 필드별 임베딩 가중 합 + “제보 위치·제보 시각” 보정으로 계산해, 색·메모(특이사항) 비중을 높이고 “합리적인 제보”(위치·시간이 말이 되는 경우)를 반영한다.
- **범위**: 임베딩 스키마·워커·RPC·추천 API. 이미지 유사도는 **추후 개선**으로 제외.
- **특성**: 하이퍼파라미터(가중치·감쇠 계수)는 **실험 완료 값으로 고정**하며, **유저는 변경 불가**하다.

### 7-6.2 논의 요약 (배경)

- **기존**: 한 문장(종·색·크기·메모 concat) 1개 임베딩 → 코사인 유사도 1개로 정렬. 위치·시간은 pre-filter만 사용.
- **한계**: 색/메모 등 중요도 반영 불가, “위치·시간이 가까울수록 합리적”이 유사도 점수에 반영되지 않음.
- **선택**: (1) 텍스트는 필드별 임베딩 후 가중 합. (2) 위치·시간은 지수 감쇠로 0~1 계수화 후 곱. (3) 이미지는 별도 개선으로 미포함. (4) API 호출은 entity당 1회 배치(4문장 → 4벡터)로 비용·호출 수 유지.

### 7-6.3 최종 수식

**텍스트 유사도 (필드별 코사인 유사도 가중 합)**

- `sim(종)`, `sim(색)`, `sim(크기)`, `sim(메모)`: 유실글 4벡터 vs 목격 4벡터 각각 코사인 유사도 (1 − 코사인거리).
- \( S_{\text{text}} = w_s \cdot \text{sim}(\text{종}) + w_c \cdot \text{sim}(\text{색}) + w_z \cdot \text{sim}(\text{크기}) + w_n \cdot \text{sim}(\text{메모}) \)
- 제약: \( w_s + w_c + w_z + w_n = 1 \).

**위치·시간 보정**

- `distance_km = st_distance(유실 위치, 제보 위치) / 1000`
- `time_diff_days = extract(epoch from (제보 시각 - 유실 시각)) / 86400` (pre-filter로 이미 \( \in [0, p_{\text{days}}] \))
- \( f_{\text{loc}} = \exp(-\lambda_{\text{dist}} \cdot \frac{\text{distance\_km}}{p_{\text{radius\_km}}}) \)
- \( f_{\text{time}} = \exp(-\lambda_{\text{time}} \cdot \frac{\text{time\_diff\_days}}{p_{\text{days}}}) \)
- \( f_{\text{loc,time}} = f_{\text{loc}} \times f_{\text{time}} \)

**최종 스코어**

- \( \text{score} = S_{\text{text}} \times f_{\text{loc,time}} \)
- 정렬: `score` 내림차순, 상위 `p_top_k`개.

### 7-6.4 고정 파라미터 (유저 변경 불가)

| 구분 | 파라미터 | 값 | 비고 |
|------|----------|-----|------|
| 텍스트 가중치 | w_species (w_s) | 0.2 | 종 |
| | w_color (w_c) | 0.45 | 색 |
| | w_size (w_z) | 0.1 | 크기 |
| | w_note (w_n) | 0.25 | 메모(특이사항) |
| 위치·시간 감쇠 | λ_dist | 실험 완료 값 (문서/코드 상수) | 거리 감쇠 |
| | λ_time | 실험 완료 값 (문서/코드 상수) | 시간 차이 감쇠 |

- 기존 쿼리 파라미터 `p_radius_km`, `p_days`, `p_top_k`는 **API 쿼리로 유저 전달 가능** (현행 유지). 위 가중치·λ는 **서버/RPC 상수**로만 사용.

### 7-6.5 데이터·스키마 변경

- **embeddings 테이블**
  - 컬럼 추가: `trait` (text not null). 값: `'species' | 'color' | 'size' | 'note'`.
  - unique 변경: `(entity_type, entity_id, modality)` 제거 → `(entity_type, entity_id, modality, trait)` 추가.
  - entity(유실글/목격)당 **4행** (종·색·크기·메모 각 1행).

- **기존 데이터**
  - 기존 embeddings는 “한 문장 합쳐서 만든 벡터 1개”라 **재사용 불가**.
  - 마이그레이션 시: embeddings 전부 삭제 → `lost_posts.embedding_status`, `sightings.embedding_status` = `'pending'` → entity당 4행(종·색·크기·메모) insert (status=`'pending'`) → 워커가 재임베딩.

- **recommendation_cache**
  - 공식 변경으로 점수 체계가 바뀌므로 **한 번 비우기** (TRUNCATE 또는 DELETE). 캐시 키는 기존처럼 `radiusKm_days_topK` 유지(하이퍼파라미터는 쿼리로 노출하지 않음).

### 7-6.6 커밋 단위 구현 체크리스트

아래 순서로 진행 시, 각 블록을 한 커밋 단위로 나누어 작업·바이브 가능.

#### Commit 1: SDD 반영 (문서)

- [ ] **docs/SDD.md**: 7-6 섹션 추가 (개요, 논의 요약, 수식, 고정 파라미터, 스키마·마이그레이션, 커밋 단위 체크리스트).

#### Commit 2: DB 마이그레이션 (embeddings trait + 데이터 정리)

- [ ] **supabase/migrations/YYYYMMDDHHMMSS_embeddings_trait_field.sql**
  - `embedding_trait` enum 또는 `trait text not null` 추가. (기존 행이 있으면 default `'legacy'` 등으로 넣은 뒤 삭제.)
  - unique 제약: `embeddings_entity_unique` drop → `(entity_type, entity_id, modality, trait)` 로 추가.
  - `DELETE FROM embeddings;`
  - `UPDATE lost_posts SET embedding_status = 'pending'; UPDATE sightings SET embedding_status = 'pending';`
  - (선택) `TRUNCATE recommendation_cache;`
  - **백필**: 모든 `lost_post` id에 대해 `(entity_type='lost_post', entity_id, modality='text', trait)` 4종(species, color, size, note) insert, status=`'pending'`. 모든 `sighting` id에 대해 동일. (SQL 루프 또는 앱 스크립트.)

#### Commit 3: 임베딩 라이브러리 (필드별 텍스트 + 배치 호출)

- [ ] **src/shared/lib/embedding.ts**
  - 필드별 문장 생성: `serializeTraitToText(field: 'species'|'color'|'size'|'note', value)` 또는 `serializeTraitsToText`를 필드별로 호출해 `[종문장, 색문장, 크기문장, 메모문장]` 반환.
  - `createEmbedding(text: string)` 유지 + `createEmbeddings(texts: string[])`: `input: texts` 배열로 한 번에 호출, 반환 `number[][]` (또는 벡터 배열).
  - 기존 `serializeTraitsToText`(한 문장 concat)는 워커에서 더 이상 사용하지 않거나, 레거시 분기용으로만 유지.

#### Commit 4: 임베딩 워커 (entity당 4문장 → 1회 API → 4행 갱신)

- [ ] **src/app/api/v1/internal/embeddings/process/route.ts**
  - pending 행을 **entity 단위로 그룹화** `(entity_type, entity_id)`.
  - 그룹당 4개 trait(species, color, size, note) 텍스트 생성 → `createEmbeddings([...])` 1회 호출 → 반환 4벡터로 해당 entity의 `trait`별 4행 update (status=`'ready'`, embedding 저장).
  - entity당 1회 API 호출만 하도록 보장 (배치 4문장).

#### Commit 5: 유실글·목격 API (embeddings 4행 upsert)

- [ ] **src/app/api/v1/lost-posts/route.ts** (POST): embeddings insert를 1행이 아닌 **trait 4종 각 1행**(species, color, size, note) upsert. `onConflict`: `(entity_type, entity_id, modality, trait)`.
- [ ] **src/app/api/v1/lost-posts/[lostPostId]/route.ts** (PATCH 등): 해당 유실글에 대해 동일하게 4행 upsert.
- [ ] **src/app/api/v1/sightings/route.ts** (POST): 해당 목격에 대해 4행 upsert.

#### Commit 6: RPC get_recommendations_for_lost_post (4벡터 + 수식)

- [ ] **supabase/migrations/YYYYMMDDHHMMSS_get_recommendations_field_weights.sql** (또는 schema.sql 반영)
  - 유실글 4개 임베딩(종·색·크기·메모) 조회.
  - 후보 sighting마다 4개 임베딩 조회 → 코사인 유사도 4개 → \( S_{\text{text}} = w_s \cdot \text{sim}_s + w_c \cdot \text{sim}_c + w_z \cdot \text{sim}_z + w_n \cdot \text{sim}_n \).
  - `distance_km`, `time_diff_days` 계산 → `f_loc`, `f_time` → `score = S_text * f_loc * f_time`.
  - `order by score desc limit least(p_top_k, 100)`.
  - RPC 인자: 기존 `p_lost_post_id`, `p_radius_km`, `p_days`, `p_top_k` 유지. `w_s`, `w_c`, `w_z`, `w_n`, `λ_dist`, `λ_time`는 **함수 내 상수**로 고정(유저 변경 불가).

#### Commit 7: 추천 API 라우트 (RPC 호출만, 파라미터 변경 없음)

- [ ] **src/app/api/v1/recommendations/route.ts**
  - RPC `get_recommendations_for_lost_post` 호출은 기존과 동일. 가중치·λ는 RPC 내부 상수이므로 **쿼리 파라미터 추가 없음**.
  - 캐시 키: 기존 `buildCacheKey(radiusKm, days, topK)` 유지.

### 7-6.7 터치포인트 요약

| 위치 | 변경 요약 |
|------|-----------|
| docs/SDD.md | 7-6 섹션 추가 (본 문서). |
| supabase/migrations | embeddings `trait` 컬럼·unique 변경, 기존 embeddings 삭제, embedding_status pending, recommendation_cache 비우기, entity당 4행 백필. |
| supabase (RPC) | get_recommendations_for_lost_post: 4벡터 조회, S_text·f_loc·f_time·score 계산, 고정 w_*·λ 상수. |
| src/shared/lib/embedding.ts | 필드별 텍스트 생성, createEmbeddings(texts[]) 배치 호출. |
| src/app/api/v1/internal/embeddings/process/route.ts | entity 단위 그룹, 4문장 → 1회 API → 4행 update. |
| src/app/api/v1/lost-posts/route.ts | embeddings 4행 upsert (trait별). |
| src/app/api/v1/lost-posts/[lostPostId]/route.ts | embeddings 4행 upsert (trait별). |
| src/app/api/v1/sightings/route.ts | embeddings 4행 upsert (trait별). |
| src/app/api/v1/recommendations/route.ts | 변경 없음(또는 RPC 시그니처만 유지). |

### 7-6.8 알려진 제한·추후 개선

| 구분 | 내용 |
|------|------|
| 이미지 유사도 | 추천 스코어에 미포함. 추후 이미지 임베딩·하이브리드 스코어(텍스트+이미지) 별도 개선. |
| 하이퍼파라미터 | 유저 노출·변경 불가. 실험 완료 값으로 서버/RPC 상수 고정. |
| λ_dist, λ_time 초기값 | SDD 또는 코드 주석에 “실험 완료 값”으로 명시. 구체 수치는 구현 시 상수로 넣음. |
