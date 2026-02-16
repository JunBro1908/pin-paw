# PinPaw SDD (Software Design Document)

> **목격된 유실 동물의 발자국에 핀을 꽂으며 반려인과의 재회를 돕는 플랫폼**
>
> 작성일: 2026-02-16 | 마지막 업데이트: 2026-02-16

---

## 목차

1. [현재 구현 상태 요약](#1-현재-구현-상태-요약)
2. [커밋 단위 개발 계획](#2-커밋-단위-개발-계획)
   - [Phase 1: 기반 정비 & 버그 수정](#phase-1-기반-정비--버그-수정)
   - [Phase 2: 인증 시스템](#phase-2-인증-시스템)
   - [Phase 3: 목격 제보 고도화](#phase-3-목격-제보-고도화)
   - [Phase 4: 유실글 (Lost Posts) CRUD](#phase-4-유실글-lost-posts-crud)
   - [Phase 5: 마이페이지 & 사용자 기능](#phase-5-마이페이지--사용자-기능)
   - [Phase 6: 추천 시스템](#phase-6-추천-시스템)
   - [Phase 7: 안정화 & 최적화](#phase-7-안정화--최적화)
3. [기술 스택 정리](#3-기술-스택-정리)
4. [디렉토리 구조 계획](#4-디렉토리-구조-계획)

---

## 1. 현재 구현 상태 요약

### ✅ 완료 (약 55%)

| 영역                     | 상태    | 구현 내용                                                                        |
| ------------------------ | ------- | -------------------------------------------------------------------------------- |
| **목격 제보 폼 (`/`)**   | ✅ 완료 | SightingForm, 사진 업로드, 위치 자동 입력, Optimistic UI                         |
| **Presigned URL 업로드** | ✅ 완료 | `POST /api/v1/uploads/presign` — Rate Limit, Idempotency, IP 해싱                |
| **목격 저장 API**        | ✅ 완료 | `POST /api/v1/sightings` — 익명/인증 분기, PostGIS 위치 저장                     |
| **지도 뷰 (`/map`)**     | ✅ 완료 | 네이버 맵, 공개 클러스터 + 인증 마커, ETag 캐싱 (304)                            |
| **Public Clusters API**  | ✅ 완료 | `GET /api/v1/public/map/clusters` — bbox/zoom 기반, 좌표 마스킹                  |
| **Auth Markers API**     | ✅ 완료 | `GET /api/v1/auth/map/markers` — 인증 전용, 상세 정보 포함                       |
| **DB 스키마**            | ✅ 완료 | users, sightings, lost_posts, embeddings, recommendation_cache, idempotency_keys |
| **RLS 정책**             | ✅ 완료 | lost_posts 소유자 전용, sightings 공개 insert, recommendation_cache 소유자 전용  |
| **DB Functions**         | ✅ 완료 | `get_sighting_clusters()` — 줌 레벨 기반 그리드 클러스터링                       |
| **공통 UI**              | ✅ 완료 | Button, Text, Toast, Loading, Divider, Container                                 |
| **탭 네비게이션**        | ✅ 완료 | 하단 탭바 (홈, 지도, 추천, 내정보)                                               |

### ⚠️ 부분 구현 (약 15%)

| 영역                           | 상태 | 누락 사항                                                            |
| ------------------------------ | ---- | -------------------------------------------------------------------- |
| **Supabase 서버 클라이언트**   | ⚠️   | `createServerSupabaseClient` (세션 기반) 미구현, Service Role만 존재 |
| **Rate Limiting**              | ⚠️   | presign 라우트에만 적용, 나머지 API 미적용                           |
| **목격 폼 선택 입력**          | ⚠️   | 견종/색상/태그 선택 UI 미구현 (DB 컬럼은 존재)                       |
| **추천 페이지 (`/recommend`)** | ⚠️   | 하드코딩 플레이스홀더 UI만 존재                                      |
| **마이페이지 (`/my`)**         | ⚠️   | 정적 더미 데이터만 표시                                              |
| **API 응답 형식**              | ⚠️   | `success/data/error` 사용 중이나 spec의 `meta` 필드 미포함           |

### ❌ 미구현 (약 30%)

| 영역                   | 상태 | 필요 사항                                        |
| ---------------------- | ---- | ------------------------------------------------ |
| **로그인/회원가입 UI** | ❌   | Supabase Auth 연동 로그인/회원가입 페이지        |
| **인증 미들웨어**      | ❌   | Next.js middleware — 보호 라우트 리다이렉트      |
| **유실글 CRUD API**    | ❌   | `POST/GET/PATCH/DELETE /api/v1/lost-posts/*`     |
| **유실글 UI**          | ❌   | 등록 폼, 목록, 상세, 상태 관리                   |
| **추천 API**           | ❌   | `GET /api/v1/recommendations` — 벡터 검색 + 캐시 |
| **임베딩 생성**        | ❌   | 제보/유실글 저장 시 text 임베딩 비동기 생성      |
| **내 제보 목록**       | ❌   | `GET /api/v1/me/sightings`                       |
| **내 유실글 목록**     | ❌   | `GET /api/v1/me/lost-posts`                      |
| **SWR 통합**           | ❌   | 클라이언트 캐싱/재검증 라이브러리                |
| **에러 바운더리**      | ❌   | 전역 에러 핸들링                                 |
| **데이터 생명주기**    | ❌   | 28일 초과 데이터 아카이빙                        |

---

## 2. 커밋 단위 개발 계획

> 각 커밋은 독립적으로 동작 가능하고 롤백 안전한 단위로 설계되었습니다.
> 예상 소요 시간은 1인 개발 기준입니다.

---

### Phase 1: 기반 정비 & 버그 수정

#### Commit 1-1: 세션 기반 Supabase 서버 클라이언트 추가

**배경:**
현재 `src/shared/supabase/server.ts`에는 `createServerSupabase`(Service Role 기반)만 존재합니다.
`/api/v1/auth/map/markers/route.ts`에서 import하는 `createServerSupabaseClient`(세션 기반)가 정의되어 있지 않아 Auth 마커 API가 정상 동작하지 않습니다.

**변경 사항:**

- [x] `src/shared/supabase/server.ts`에 `createServerSupabaseClient` 함수 추가
  - `@supabase/ssr` 패키지 설치 (Next.js App Router 쿠키 기반 세션)
  - `cookies()` 를 활용한 세션 기반 클라이언트 생성
- [x] `@supabase/ssr` 의존성 추가 (`package.json`)
- [x] 기존 auth markers 라우트의 import 경로 확인 및 수정

**영향 범위:**

- `src/shared/supabase/server.ts`
- `src/app/api/v1/auth/map/markers/route.ts`
- `package.json`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | `npm run build` 실행 | 빌드 에러 없이 성공 |
| 2 | 비로그인 상태에서 `/api/v1/auth/map/markers` 요청 | 401 Unauthorized 응답 |
| 3 | 로그인 상태에서 `/api/v1/auth/map/markers` 요청 | 200 + 마커 데이터 반환 |

---

#### Commit 1-2: API 공통 응답 유틸리티 정비

**배경:**
스펙 문서에서 정의한 Response Envelope(`success / data / error / meta`)를 통일하고,
에러 코드 체계(`VALIDATION_ERROR`, `UNAUTHORIZED` 등)를 표준화합니다.

**변경 사항:**

- [x] `src/shared/lib/api-response.ts` 생성
  - `ApiSuccessResponse<T>` 및 `ApiErrorResponse` 타입 정의
  - `ok(data, meta?)`, `fail(code, message, status)` 헬퍼 함수
  - 에러 코드 enum: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`
- [x] `src/shared/types/api.ts` 업데이트 — 기존 `ApiResponse` 타입을 새 envelope과 통합
- [x] 기존 API 라우트들(`sightings`, `presign`, `clusters`, `markers`)의 응답을 새 헬퍼로 마이그레이션

**영향 범위:**

- `src/shared/lib/api-response.ts` (신규)
- `src/shared/types/api.ts`
- `src/app/api/v1/*/route.ts` (모든 API 라우트)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 정상 응답 시 JSON 구조 확인 | `{ success: true, data: {...}, meta: {...} }` |
| 2 | 400 에러 응답 시 JSON 구조 확인 | `{ success: false, error: { code: "VALIDATION_ERROR", message: "..." } }` |
| 3 | 기존 Sighting 제보 플로우 E2E | 기존 동작 유지 (회귀 없음) |

---

#### Commit 1-3: Rate Limiting 우선순위 체계 구현 (DB 기반, 모듈화)

**배경:**
기존 인라인 Rate Limiting을 체계화하고 우선순위를 적용합니다.
Vercel Serverless 환경 호환성을 위해 DB 기반 방식을 사용합니다.
중복 로직을 공통 유틸리티로 모듈화하여 재사용성을 높입니다.

**변경 사항:**

- [x] `src/shared/lib/rate-limit.ts` 생성 — DB 기반 공통 Rate Limiting 유틸리티
  - `checkRateLimit()` 함수: 우선순위 기반 체크
  - `RateLimitPresets.sighting`: 24h 30회, 1h 10회, 10s 쿨다운 설정
  - DB (`idempotency_keys`) 기반 체크로 Vercel Serverless 호환
  - 우선순위 정렬 및 가장 제한적인 메시지만 반환
- [x] `src/app/api/v1/uploads/presign/route.ts` 공통 유틸리티 적용 및 버그 수정
  - 중복 Rate Limit 로직을 `checkRateLimit()` 함수로 교체
  - 비회원만 적용
  - 누락된 `now = new Date()` 변수 선언 추가 (500 에러 수정)
- [x] `src/app/api/v1/sightings/route.ts` 공통 유틸리티 적용
  - 중복 Rate Limit 로직을 `checkRateLimit()` 함수로 교체
  - 비회원: 제보 성공 시 추적 기록 저장
  - IP/ipHash 변수 재사용으로 중복 호출 제거
- [x] `src/features/sightings/components/SightingForm.tsx` 에러 응답 처리 개선
  - HTTP 상태 코드 먼저 체크 (`!presignRes.ok`)
  - `error.message` 정확하게 파싱 (기존 `error` 객체 전체 사용 수정)
  - Rate Limit 메시지 정확하게 표시

**영향 범위:**

- `src/shared/lib/rate-limit.ts` (신규)
- `src/app/api/v1/uploads/presign/route.ts`
- `src/app/api/v1/sightings/route.ts`
- `src/features/sightings/components/SightingForm.tsx`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 10개 제보 후 11번째 제보 시도 (1시간 내) | "1시간 동안 최대 10회까지 제보할 수 있습니다" 메시지 |
| 2 | 30개 제보 후 31번째 제보 시도 (1일 내) | "하루 동안 최대 30회까지 제보할 수 있습니다" 메시지 |
| 3 | 1일 30회 + 1시간 10회 모두 초과 시 | 1일 30회 메시지만 표시 (우선순위) |
| 4 | 10초 내 재시도 | "잠시 후 다시 시도해주세요. (10초 쿨다운)" 메시지 |
| 5 | Rate Limit 이내 요청 | 200 정상 응답 |

---

### Phase 2: 인증 시스템

#### Commit 2-1: 카카오 로그인 (Supabase Auth + OAuth)

**배경:**
`추천`과 `마이페이지` 이용자는 인증 필수입니다. 보호자 식별 + 악성 유저(개장수) 방지를 위해
카카오 소셜 로그인을 구현합니다. Supabase Auth + Kakao OAuth를 사용합니다.
`지도`와 `제보`는 로그인 없이 사용 가능합니다.

**변경 사항:**

- [x] `public/images/kakao_login_medium_narrow.png` — 카카오 로그인 버튼 이미지 사용
  - 카카오 디자인 가이드라인 준수
  - 중간 크기, 좁은 버전 (183x45px)
- [x] `src/app/auth/login/page.tsx` — 카카오 로그인 페이지
  - 카카오 로그인 버튼 (이미지 사용)
  - Supabase `signInWithOAuth({ provider: 'kakao' })` 호출
  - 로그인 후 redirect 파라미터 처리
  - 이미 로그인된 경우 자동 리다이렉트
- [x] `src/app/auth/callback/route.ts` — OAuth 콜백 핸들러
  - Supabase Auth 코드 교환 처리 (`exchangeCodeForSession`)
  - 세션 쿠키 설정
  - redirect URL로 리다이렉트
- [x] `src/features/auth/hooks/useAuth.ts` — 인증 상태 관리 훅
  - `useAuth()`: session, user, signInWithKakao, signOut, isLoading
  - Supabase `onAuthStateChange` 구독
  - 초기 세션 로딩 처리
- [x] `src/features/auth/components/AuthGuard.tsx` — 인증 필요 래퍼 컴포넌트
  - 미인증 시 로그인 페이지로 리다이렉트 (현재 경로를 redirect 파라미터로 전달)
  - 로딩 중 fallback 지원
- [x] `src/app/(tabs)/recommend/page.tsx` — AuthGuard 적용
  - 추천 페이지를 AuthGuard로 감싸기
  - "use client" 추가
- [x] `src/app/(tabs)/my/page.tsx` — AuthGuard 적용
  - 마이페이지를 AuthGuard로 감싸기
  - "use client" 추가

**영향 범위:**

- `public/images/kakao_login_medium_narrow.png` (기존)
- `src/app/auth/login/page.tsx` (신규, 기존 이메일/비밀번호 버전 대체)
- `src/app/auth/callback/route.ts` (신규)
- `src/features/auth/hooks/useAuth.ts` (신규, 기존 이메일/비밀번호 버전 대체)
- `src/features/auth/components/AuthGuard.tsx` (신규, 기존 버전 대체)
- `src/app/(tabs)/recommend/page.tsx` (수정)
- `src/app/(tabs)/my/page.tsx` (수정)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 카카오 로그인 버튼 클릭 | 카카오 OAuth 페이지로 이동 |
| 2 | 카카오 계정으로 로그인 | Supabase에 세션 생성, redirect 페이지로 이동 |
| 3 | 로그인 후 `useAuth()` 호출 | `user` 객체 및 `session` 반환 |
| 4 | 미인증 상태에서 `/recommend` 접근 | 로그인 페이지로 리다이렉트 |
| 5 | 미인증 상태에서 `/my` 접근 | 로그인 페이지로 리다이렉트 |
| 6 | 미인증 상태에서 `/map` 접근 | 정상 접근 가능 (로그인 불필요) |
| 7 | 미인증 상태에서 제보 작성 | 정상 제출 가능 (로그인 불필요) |

---

#### Commit 2-2: (통합) 카카오 로그인 구현 완료

**참고:** Commit 2-1에서 AuthGuard 컴포넌트로 이미 라우트 보호 처리가 완료되었습니다.
별도의 미들웨어가 필요하지 않으며, 각 보호 페이지(`/recommend`, `/my`)에서
AuthGuard를 사용하여 클라이언트 사이드에서 인증을 체크합니다.

---

### Phase 3: 목격 제보 고도화

#### Commit 3-1: 제보 폼 선택 입력 UI 추가 (견종, 색상, 태그)

**배경:**
스펙 문서에서 정의한 선택 입력 필드(견종 선택, 색상 선택, 태그 기반 추가 정보)를
SightingForm에 추가합니다. DB의 `trait_color`, `trait_size`, `trait_state` 컬럼을 활용합니다.

**변경 사항:**

- [ ] `src/features/sightings/model/constants.ts` 생성
  - 견종 드롭다운 옵션 목록
  - 색상 드롭다운 옵션 목록 (흰색, 검정, 갈색, 크림, 회색, 혼합 등)
  - 크기 옵션 (소형, 중형, 대형)
  - 태그 옵션 목록 (목줄 있음, 옷 입음, 겁 많음, 사람을 잘 따름, 부상 의심 등)
- [ ] `src/features/sightings/components/TraitSelector.tsx` — 태그 선택 컴포넌트
  - 탭으로 토글 가능한 태그 칩 UI
- [ ] `SightingForm.tsx` 업데이트
  - 색상 드롭다운 (선택)
  - 크기 드롭다운 (선택)
  - 태그 셀렉터 (선택)
  - 필수 입력(사진, 위치, 시간) 이후 노출 (후순위 배치)
- [ ] `SightingFormData` 타입 업데이트
- [ ] `POST /api/v1/sightings` — `trait_color`, `trait_size`, `trait_state` 저장 로직 추가

**영향 범위:**

- `src/features/sightings/model/constants.ts` (신규)
- `src/features/sightings/components/TraitSelector.tsx` (신규)
- `src/features/sightings/components/SightingForm.tsx`
- `src/features/sightings/model/types.ts`
- `src/app/api/v1/sightings/route.ts`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 선택 입력 없이 필수 항목만 제출 | 정상 저장 (선택 필드 null) |
| 2 | 색상 "흰색" + 크기 "소형" + 태그 "목줄 있음" 선택 후 제출 | DB에 trait_color, trait_size, trait_state 정상 저장 |
| 3 | 태그 선택 → 해제 → 재선택 | 토글 정상 동작 |
| 4 | 전체 제보 플로우 (사진 + 위치 + 시간 + 선택 입력) | 10초 내 제보 완료 가능 여부 확인 |

---

#### Commit 3-2: SWR 도입 및 클라이언트 데이터 페칭 통합

**배경:**
스펙 문서의 Near Real-Time UX 전략에 따라, SWR (Stale-While-Revalidate)을 도입하여
지도 데이터의 캐시 우선 표시 + 백그라운드 재검증을 구현합니다.

**변경 사항:**

- [ ] `swr` 패키지 설치
- [ ] `src/shared/lib/fetcher.ts` — SWR용 공통 fetcher 생성
  - ETag 헤더 관리
  - 304 응답 시 캐시 유지
- [ ] `src/features/map/hooks/useMapData.ts` — SWR 기반 지도 데이터 훅
  - `useSWR`로 캐시 우선 렌더
  - `focusThrottleInterval` 설정 (탭 활성 시 재검증)
  - `revalidateOnFocus: true` (포커스 복귀 시 1회 재검증)
  - `refreshInterval` 조건부 설정 (지도 idle 시에만 폴링)
- [ ] `NaverMap.tsx` — SWR 훅으로 데이터 페칭 리팩토링 (기존 인라인 fetch 교체)

**영향 범위:**

- `package.json`
- `src/shared/lib/fetcher.ts` (신규)
- `src/features/map/hooks/useMapData.ts` (신규)
- `src/features/map/components/NaverMap.tsx`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | `/map` 진입 시 | 캐시 데이터 즉시 렌더 + 백그라운드 갱신 |
| 2 | 다른 탭 갔다가 `/map` 복귀 | 1회 자동 재검증 수행 |
| 3 | 데이터 변경 없는 상태에서 재검증 | 304 Not Modified (네트워크 절감) |
| 4 | 새 제보 등록 후 `/map` 이동 | 새 마커가 지도에 반영됨 |
| 5 | 오프라인 상태에서 `/map` 접근 | 캐시 데이터로 지도 표시 (에러 없음) |

---

### Phase 4: 유실글 (Lost Posts) CRUD

#### Commit 4-1: Lost Posts API — 생성 및 목록 조회

**배경:**
`찾습니다` 이용자가 유실 동물을 등록하고 관리할 수 있는 핵심 API를 구현합니다.
모든 유실글은 인증 사용자 소유로 관리됩니다.

**변경 사항:**

- [ ] `src/app/api/v1/lost-posts/route.ts` — POST (생성) + GET (내 목록)
  - **POST**: 인증 필수, coverPhotoKey, lostAt, lostLocation, traits 저장
  - Idempotency-Key 지원
  - embeddingStatus=pending으로 생성
  - **GET**: 인증 필수, 본인 소유 유실글 목록 (created_at DESC, 페이지네이션)
- [ ] `src/app/api/v1/lost-posts/[lostPostId]/route.ts` — GET / PATCH / DELETE
  - **GET**: 단건 상세 조회 (본인 소유만)
  - **PATCH**: 상태 변경 (searching → found → closed), traits 수정
  - **DELETE**: 소프트 삭제 or 하드 삭제
  - 소유자 검증 로직

**영향 범위:**

- `src/app/api/v1/lost-posts/route.ts` (신규)
- `src/app/api/v1/lost-posts/[lostPostId]/route.ts` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 인증 유저가 유실글 생성 | 201, DB에 owner_id와 함께 저장 |
| 2 | 비인증 유저가 유실글 생성 시도 | 401 UNAUTHORIZED |
| 3 | 본인 유실글 목록 조회 | 본인 소유 글만 반환 (created_at DESC) |
| 4 | 타인의 유실글 상세 조회 시도 | 404 NOT_FOUND (소유자 불일치) |
| 5 | 유실글 상태를 "found"로 변경 | status 정상 업데이트 |
| 6 | 동일 Idempotency-Key로 중복 생성 시도 | 기존 응답 반환 (중복 생성 방지) |
| 7 | 유실글 삭제 | DB에서 제거 + 관련 캐시 무효화 |

---

#### Commit 4-2: Lost Posts UI — 등록 폼 + 목록 페이지

**배경:**
유실글 등록 폼은 `/my` 페이지 내에서 접근하며,
사진 업로드 (Presigned URL 재활용), 유실 위치 (LocationPicker 재활용),
유실 시각, 특징 정보를 입력합니다.

**변경 사항:**

- [ ] `src/features/lost-posts/components/LostPostForm.tsx` — 유실글 등록 폼
  - 대표 사진 업로드 (Presigned URL, purpose=lost_cover)
  - 유실 위치 (LocationPicker 재활용)
  - 유실 시각 (datetime-local)
  - 색상, 크기, 상태 선택 (TraitSelector 재활용)
  - 인증 토큰 포함 요청
- [ ] `src/features/lost-posts/components/LostPostCard.tsx` — 유실글 카드 컴포넌트
  - 대표 사진 썸네일
  - 상태 뱃지 (searching / found / closed)
  - 유실 일시, 특징 요약
- [ ] `src/features/lost-posts/components/LostPostList.tsx` — 유실글 목록
  - SWR로 데이터 페칭
  - 빈 상태 UI ("아직 등록된 유실글이 없습니다")
- [ ] `src/app/(tabs)/my/lost-posts/new/page.tsx` — 유실글 등록 페이지 (AuthGuard)
- [ ] `src/app/(tabs)/my/lost-posts/page.tsx` — 내 유실글 목록 페이지

**영향 범위:**

- `src/features/lost-posts/components/` (신규 3개)
- `src/app/(tabs)/my/lost-posts/` (신규 2개)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 유실글 등록 폼 진입 (비로그인) | 로그인 페이지로 리다이렉트 |
| 2 | 사진 + 위치 + 시각 입력 후 등록 | 유실글 생성 + 목록에 표시 |
| 3 | 내 유실글 목록에서 카드 클릭 | 상세 페이지로 이동 |
| 4 | 유실글 0건 상태에서 목록 접근 | "아직 등록된 유실글이 없습니다" 표시 |
| 5 | 유실글 상태를 "찾았어요"로 변경 | 상태 뱃지 업데이트 |

---

#### Commit 4-3: Lost Posts 상세 페이지 + 상태 관리 UI

**변경 사항:**

- [ ] `src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx` — 유실글 상세 페이지
  - 대표 사진 (전체 크기)
  - 유실 정보 (위치, 시각, 특징)
  - 상태 변경 버튼 (searching → found → closed)
  - 삭제 버튼 (확인 다이얼로그)
  - "추천 보기" 링크 (→ `/recommend?lostPostId=xxx`)
- [ ] `src/features/lost-posts/components/StatusBadge.tsx` — 상태 뱃지 컴포넌트
- [ ] `src/features/lost-posts/hooks/useLostPost.ts` — 단건 조회 SWR 훅

**영향 범위:**

- `src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx` (신규)
- `src/features/lost-posts/components/StatusBadge.tsx` (신규)
- `src/features/lost-posts/hooks/useLostPost.ts` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 상세 페이지 진입 | 유실글 정보 정상 표시 |
| 2 | 타인의 유실글 URL 직접 접근 | 404 페이지 표시 |
| 3 | 상태를 "found"로 변경 | 확인 다이얼로그 → 상태 변경 → 뱃지 업데이트 |
| 4 | 유실글 삭제 | 확인 다이얼로그 → 삭제 → 목록으로 리다이렉트 |
| 5 | "추천 보기" 클릭 | `/recommend?lostPostId=xxx`로 이동 |

---

### Phase 5: 마이페이지 & 사용자 기능

#### Commit 5-1: 마이페이지 리팩토링 — 실제 사용자 데이터 연동

**변경 사항:**

- [ ] `src/app/(tabs)/my/page.tsx` 리팩토링
  - `useAuth()` 훅으로 실제 사용자 정보 표시
  - 로그인/비로그인 분기 UI
  - 비로그인: 로그인 유도 UI
  - 로그인: 프로필 정보 + 메뉴 (내 유실글, 내 제보, 로그아웃)
- [ ] 로그아웃 기능 (Supabase `signOut`)
- [ ] `src/features/auth/components/LoginPrompt.tsx` — 로그인 유도 컴포넌트

**영향 범위:**

- `src/app/(tabs)/my/page.tsx`
- `src/features/auth/components/LoginPrompt.tsx` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 비로그인 상태에서 `/my` 접근 | 로그인 유도 UI 표시 |
| 2 | 로그인 상태에서 `/my` 접근 | 이메일, 메뉴 목록 표시 |
| 3 | 로그아웃 버튼 클릭 | 세션 해제 + 홈으로 이동 |
| 4 | "내 유실글" 메뉴 클릭 | `/my/lost-posts`로 이동 |

---

#### Commit 5-2: 내 제보 목록 API 및 UI

**변경 사항:**

- [ ] `src/app/api/v1/me/sightings/route.ts` — GET (내 제보 목록)
  - 인증 필수 (userId 기반 조회)
  - Pagination (cursor 기반 or offset)
  - created_at DESC 정렬
- [ ] `src/features/sightings/components/MySightingList.tsx` — 내 제보 목록 컴포넌트
  - 제보 카드 (사진 썸네일 + 위치 + 시각)
  - SWR 기반 데이터 페칭
- [ ] `src/app/(tabs)/my/sightings/page.tsx` — 내 제보 목록 페이지

**영향 범위:**

- `src/app/api/v1/me/sightings/route.ts` (신규)
- `src/features/sightings/components/MySightingList.tsx` (신규)
- `src/app/(tabs)/my/sightings/page.tsx` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 로그인 유저가 내 제보 조회 | 본인이 인증 상태에서 작성한 제보만 반환 |
| 2 | 비인증 유저가 API 호출 | 401 UNAUTHORIZED |
| 3 | 제보 0건 상태 | "아직 작성한 제보가 없습니다" 표시 |
| 4 | 제보 카드 클릭 | 제보 상세 (지도 위치 표시) |

---

### Phase 6: 추천 시스템

#### Commit 6-1: 임베딩 생성 파이프라인

**배경:**
추천 시스템의 기반인 텍스트 임베딩을 생성합니다.
제보/유실글 저장 시 비동기적으로 임베딩을 생성하여 `embeddings` 테이블에 저장합니다.

**변경 사항:**

- [ ] `src/shared/lib/embedding.ts` — 임베딩 생성 유틸리티
  - OpenAI `text-embedding-3-small` API 호출
  - trait 정보(색상, 크기, 상태)를 텍스트로 직렬화
  - 위치/시간 정보를 정규화된 텍스트로 변환
- [ ] `src/app/api/v1/internal/embeddings/route.ts` — 내부 임베딩 생성 API
  - entity_type + entity_id를 받아 임베딩 생성
  - `embeddings` 테이블에 INSERT/UPDATE
  - status를 `pending → ready` 또는 `pending → failed`로 업데이트
- [ ] `src/app/api/v1/sightings/route.ts` 수정 — 제보 저장 후 비동기 임베딩 생성 트리거
- [ ] (후속) `lost-posts` 생성 API에서도 동일하게 트리거

> **NOTE:** 초기에는 API Route 기반 비동기 호출로 구현하고,
> 트래픽 증가 시 Supabase Edge Functions 또는 별도 Worker로 전환합니다.

**영향 범위:**

- `src/shared/lib/embedding.ts` (신규)
- `src/app/api/v1/internal/embeddings/route.ts` (신규)
- `src/app/api/v1/sightings/route.ts`
- `package.json` (openai 패키지 추가)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 새 제보 생성 | `embeddings` 테이블에 `status=pending` 레코드 생성 |
| 2 | 임베딩 생성 완료 | `status=ready`, `embedding` 벡터 저장 (1536차원) |
| 3 | OpenAI API 실패 시 | `status=failed`, 에러 로그 기록 |
| 4 | 이미 임베딩이 있는 엔티티에 재시도 | UPSERT로 덮어쓰기 |
| 5 | trait 정보가 없는 제보 | 위치+시간 정보만으로 임베딩 생성 |

---

#### Commit 6-2: 추천 API 구현

**배경:**
보호자의 유실글을 기준으로 유사한 목격 제보를 추천합니다.
Pre-filter(8km/8일) → pgvector 코사인 유사도 → Top-K → DB 캐시(TTL 180초) 전략을 사용합니다.

**변경 사항:**

- [ ] `src/app/api/v1/recommendations/route.ts` — GET
  - Query: `lostPostId`, `radiusKm=8`, `days=8`, `topK=10`
  - 인증 필수 + lostPostId 소유자 검증
  - 1단계: `recommendation_cache` 확인 (TTL 180초)
    - Cache Hit: 캐시 결과 반환
    - Cache Miss: 계산 수행
  - 2단계: Pre-filter
    - `ST_DWithin(sighting.location, lost_post.location, radiusKm * 1000)`
    - `sighting.created_at >= NOW() - INTERVAL '{days} days'`
    - `embedding.status = 'ready'`
  - 3단계: pgvector 코사인 유사도 계산 (후보군 내)
  - 4단계: Top-K 결과 + 유사도 점수 → 캐시 저장
  - Pending 처리: 임베딩 미생성 시 `{ status: "pending", items: [] }` 반환 (200 OK)
- [ ] Rate Limit 적용 (회원: 30초당 10회)

**영향 범위:**

- `src/app/api/v1/recommendations/route.ts` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 유실글 소유자가 추천 요청 | 유사도 점수 포함 Top-K 목격 목록 반환 |
| 2 | 비소유자가 추천 요청 | 403 FORBIDDEN |
| 3 | 임베딩 미생성 상태에서 요청 | `{ status: "pending", items: [] }` (200 OK) |
| 4 | 동일 요청 3분 내 재요청 | 캐시 결과 반환 (계산 없음) |
| 5 | 3분 경과 후 재요청 | 새로운 계산 수행 |
| 6 | 8km 반경 내 목격 없음 | `{ status: "ready", items: [] }` |
| 7 | 30초 내 11번째 요청 | 429 RATE_LIMITED |

---

#### Commit 6-3: 추천 페이지 UI 구현

**변경 사항:**

- [ ] `src/app/(tabs)/recommend/page.tsx` 리팩토링
  - 유실글 선택 (본인 유실글 목록 드롭다운 or 카드 선택)
  - 유실글 미등록 시 "먼저 유실글을 등록해주세요" 안내 + 등록 유도
  - 추천 결과 리스트
    - 목격 사진 + 위치 + 시각 + 유사도 점수
    - 유사도 근거 표시 (예: "거리 1.2km, 색상 유사")
  - Pending 상태 UI ("추천 준비중...")
  - 마지막 업데이트 시각 + 수동 새로고침 버튼
  - URL: `/recommend?lostPostId=xxx` (유실글 상세에서 진입 시)
- [ ] `src/features/recommendations/components/RecommendationCard.tsx` — 추천 카드
- [ ] `src/features/recommendations/hooks/useRecommendations.ts` — SWR 기반 훅

**영향 범위:**

- `src/app/(tabs)/recommend/page.tsx`
- `src/features/recommendations/` (신규 디렉토리)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 유실글 선택 후 추천 결과 조회 | 유사도 점수 높은 순으로 카드 표시 |
| 2 | 유실글 미등록 상태 | "먼저 유실글을 등록해주세요" + 등록 버튼 |
| 3 | Pending 상태 | "추천 준비중..." 로딩 UI |
| 4 | 새로고침 버튼 클릭 | 데이터 재검증 + 업데이트 시각 갱신 |
| 5 | 추천 결과 0건 | "아직 유사한 목격 제보가 없습니다" |
| 6 | 추천 카드 클릭 | 목격 상세 정보 (사진 확대, 위치 지도) |

---

### Phase 7: 안정화 & 최적화

#### Commit 7-1: 에러 바운더리 + 전역 에러 핸들링

**변경 사항:**

- [ ] `src/app/error.tsx` — 전역 에러 바운더리 (App Router)
  - 사용자 친화적 에러 메시지
  - "다시 시도" 버튼
  - 에러 로깅 (console.error → 추후 Sentry 등)
- [ ] `src/app/not-found.tsx` — 404 페이지
- [ ] `src/app/loading.tsx` — 전역 로딩 UI
- [ ] 각 탭 라우트별 `loading.tsx` 추가

**영향 범위:**

- `src/app/error.tsx` (신규)
- `src/app/not-found.tsx` (신규)
- `src/app/loading.tsx` (신규)
- `src/app/(tabs)/*/loading.tsx` (신규)

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 존재하지 않는 URL 접근 | 404 페이지 표시 |
| 2 | API 에러 발생 시 | 에러 바운더리 UI 표시 + "다시 시도" 버튼 |
| 3 | 페이지 전환 시 | 로딩 UI 표시 후 콘텐츠 렌더링 |
| 4 | "다시 시도" 클릭 | 페이지 리로드 |

---

#### Commit 7-2: 데이터 생명주기 관리 (28일 아카이빙)

**배경:**
스펙 문서에 따르면, `created_at < NOW() - INTERVAL '28 days'`인 데이터는
기본 조회/지도 노출에서 제외하되 완전 삭제하지 않고 Archived 상태로 관리합니다.

**변경 사항:**

- [ ] `supabase/schema.sql` — 컬럼 추가
  - `sightings` 테이블에 `archived_at timestamptz null` 추가
  - `lost_posts` 테이블에 `archived_at timestamptz null` 추가
- [ ] DB Function 또는 Cron Job
  - 28일 초과 sighting에 `archived_at = NOW()` 설정
  - (보호소 데이터는 예외 처리 — 추후 source_type 도입 시)
- [ ] 기존 조회 쿼리에 `WHERE archived_at IS NULL` 조건 추가
  - `get_sighting_clusters` 함수 수정
  - markers API 쿼리 수정
- [ ] 추천 쿼리에서도 아카이빙 데이터 제외

**영향 범위:**

- `supabase/schema.sql`
- `src/app/api/v1/public/map/clusters/route.ts`
- `src/app/api/v1/auth/map/markers/route.ts`
- `src/app/api/v1/recommendations/route.ts`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 29일 전 제보 데이터 | 지도에 표시되지 않음 |
| 2 | 27일 전 제보 데이터 | 지도에 정상 표시 |
| 3 | 아카이빙된 데이터 | DB에 존재하되 `archived_at` 값이 설정됨 |
| 4 | 아카이빙된 제보가 추천에 포함되는지 | 제외됨 |

---

#### Commit 7-3: 성능 최적화 — 번들 분할 + 이미지 최적화

**변경 사항:**

- [ ] 네이버 맵 스크립트 동적 import (lazy loading)
- [ ] 이미지 리사이즈/압축 — 클라이언트 측 업로드 전 처리
  - `browser-image-compression` 패키지 활용
  - 최대 너비 1200px, JPEG 품질 0.8로 압축
- [ ] Next.js Image 컴포넌트 활용 — 썸네일 표시 최적화
- [ ] `next.config.ts` — 이미지 도메인 설정 확인

**영향 범위:**

- `package.json`
- `src/features/sightings/components/SightingForm.tsx`
- `src/features/map/components/NaverMap.tsx`
- `next.config.ts`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 5MB 사진 업로드 | 클라이언트에서 압축 후 ~500KB 이하로 업로드 |
| 2 | `/map` 초기 로딩 | 네이버 맵 스크립트 lazy load (TTI 개선) |
| 3 | Lighthouse 성능 점수 | LCP < 2.5s, FID < 100ms 목표 |

---

#### Commit 7-4: 환경 변수 검증 + 보안 강화

**변경 사항:**

- [ ] `src/shared/lib/env.ts` — 환경 변수 검증 유틸리티
  - 필수 변수 누락 시 빌드 타임 에러
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID`
  - `OPENAI_API_KEY` (Phase 6 이후)
- [ ] 보안 헤더 설정 (`next.config.ts`)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`

**검증 시나리오:**
| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 필수 환경 변수 누락 시 | 빌드 실패 + 명확한 에러 메시지 |
| 2 | 보안 헤더 확인 | 응답에 보안 헤더 포함 |

---

## 3. 기술 스택 정리

### 현재 사용 중

| 기술         | 버전    | 용도                       |
| ------------ | ------- | -------------------------- |
| Next.js      | 16.1.1  | App Router, BFF API Routes |
| React        | 19.2.3  | UI 프레임워크              |
| TypeScript   | ^5      | 타입 안전성                |
| Supabase     | ^2.89.0 | Auth, DB, Storage          |
| Tailwind CSS | ^4      | 스타일링                   |
| Naver Maps   | -       | 지도 서비스 (Script 태그)  |

### 추가 예정

| 기술                        | 커밋 | 용도                   |
| --------------------------- | ---- | ---------------------- |
| `@supabase/ssr`             | 1-1  | 서버 쿠키 기반 세션    |
| `swr`                       | 3-2  | 클라이언트 캐시/재검증 |
| `openai`                    | 6-1  | text-embedding-3-small |
| `browser-image-compression` | 7-3  | 클라이언트 이미지 압축 |

---

## 4. 디렉토리 구조 계획

```
src/
├── app/
│   ├── (tabs)/
│   │   ├── page.tsx                          # ✅ 홈 (목격 제보)
│   │   ├── map/page.tsx                      # ✅ 지도 뷰
│   │   ├── recommend/page.tsx                # ⚠️ → 6-3에서 리팩토링
│   │   └── my/
│   │       ├── page.tsx                      # ⚠️ → 5-1에서 리팩토링
│   │       ├── sightings/page.tsx            # ❌ → 5-2에서 구현
│   │       └── lost-posts/
│   │           ├── page.tsx                  # ❌ → 4-2에서 구현
│   │           ├── new/page.tsx              # ❌ → 4-2에서 구현
│   │           └── [lostPostId]/page.tsx     # ❌ → 4-3에서 구현
│   ├── auth/
│   │   ├── login/page.tsx                    # ❌ → 2-1에서 구현
│   │   └── signup/page.tsx                   # ❌ → 2-1에서 구현
│   ├── api/v1/
│   │   ├── sightings/route.ts               # ✅ POST
│   │   ├── uploads/presign/route.ts          # ✅ POST
│   │   ├── public/map/clusters/route.ts      # ✅ GET
│   │   ├── auth/map/markers/route.ts         # ✅ GET (⚠️ 1-1에서 버그 수정)
│   │   ├── lost-posts/
│   │   │   ├── route.ts                      # ❌ → 4-1에서 구현
│   │   │   └── [lostPostId]/route.ts         # ❌ → 4-1에서 구현
│   │   ├── me/
│   │   │   └── sightings/route.ts            # ❌ → 5-2에서 구현
│   │   ├── recommendations/route.ts          # ❌ → 6-2에서 구현
│   │   └── internal/
│   │       └── embeddings/route.ts           # ❌ → 6-1에서 구현
│   ├── error.tsx                             # ❌ → 7-1에서 구현
│   ├── not-found.tsx                         # ❌ → 7-1에서 구현
│   └── loading.tsx                           # ❌ → 7-1에서 구현
├── middleware.ts                             # ❌ → 2-2에서 구현
├── features/
│   ├── sightings/
│   │   ├── components/
│   │   │   ├── SightingForm.tsx              # ✅ (⚠️ 3-1에서 확장)
│   │   │   ├── TraitSelector.tsx             # ❌ → 3-1에서 구현
│   │   │   └── MySightingList.tsx            # ❌ → 5-2에서 구현
│   │   ├── model/
│   │   │   ├── types.ts                      # ✅
│   │   │   └── constants.ts                  # ❌ → 3-1에서 구현
│   │   └── lib/
│   │       └── validators.ts                 # ✅
│   ├── map/
│   │   ├── components/
│   │   │   ├── NaverMap.tsx                  # ✅ (⚠️ 3-2에서 리팩토링)
│   │   │   └── LocationPicker.tsx            # ✅
│   │   ├── hooks/
│   │   │   └── useMapData.ts                 # ❌ → 3-2에서 구현
│   │   └── types/
│   │       └── naver.ts                      # ✅
│   ├── auth/
│   │   ├── hooks/
│   │   │   └── useAuth.ts                    # ❌ → 2-1에서 구현
│   │   └── components/
│   │       ├── AuthGuard.tsx                 # ❌ → 2-1에서 구현
│   │       └── LoginPrompt.tsx               # ❌ → 5-1에서 구현
│   ├── lost-posts/
│   │   ├── components/
│   │   │   ├── LostPostForm.tsx              # ❌ → 4-2에서 구현
│   │   │   ├── LostPostCard.tsx              # ❌ → 4-2에서 구현
│   │   │   ├── LostPostList.tsx              # ❌ → 4-2에서 구현
│   │   │   └── StatusBadge.tsx               # ❌ → 4-3에서 구현
│   │   └── hooks/
│   │       └── useLostPost.ts                # ❌ → 4-3에서 구현
│   └── recommendations/
│       ├── components/
│       │   └── RecommendationCard.tsx        # ❌ → 6-3에서 구현
│       └── hooks/
│           └── useRecommendations.ts         # ❌ → 6-3에서 구현
└── shared/
    ├── supabase/
    │   ├── server.ts                         # ✅ (⚠️ 1-1에서 확장)
    │   └── client.ts                         # ✅
    ├── lib/
    │   ├── api-response.ts                   # ❌ → 1-2에서 구현
    │   ├── rate-limit.ts                     # ❌ → 1-3에서 구현
    │   ├── embedding.ts                      # ❌ → 6-1에서 구현
    │   ├── env.ts                            # ❌ → 7-4에서 구현
    │   ├── fetcher.ts                        # ❌ → 3-2에서 구현
    │   ├── cn.ts                             # ✅
    │   ├── ip.ts                             # ✅
    │   ├── hash.ts                           # ✅
    │   └── assert.ts                         # ✅
    ├── types/
    │   └── api.ts                            # ✅ (⚠️ 1-2에서 확장)
    └── ui/
        ├── Button.tsx                        # ✅
        ├── Text.tsx                          # ✅
        ├── Toast.tsx                         # ✅
        ├── Loading.tsx                       # ✅
        ├── Divider.tsx                       # ✅
        └── Container.tsx                     # ✅
```

---

## 개발 우선순위 요약

```
Phase 1 (기반 정비)     ──→ Phase 2 (인증)     ──→ Phase 3 (제보 고도화)
                                  │
                                  ▼
                           Phase 4 (유실글)     ──→ Phase 5 (마이페이지)
                                  │
                                  ▼
                           Phase 6 (추천)       ──→ Phase 7 (안정화)
```

| Phase          | 커밋 수 | 예상 소요    | 우선순위 | 의존성     |
| -------------- | ------- | ------------ | -------- | ---------- |
| 1. 기반 정비   | 3       | 1~2일        | **P0**   | 없음       |
| 2. 인증 시스템 | 2       | 2~3일        | **P0**   | Phase 1    |
| 3. 제보 고도화 | 2       | 2~3일        | **P1**   | Phase 1    |
| 4. 유실글 CRUD | 3       | 3~4일        | **P0**   | Phase 2    |
| 5. 마이페이지  | 2       | 1~2일        | **P1**   | Phase 2, 4 |
| 6. 추천 시스템 | 3       | 4~5일        | **P1**   | Phase 4    |
| 7. 안정화      | 4       | 2~3일        | **P2**   | Phase 6    |
| **합계**       | **19**  | **~15-22일** |          |            |

---

> **참고:** 이 문서는 개발 진행에 따라 지속적으로 업데이트됩니다.
> 각 커밋의 검증 시나리오가 모두 통과하면 해당 커밋을 "완료"로 표시합니다.
