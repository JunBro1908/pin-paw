# PinPaw 따뜻한 UX 개편 실행 가이드

> 기준일: 2026-08-02  
> 상태: 구현 IN PROGRESS — Goal COMPLETE 금지(브라우저·정책 페이지·DB 환경 gate 미충족)  
> 기준 설계: [PinPaw 따뜻한 현장 구조 도구 UX 설계](./superpowers/specs/2026-08-02-pinpaw-warm-field-ux-design.md)  
> 증거: [브라우저 검증 증거](./verification/2026-08-02-warm-ux-browser-evidence.md)

## 1. 승인된 방향

PinPaw의 기존 `#03C75A` 초록 정체성은 유지하되, 화면의 따뜻함은 cream 배경과
절제된 apricot accent, 실제 동물 사진, 부드러운 문장으로 만든다. 제품은 귀여운
AI 서비스가 아니라 긴급한 상황에서 신뢰할 수 있는 **현장 구조 도구 70% + 따뜻한
동네 네트워크 30%**로 다듬는다.

금지하는 표현은 emoji 탐색 icon, mascot 중심 화면, 3D illustration, glass effect,
장식용 gradient, 과도한 card와 shadow, 소수 AI similarity다. 강아지다운 인상은
발자국·산책 경로·목줄 tag처럼 실제 경험에 연결되는 outline detail에서만 만든다.

## 2. 활성 Goal

> PinPaw의 기존 초록색 정체성과 기능 일관성을 보존하면서 따뜻하고 강아지다운
> 현장 구조 도구 UX로 개편하고, 비회원 10초 목격 제보·지도 탐색·확인할 제보·사건
> 중심 내정보 흐름의 완성도를 검증 가능한 수준으로 높인다.

이 Goal은 화면 변경만으로 끝내지 않는다. 데이터 출처, 개인정보 경계, 접근성,
브라우저 시나리오, 운영 build 증거가 모두 연결되어야 완료다.

## 3. 실행 계획

순서를 바꾸지 않는다. 각 계획은 독립적으로 test 가능한 commit을 만든다.

1. [UX 기반과 목격 제보 계획](./superpowers/plans/2026-08-02-pinpaw-ux-foundation-sighting.md)
   - 의미 색상 token과 dark mode
   - 로컬 outline SVG icon과 실제 heading
   - `제보/지도/확인/내 활동` 탐색
   - 원시 좌표를 감춘 한 화면 비회원 제보
2. [지도와 확인할 제보 계획](./superpowers/plans/2026-08-02-pinpaw-map-confirmation.md)
   - 보호소 출처를 보존하는 RPC 계약
   - 목격·유실·보호소 marker와 legend
   - 지도 toolbar/detail sheet 단순화
   - AI 점수를 거리·시간·특징 근거로 대체
3. [내 활동과 출시 준비 계획](./superpowers/plans/2026-08-02-pinpaw-activity-release.md)
   - 활성 유실 사건 중심 dashboard
   - 명시적 로그인·정책 안내
   - lint/format 부채 제거
   - responsive, keyboard, accessibility, 10초 제보, production gate

## 4. Goal Checkpoint

| Checkpoint   | 완료 조건                                           | 상태                                          |
| ------------ | --------------------------------------------------- | --------------------------------------------- |
| UX-0 설계    | 색상, 정보 구조, 금지 표현, 접근성 기준 승인        | 완료                                          |
| UX-1 기반    | token, typography, SVG icon, 하단 탐색 test 통과    | 코드·단위 완료 (브라우저 미실행)              |
| UX-2 제보    | 한 화면 제보, 원시 좌표 비노출, lifecycle 회귀 없음 | 코드·단위 완료 (10초 실측 미실행)             |
| UX-3 지도    | 보호소 출처 RPC, marker, legend, 단일 detail sheet  | 코드·SQL 계약 완료 (DB apply·브라우저 미실행) |
| UX-4 확인    | 거리·시간·특징 근거, similarity/topK 비노출         | 코드·단위 완료 (로그인 E2E 미실행)            |
| UX-5 내 활동 | 최신 `searching` 사건과 다음 action 우선            | 코드·단위 완료 (로그인 E2E 미실행)            |
| UX-6 출시    | format/type/lint/test/build/browser gate 통과       | 부분 — browser/axe/정책 페이지/DB 미충족      |

## 5. 운영 안전 기준

- 공개 지도는 현재 coordinate masking과 zoom cap을 유지한다.
- 인증 지도는 세션 JWT와 차단 사용자 filter를 거친다.
- `shelter_animal_imports` table은 계속 `service_role` 전용이다.
- 추천 좌표는 기존 approximate 보호 함수를 통과한 뒤 응답한다.
- upload intent, idempotency key, claim-first 정렬, 신고·차단 action을 보존한다.
- 오류가 발생해도 입력, cache, 지도 선택 상태를 가능한 한 유지한다.
- SQL migration은 static contract test만으로 운영 반영을 주장하지 않는다.
- Docker/PostgreSQL 환경에서 `supabase db reset --local`과 concurrency test를
  통과하기 전까지 DB 실행 검증은 release blocker로 남긴다.

## 6. 현재 노트북 dependency 판정

### 현재 구현에 충분한 항목

- Node.js `22.23.1`
- npm `10.9.8`
- 현재 branch의 `node_modules`
- Next.js, React, TypeScript, ESLint, Prettier, Supabase CLI package
- 간접 설치된 `axe-core 4.11.0`

따라서 **UX 코드 구현을 시작하기 위한 추가 package 설치는 필요하지 않다.**

### 현재 없는 항목

- Docker runtime
- `psql`
- 직접 선언된 browser E2E runner

Docker와 `psql`은 로컬 Supabase migration/runtime 검증에 필요하지만 UI 구현 자체의
선행 조건은 아니다. Browser 자동화 package가 꼭 필요해지는 경우 package명, 고정
version, 설치 command, lockfile 영향을 먼저 보고하고 사용자의 명시적 승인을 받은
뒤 설치한다. `npm audit`처럼 외부 registry를 조회하는 검증도 동일한 승인 절차를
따른다.

## 7. 최종 완료 기준

- 4개 주요 route가 390×844, 768×1024, 1440×900에서 정보 손실 없이 동작한다.
- keyboard만으로 모든 핵심 action에 도달하고 focus가 보인다.
- 200% zoom과 320 CSS px에서 가로 scroll 없이 핵심 흐름을 완료한다.
- axe-core 4.11.0 결과가 critical 0, serious 0이다.
- 비회원 제보 준비 5회 측정 중앙값이 10.0초 이하다.
- `npm run format:check`, `typecheck`, `lint`, `test`, `build`가 모두 exit 0이다.
- production server의 `/`, `/map`, `/api/health`와 HTTP boundary test가 통과한다.
- DB migration은 승인된 로컬/검증 환경에서 reset과 permission matrix를 통과한다.
- 위 항목의 실제 증거가 `docs/verification`과 `PROJECT_STATUS_KO.md`에 연결된다.

하나라도 충족하지 못하면 Goal은 완료가 아니라 진행 중 또는 명시적 blocker 상태로
유지한다.
