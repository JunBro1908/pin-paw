# PinPaw 공개 MVP 운영 안정성 Goal

## 1. Goal

> PinPaw의 전체 실행 코드와 SQL을 라인 범위별로 감사하고, Gate 0·Milestone 1·Milestone 2의 모든 체크리스트를 증거 기반으로 VERIFIED 상태로 만들어 공개 MVP 운영 안정성 기준을 충족한다.

- Goal 상태: `ACTIVE`
- 기준 commit: `aa7c48a2dfad8b63667219c225099510d316f12d + dirty working tree`
- 시작일: 2026-07-25
- 범위: Gate 0, Milestone 1, Milestone 2
- 제외: Milestone 3 추천 모델 고도화
- 상세 근거: [SECURITY_AND_QUALITY_AUDIT.md](./SECURITY_AND_QUALITY_AUDIT.md), [PUBLIC_MVP_ROADMAP.md](./PUBLIC_MVP_ROADMAP.md)

## 2. 상태와 완료 규칙

라인 감사와 과제 상태에는 다음 네 값만 사용한다.

| 상태          | 의미                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| `NOT_STARTED` | 관련 라인과 시나리오의 증거 기반 검토가 시작되지 않음                  |
| `IN_PROGRESS` | 검토 또는 구현·검증이 진행 중이며 완료 조건이 남음                     |
| `BLOCKED`     | 외부 권한·환경 등 명시된 차단 사유 때문에 진행할 수 없음               |
| `VERIFIED`    | 코드 리뷰, 실패 테스트, 자동 검증, 지정 스테이징 검증 증거가 모두 있음 |

Goal은 다음 조건을 동시에 만족할 때만 완료한다.

1. 이 문서의 모든 라인 감사와 G0/M1/M2 과제가 `VERIFIED`다.
2. 미해결 Critical/High finding, `OPEN`, `VERIFY`, 미완료 체크 항목이 모두 0개다.
3. 필수 자동 검증, 역할별 권한 행렬, 핵심 E2E, 복구 rehearsal, 7일 스테이징 soak test가 통과했다.
4. 배포·rollback·복구 runbook을 다른 작업자가 재현했다.
5. 문서 상태가 현재 코드·SQL·배포 환경과 일치한다.

코드가 바뀌면 해당 파일의 감사 상태를 즉시 `IN_PROGRESS`로 되돌리고 새 commit 기준으로 다시 검토한다. MD 변경은 관련 기능 단위에 포함하며 단독 커밋하지 않는다. 모든 커밋은 staged diff와 커밋 문구를 사용자에게 먼저 제시하고 승인받은 뒤 수행한다.

## 3. 필수 검증 기준선

| 검증                               | 현재 증거                                                               | 상태          | 남은 조건                                        |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| `npm test`                         | 2026-07-26, 198/198 통과                                                | `IN_PROGRESS` | 핵심 E2E·axe 브라우저 검증 확장                  |
| HTTP route integration             | Sentry 전 로컬 8/8 통과                                                 | `IN_PROGRESS` | Sentry 포함 재실행·정상 DB/Storage·staging       |
| `npx tsc --noEmit`                 | Next 16.2.11에서 통과                                                   | `IN_PROGRESS` | 각 기능 및 최종 기준 재실행                      |
| `npm run lint`                     | 0 errors, 0 warnings                                                    | `IN_PROGRESS` | CI와 깨끗한 설치 환경에서 재현                   |
| `npm run build`                    | 외부 폰트 없이 Webpack 27/27 통과                                       | `IN_PROGRESS` | CI와 깨끗한 `npm ci` 환경에서 재현               |
| `npm audit --omit=dev`             | 취약점 0                                                                | `IN_PROGRESS` | 깨끗한 CI 설치·staging smoke                     |
| 빈 DB migration replay/schema diff | 격리 프로젝트 `pin-paw-ops-verify`(`lxqygnjgtehvynohjgtx`)에 35/35 적용 | `IN_PROGRESS` | 프로덕션 drift 해소·schema diff·로컬 Docker 재현 |
| RLS·RPC·Storage 역할 행렬          | 동일 격리 DB에서 permission matrix + share privacy smoke 통과           | `IN_PROGRESS` | owner/admin 시나리오·동시성·staging 재실행       |
| 핵심 E2E                           | 실행 증거 없음                                                          | `NOT_STARTED` | 인증·업로드·추천·지도·claim·수정·삭제·알림       |
| 접근성 axe                         | UI primitive 계약 테스트만                                              | `IN_PROGRESS` | axe critical/serious 0·키보드 E2E                |
| backup/restore·계정 삭제 rehearsal | 실행 증거 없음                                                          | `NOT_STARTED` | RPO/RTO 및 삭제 기한 검증                        |
| 7일 staging soak                   | 실행 증거 없음                                                          | `NOT_STARTED` | 운영 지표와 알림 기준 충족                       |

## 4. 과제 원장

기존 감사 finding 25개는 `SECURITY_AND_QUALITY_AUDIT.md`의 `SEC-001`~`OPS-004`를 기준으로 한다. 각 과제의 상세 완료 기준과 연결 finding은 `PUBLIC_MVP_ROADMAP.md`를 따른다.

### Gate 0

| ID    | 과제                          | 연결 finding | 상태          | 현재 근거와 남은 조건                                              |
| ----- | ----------------------------- | ------------ | ------------- | ------------------------------------------------------------------ |
| G0-01 | 내부 Worker 인증·권한         | SEC-001      | `IN_PROGRESS` | fail-closed·Cron GET·claim lease; DB replay·staging 호출 필요      |
| G0-02 | production 의존성 취약점 제거 | SEC-002      | `IN_PROGRESS` | Babel 7.29.7 override·production audit 0; CI·staging 남음          |
| G0-03 | public table RLS·grant        | SEC-003      | `IN_PROGRESS` | 비공개 table revoke·RLS 구현; 실제 역할 CRUD matrix 필요           |
| G0-04 | RPC EXECUTE 최소 권한         | SEC-004      | `IN_PROGRESS` | auth.uid privacy RPC·claim 직접 쓰기 revoke; 실제 역할 matrix 필요 |
| G0-05 | 업로드 intent·소유권·정리     | SEC-005      | `IN_PROGRESS` | intent·실파일·원자 생성/소비·정리; DB/Storage 경쟁 검증 필요       |
| G0-06 | OAuth same-origin redirect    | SEC-006      | `IN_PROGRESS` | 우회 테스트 통과; staging OAuth 정상 복귀·변조 검증 필요           |
| G0-07 | atomic IP/user rate limit     | SEC-007      | `IN_PROGRESS` | 원자 RPC·IP/user 이중 제한 구현; 실제 50 동시 요청 검증 필요       |
| G0-08 | 공용 입력 schema              | SEC-008      | `IN_PROGRESS` | 입력 전수·64 KiB·HTTP 400/413 검증; DB/Storage E2E 필요            |
| G0-09 | CSP·보안 헤더                 | SEC-009      | `IN_PROGRESS` | env-bound origin·헤더 검증; inline 축소·staging E2E 필요           |
| G0-10 | Storage 정책 migration        | SEC-010      | `IN_PROGRESS` | public bucket·browser object 차단; 실제 역할 matrix 필요           |
| G0-11 | 테스트 계층 확장              | QUAL-001     | `IN_PROGRESS` | unit/계약·HTTP 실패경계·CI 구현; RLS·핵심 E2E 필요                 |
| G0-12 | CI 출시 Gate                  | QUAL-002     | `IN_PROGRESS` | release workflow·lint 0/0; 실제 GitHub run·branch 보호 필요        |
| G0-13 | migration 단일 진실 공급원    | DB-003       | `IN_PROGRESS` | 초기 schema·순서 preflight 2/2; 실제 replay·schema diff 필요       |
| G0-14 | sightings 직접 INSERT 차단    | SEC-011      | `IN_PROGRESS` | browser role INSERT revoke 구현; REST/API 통합 검증 필요           |
| G0-15 | 검색·지도 비용/bbox 제한      | SEC-012      | `IN_PROGRESS` | 검색·지도 상한 구현; DB burst·quota·EXPLAIN·staging 검증 필요      |
| G0-16 | Worker 장애·재시도·원자 완료  | QUAL-005     | `IN_PROGRESS` | provider/finalize/lease fault 4/4; DB replay·실경쟁 필요           |
| G0-17 | canonical origin 설정         | SEC-013      | `IN_PROGRESS` | APP/Supabase origin 검증·Host 입력 제거; staging 검증 필요         |
| G0-18 | Webpack 표준화·재현           | QUAL-006     | `IN_PROGRESS` | Google font 의존 제거·로컬 27/27; CI·깨끗한 `npm ci` 필요          |

### Milestone 1

| ID    | 과제                             | 연결 finding | 상태          | 완료 핵심                                                  |
| ----- | -------------------------------- | ------------ | ------------- | ---------------------------------------------------------- |
| M1-01 | request ID·redaction·구조화 로그 | OPS-001      | `IN_PROGRESS` | Sentry·redaction 구현; DSN/source map·staging trace 필요   |
| M1-02 | health/readiness                 | OPS-001      | `IN_PROGRESS` | liveness/config/DB 분리; staging 장애·alert 검증 필요      |
| M1-03 | 백업·복구 runbook                | OPS-002      | `IN_PROGRESS` | runbook 작성; RPO ≤24h, RTO ≤4h 실제 rehearsal 필요        |
| M1-04 | app_metadata 관리자·audit log    | OPS-003      | `IN_PROGRESS` | app_metadata·원자 hide·append-only audit; DB/E2E 필요      |
| M1-05 | 신고·차단·숨김·SLA               | OPS-003      | `IN_PROGRESS` | 중복 신고·차단 필터·24/72h SLA; DB/E2E·alert 필요          |
| M1-06 | 정밀 위치 권한 분리              | PRIV-001     | `IN_PROGRESS` | 마스킹·owner/후보 RPC 구현; DB 역할 matrix·match E2E 필요  |
| M1-07 | NaverMap 분리                    | QUAL-004     | `IN_PROGRESS` | domain/data/adapter/renderer 분리; 브라우저 누수 검증 필요 |
| M1-08 | SLO dashboard·alert              | OPS-004      | `IN_PROGRESS` | snapshot·RED·SLO evaluator 구현; live dashboard/alert 필요 |
| M1-09 | 계정 차단·삭제·보존              | PRIV-002     | `IN_PROGRESS` | ban·lease 삭제 worker·tombstone; DB/backup E2E 필요        |

### Milestone 2

| ID    | 과제                             | 연결 finding/선행 | 상태          | 완료 핵심                                                   |
| ----- | -------------------------------- | ----------------- | ------------- | ----------------------------------------------------------- |
| M2-01 | 인앱 알림                        | M1-01, M1-06      | `IN_PROGRESS` | `/my/notifications` UI·API·계약; staging delivery ≥95% 필요 |
| M2-02 | 제보 수정·사진 교체/삭제         | G0-05/08, M1-04   | `IN_PROGRESS` | EditForm traits/지도/idempotency; Storage orphan E2E 필요   |
| M2-03 | 상태 이력·허용 전이              | M1-01             | `IN_PROGRESS` | history API + 상세 UI; 금지 전이 E2E 필요                   |
| M2-04 | 안전한 공유 링크·Open Graph      | M1-06             | `IN_PROGRESS` | OG image·cover·DB privacy smoke; crawler snapshot 필요      |
| M2-05 | 접근성·모바일 지도 UX            | G0-11             | `IN_PROGRESS` | lang/skip/focus/aria primitive; axe·키보드 E2E 필요         |
| M2-06 | timeout/offline/중복 idempotency | G0-08             | `IN_PROGRESS` | client key/intent·EditForm lifecycle; 20-way fault E2E 필요 |
| M2-07 | first-party 퍼널 이벤트          | M1-08, M1-09      | `IN_PROGRESS` | 5이벤트 배선·opt-out 설정 UI; staging opt-out E2E 필요      |

## 5. 실행 코드·SQL 라인 감사 원장

라인 범위는 현재 dirty working tree 기준이다. `마지막 검토 기준`이 `미검토`인 항목은 파일 존재와 라인 수만 인벤토리한 것이며 코드 검토 완료를 뜻하지 않는다.

### 5.1 애플리케이션 페이지·API

| 파일                                                                              |  라인 | 역할                  | 신뢰 경계                   | 주요 실패 모드              | finding/과제                 | 상태          | 마지막 검토 기준                                       |
| --------------------------------------------------------------------------------- | ----: | --------------------- | --------------------------- | --------------------------- | ---------------------------- | ------------- | ------------------------------------------------------ |
| `src/app/(tabs)/layout.tsx`                                                       |  1-52 | 탭 레이아웃           | 브라우저/UI                 | 잘못된 탐색·상태            | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/loading.tsx`                                                      |  1-15 | 로딩 UI               | 브라우저/UI                 | 무한 로딩                   | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/map/page.tsx`                                                     |  1-63 | 지도 진입             | 브라우저→지도               | 오류 복구 실패              | M1-07, M2-05                 | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx`                              | 1-610 | 유실글 상세/claim     | 브라우저→인증 API           | IDOR·중복 요청              | AUTHZ-001, M2-06             | `IN_PROGRESS` | Image 최적화 변경 검토 필요                            |
| `src/app/(tabs)/my/lost-posts/new/page.tsx`                                       |  1-32 | 유실글 작성 진입      | 브라우저→폼                 | 인증 누락                   | G0-08                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/my/lost-posts/page.tsx`                                           |  1-16 | 내 유실글 목록        | 브라우저→인증 API           | 데이터 누락                 | G0-10                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/my/page.tsx`                                                      | 1-154 | 마이 페이지           | 브라우저→인증               | 세션·삭제 불일치            | M1-09                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/my/sightings/page.tsx`                                            |  1-35 | 내 제보 목록          | 브라우저→인증 API           | IDOR·오류 은폐              | AUTHZ-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/page.tsx`                                                         |  1-31 | 홈 화면               | 브라우저/UI                 | 탐색 실패                   | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/(tabs)/recommend/page.tsx`                                               | 1-361 | 추천 화면             | 브라우저→추천 API           | 민감 정보 노출·중복         | PRIV-001, M2-06              | `IN_PROGRESS` | token snapshot·Image 변경 검토                         |
| `src/proxy.ts`                                                                    |  1-20 | API request ID        | 비신뢰 header→서버 요청     | ID 위조·trace 단절          | OPS-001, M1-01               | `IN_PROGRESS` | 서버 UUID 강제·HTTP 8/8, staging trace 필요            |
| `src/app/api/v1/auth/map/markers/route.ts`                                        | 1-149 | 인증 지도 마커        | 사용자 JWT→권한 RPC         | 비회원 정밀 노출·차단 누락  | PRIV-001                     | `IN_PROGRESS` | 회원 확대 시 precise pin·비회원 mask; DB E2E 필요      |
| `src/app/api/v1/auth/sightings/[sightingId]/route.ts`                             |  1-59 | 인증 제보 상세        | 사용자 JWT→권한 RPC         | 비회원·차단 우회 IDOR       | PRIV-001, SEC-008            | `IN_PROGRESS` | 회원 정밀 상세·차단 필터; DB negative E2E 필요         |
| `src/app/api/v1/health/route.ts`                                                  |  1-15 | liveness endpoint     | monitor→앱 process          | dependency와 생존 혼동      | OPS-001, M1-02               | `IN_PROGRESS` | no-store HTTP 200, staging monitor 필요                |
| `src/app/api/v1/internal/embeddings/process/route.ts`                             | 1-287 | embedding Worker      | Cron→Service Role→DB/OpenAI | lease 상실·Cron 405         | SEC-001, QUAL-005            | `IN_PROGRESS` | 구조화 오류 로그·lease RPC, DB 검증 필요               |
| `src/app/api/v1/internal/uploads/cleanup/route.ts`                                |  1-26 | orphan 정리 Cron      | Cron→Storage/DB             | 무인증 삭제·정리 누락       | SEC-001, SEC-005             | `IN_PROGRESS` | fail-closed GET·단위 검증, staging 필요                |
| `src/app/api/v1/lost-posts/[lostPostId]/route.ts`                                 | 1-240 | 유실글 조회/수정      | 익명·사용자→DB              | IDOR·입력 위조              | AUTHZ-001, SEC-008           | `IN_PROGRESS` | 구조화 오류 로그·입력 경계, 권한 E2E 필요              |
| `src/app/api/v1/lost-posts/route.ts`                                              | 1-261 | 유실글 생성/목록      | 사용자→Storage/DB           | 파일 도용·중복 생성         | SEC-005/008, M2-06           | `IN_PROGRESS` | cache replay·멱등 RPC 검토, DB E2E 필요                |
| `src/app/api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]/route.ts` |  1-69 | claim 상세 변경       | 사용자→권한 RPC             | IDOR·불법 상태 전이         | AUTHZ-001, SEC-008           | `IN_PROGRESS` | owner-scoped unclaim RPC; DB E2E 필요                  |
| `src/app/api/v1/me/lost-posts/[lostPostId]/sighting-claims/route.ts`              | 1-157 | claim 목록/생성       | 사용자→권한 RPC             | 임의 UUID claim·stale cache | AUTHZ-001, SEC-008, PRIV-001 | `IN_PROGRESS` | owner·활성 cache·미보관 후보 검증; DB E2E 필요         |
| `src/app/api/v1/me/lost-posts/[lostPostId]/status-history/route.ts`               |  1-82 | 상태 이력 조회        | 사용자→RLS DB               | 타인 이력·actor 노출        | M2-03                        | `IN_PROGRESS` | owner·pagination·actor 제외 계약; DB E2E 필요          |
| `src/app/api/v1/me/lost-posts/map/paths/route.ts`                                 |  1-41 | 내 이동 경로          | 사용자→RPC                  | 위치·note 노출              | PRIV-001, OBS-001            | `IN_PROGRESS` | 구조화 오류 로그, 위치 권한 E2E 필요                   |
| `src/app/api/v1/me/lost-posts/map/route.ts`                                       |  1-50 | 내 유실글 지도        | 사용자→RPC                  | 정밀 위치 IDOR              | PRIV-001, SEC-008            | `IN_PROGRESS` | 구조화 오류 로그·pagination, 위치 E2E 필요             |
| `src/app/api/v1/me/sighting-claims/[sightingId]/route.ts`                         |  1-71 | 제보자 claim 응답     | 사용자→DB                   | IDOR·불법 전이              | AUTHZ-001, SEC-008           | `IN_PROGRESS` | 구조화 오류 로그·UUID, 권한 E2E 필요                   |
| `src/app/api/v1/me/sighting-claims/route.ts`                                      | 1-100 | 전역 북마크 목록/해제 | 사용자→RLS/RPC              | 직접 DELETE 회귀·IDOR       | AUTHZ-001, SEC-008           | `IN_PROGRESS` | 조회 RLS·원자 전체 해제 RPC; DB E2E 필요               |
| `src/app/api/v1/me/sighting-views/route.ts`                                       | 1-130 | 추천 열람 피드백      | 사용자→DB                   | 중복·타인 데이터 변경       | AUTHZ-001, SEC-008           | `IN_PROGRESS` | 구조화 오류 로그·500 UUID, DB E2E 필요                 |
| `src/app/api/v1/me/sightings/[sightingId]/route.ts`                               | 1-125 | 내 제보 상세/변경     | 사용자→DB                   | IDOR·orphan 파일            | AUTHZ-001, SEC-008           | `IN_PROGRESS` | 구조화 오류 로그·UUID, 권한 E2E 필요                   |
| `src/app/api/v1/me/sightings/route.ts`                                            |  1-59 | 내 제보 목록          | 사용자→DB                   | 타인 데이터 노출            | AUTHZ-001, SEC-008           | `IN_PROGRESS` | pagination 경계, 권한 E2E 필요                         |
| `src/app/api/v1/public/map/clusters/route.ts`                                     | 1-135 | 공개 지도 클러스터    | 익명→RPC                    | 위치 sweep·고비용 bbox      | SEC-008, RATE-002            | `IN_PROGRESS` | 구조화 오류 로그·bbox/rate, DB 검증 필요               |
| `src/app/api/v1/readiness/route.ts`                                               |  1-55 | readiness endpoint    | monitor→설정/Supabase       | 설정 누락·DB hang 노출      | OPS-001, M1-02               | `IN_PROGRESS` | fail-closed·3초 probe, staging 장애 필요               |
| `src/app/api/v1/recommendations/route.ts`                                         | 1-173 | 추천 API              | 사용자→Service Role RPC     | 매칭 전 정밀 위치 노출      | AUTHZ-003, SEC-008, PRIV-001 | `IN_PROGRESS` | owner 재검증·cache/fresh 좌표 grid 마스킹; DB E2E 필요 |
| `src/app/api/v1/search/local/route.ts`                                            | 1-152 | 지역 검색 proxy       | 익명→외부 API               | 키 오용·비용 폭증           | RATE-001, SEC-012            | `IN_PROGRESS` | 구조화 오류 로그·timeout/rate, staging 필요            |
| `src/app/api/v1/sightings/route.ts`                                               | 1-238 | 공개 제보 생성        | 익명·사용자→Storage/DB      | 파일 도용·중복 생성         | SEC-005/008/011/M2-06        | `IN_PROGRESS` | cache replay·멱등 RPC 검토, DB E2E 필요                |
| `src/app/api/v1/uploads/presign/route.ts`                                         | 1-211 | 업로드 서명           | 익명·사용자→Storage         | MIME/크기/소유권 위조       | SEC-005, SEC-008             | `IN_PROGRESS` | 구조화 오류 로그·intent, Storage 검증 필요             |
| `src/app/auth/callback/route.ts`                                                  |  1-27 | OAuth callback        | 외부 IdP→세션               | open redirect               | SEC-006, SEC-013             | `IN_PROGRESS` | `aa7c48a+dirty`, 우회 단위 테스트                      |
| `src/app/error.tsx`                                                               |  1-39 | 앱 오류 boundary      | 런타임→Sentry/브라우저      | 오류 누락·민감값 전송       | OPS-001, M1-01               | `IN_PROGRESS` | capture·sanitizer 연결, staging 필요                   |
| `src/app/global-error.tsx`                                                        |  1-27 | root 오류 boundary    | root runtime→Sentry/UI      | root 오류 누락              | OPS-001, M1-01               | `IN_PROGRESS` | capture 계약, staging event 필요                       |
| `src/app/layout.tsx`                                                              |  1-22 | root layout           | 서버→브라우저               | 외부 font build 의존        | G0-18                        | `IN_PROGRESS` | next/font/google 제거·offline Webpack 27/27            |
| `src/app/loading.tsx`                                                             |  1-15 | root 로딩 UI          | 브라우저/UI                 | 무한 로딩                   | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/app/not-found.tsx`                                                           |  1-23 | 404 UI                | 브라우저/UI                 | 잘못된 복구 동선            | M2-05                        | `NOT_STARTED` | 미검토                                                 |

### 5.2 기능·공유 라이브러리

| 파일                                                             |   라인 | 역할                        | 신뢰 경계                  | 주요 실패 모드                | finding/과제                 | 상태          | 마지막 검토 기준                                       |
| ---------------------------------------------------------------- | -----: | --------------------------- | -------------------------- | ----------------------------- | ---------------------------- | ------------- | ------------------------------------------------------ |
| `src/instrumentation.ts`                                         |   1-13 | server/edge 계측 hook       | Next runtime→Sentry        | runtime 초기화 누락           | OPS-001, M1-01               | `IN_PROGRESS` | request error capture 계약, staging 필요               |
| `src/instrumentation-client.ts`                                  |   1-26 | client 계측 hook            | 브라우저 오류→Sentry       | PII·query 전송                | OPS-001, M1-01               | `IN_PROGRESS` | no PII·sanitizer·5% trace, 실제 DSN 필요               |
| `src/features/auth/components/AuthGuard.tsx`                     |   1-39 | 인증 UI guard               | 브라우저 세션              | UI만 보호                     | AUTHZ-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/auth/components/LoginPrompt.tsx`                   |   1-48 | 로그인 유도                 | 브라우저→OAuth             | redirect 오염                 | AUTH-002                     | `NOT_STARTED` | 미검토                                                 |
| `src/features/auth/context/AuthContext.tsx`                      |  1-113 | 세션 상태                   | Supabase→브라우저          | stale session·구독 누수       | M1-09                        | `IN_PROGRESS` | 정적 정리 후 재검토 필요                               |
| `src/features/auth/hooks/useAuth.ts`                             |   1-29 | 인증 hook                   | 브라우저 세션              | 권한 오판                     | AUTHZ-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/lost-posts/components/LostPostCard.tsx`            |   1-89 | 유실글 카드                 | API 데이터→DOM             | 민감값 렌더링                 | PRIV-002                     | `IN_PROGRESS` | Image 최적화 변경 검토 필요                            |
| `src/features/lost-posts/components/LostPostForm.tsx`            |  1-446 | 유실글 폼                   | 사용자 입력→API/Storage    | 검증·중복·orphan              | INPUT-001, UPLOAD-002        | `IN_PROGRESS` | Image/정적 정리 후 재검토 필요                         |
| `src/features/lost-posts/components/LostPostList.tsx`            |  1-108 | 유실글 목록                 | API→DOM                    | paging·오류 누락              | QUAL-001                     | `IN_PROGRESS` | token snapshot 검토                                    |
| `src/features/lost-posts/components/StatusBadge.tsx`             |   1-49 | 상태 표시                   | 도메인 상태→DOM            | 잘못된 상태 표현              | M2-01                        | `NOT_STARTED` | 미검토                                                 |
| `src/features/lost-posts/hooks/useLostPost.ts`                   |   1-59 | 유실글 data hook            | 브라우저→API               | 경쟁·stale data               | M2-06                        | `NOT_STARTED` | 미검토                                                 |
| `src/features/lost-posts/model/types.ts`                         |   1-36 | 유실글 타입                 | API↔UI                     | 런타임 불일치                 | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/map/components/LocationPicker.tsx`                 |  1-425 | 위치 선택기                 | 사용자 위치→지도/API       | 과도한 정밀도·SDK 장애        | PRIV-001, M2-05              | `IN_PROGRESS` | `aa7c48a+dirty`, SDK 타입·mount 검토                   |
| `src/features/map/components/NaverMap.tsx`                       | 1-1477 | 지도 UI 조합                | API/SDK/브라우저 위치      | 브라우저 SDK 회귀             | QUAL-004                     | `IN_PROGRESS` | fallback 제거, 브라우저 검증 남음                      |
| `src/features/map/hooks/use-map-data.ts`                         |  1-326 | 지도 data hook              | 인증·viewport→API          | stale 계정 응답·취소 누락     | QUAL-004, PRIV-001           | `IN_PROGRESS` | guard/reducer·49 tests·build 통과                      |
| `src/features/map/lib/map-data-state.ts`                         |  1-139 | 지도 data reducer           | 비동기 응답→UI snapshot    | 타 계정 snapshot 노출         | QUAL-004, PRIV-001           | `IN_PROGRESS` | owner/principal RED→GREEN                              |
| `src/features/map/lib/map-domain.ts`                             |  1-155 | 지도 순수 계산              | API DTO→지도 표현          | 필터·grid·경로 계산 회귀      | QUAL-004                     | `VERIFIED`    | 4 characterization tests 통과                          |
| `src/features/map/lib/map-request-guard.ts`                      |   1-56 | 최신 요청 guard             | 요청 순서→state/cache      | 늦은 응답·unmount 갱신        | QUAL-004, PRIV-001           | `VERIFIED`    | 4 cancellation tests 통과                              |
| `src/features/map/lib/naver-map-adapter.ts`                      |  1-143 | SDK 자원 adapter            | 앱 lifecycle→Naver SDK     | listener·overlay 누수         | QUAL-004                     | `VERIFIED`    | 그룹·listener cleanup 4/4, 앱 연결                     |
| `src/features/map/lib/map-layer-renderer.ts`                     |  1-397 | 지도 layer renderer         | 도메인 결과→Naver overlay  | marker·frame·timer 누수       | QUAL-004                     | `VERIFIED`    | marker/path cleanup 5/5, 앱 연결                       |
| `src/features/map/types/naver.ts`                                |  1-138 | 지도 SDK 타입               | 외부 SDK↔앱                | 타입 드리프트                 | QUAL-004                     | `IN_PROGRESS` | 공식 listener 제거 계약 반영                           |
| `src/features/recommendations/components/RecommendationCard.tsx` |  1-282 | 추천 카드                   | API→DOM/claim              | 위치 노출·중복 동작           | PRIV-001, M2-06              | `IN_PROGRESS` | Image 최적화 변경 검토 필요                            |
| `src/features/recommendations/hooks/useRecommendations.ts`       |   1-97 | 추천 data hook              | 브라우저→API               | race·재시도 폭주              | RATE-002, M2-06              | `IN_PROGRESS` | ref lifecycle 검토                                     |
| `src/features/recommendations/model/types.ts`                    |   1-16 | 추천 타입                   | API↔UI                     | 런타임 불일치                 | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/sightings/components/MySightingCard.tsx`           |  1-156 | 내 제보 카드                | API→DOM                    | 민감값 노출                   | PRIV-002                     | `IN_PROGRESS` | Image 최적화 변경 검토 필요                            |
| `src/features/sightings/components/MySightingList.tsx`           |  1-110 | 내 제보 목록                | API→DOM                    | 오류·paging 누락              | QUAL-001                     | `IN_PROGRESS` | token snapshot·cleanup 검토                            |
| `src/features/sightings/components/SightingDetailCard.tsx`       |  1-150 | 제보 상세 카드              | API→DOM                    | 정밀 위치/note 노출           | PRIV-001                     | `NOT_STARTED` | 미검토                                                 |
| `src/features/sightings/components/SightingDetailSheet.tsx`      |   1-39 | 제보 상세 sheet             | UI 상태                    | focus trap 실패               | M2-05                        | `IN_PROGRESS` | unused prop 제거; 접근성 미완료                        |
| `src/features/sightings/components/SightingForm.tsx`             |  1-573 | 제보 폼                     | 사용자 입력→API/Storage    | 위조·중복·orphan              | INPUT-001, UPLOAD-002, M2-06 | `IN_PROGRESS` | 생성 요청 key 추가; retry 수명 설계 필요               |
| `src/features/sightings/constants/breeds.ts`                     |   1-33 | 품종 상수                   | 입력↔도메인                | 허용값 불일치                 | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/sightings/lib/validators.ts`                       |   1-20 | 제보 검증                   | 사용자 입력→도메인         | 서버 검증과 불일치            | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/features/sightings/model/types.ts`                          |   1-37 | 제보 타입                   | API↔UI                     | 런타임 불일치                 | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/shared/constants/traitColors.ts`                            |  1-119 | 색상 토큰                   | 입력↔embedding             | schema drift                  | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/shared/constants/traitSizes.ts`                             |   1-57 | 크기 토큰                   | 입력↔embedding             | schema drift                  | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/shared/constants/traitTags.ts`                              |   1-99 | 특징 토큰                   | 입력↔embedding             | schema drift                  | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/api-response.ts`                                 |  1-110 | API 응답 규격               | 서버→클라이언트            | 내부 오류·민감값 노출         | OBS-001                      | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/api-input.ts`                                    |  1-418 | 공용 API 입력 schema        | 비신뢰 body/query→route    | 타입·크기·좌표·ID 위조        | SEC-005, SEC-008             | `IN_PROGRESS` | 단위 9/9·HTTP 실패경계 5/5, DB E2E 필요                |
| `src/shared/lib/api-request.ts`                                  |   1-70 | bounded JSON reader         | HTTP stream→validator      | 과대·위조 length·UTF-8 오류   | SEC-008                      | `VERIFIED`    | RED 0/3 → GREEN 3/3, 64 KiB                            |
| `src/shared/lib/app-origin.ts`                                   |   1-75 | canonical origin 검증       | 환경 설정→내부 HTTP        | Host 변조·secret 외부 전송    | SEC-006, SEC-013             | `IN_PROGRESS` | `aa7c48a+dirty`, 단위 테스트 통과                      |
| `src/shared/lib/authenticated-list.ts`                           |   1-30 | token-bound 목록 상태       | 인증 session→UI            | 계정 전환 시 stale 노출       | QUAL-002, PRIV-001           | `IN_PROGRESS` | `aa7c48a+dirty`, 단위 테스트 통과                      |
| `src/shared/lib/assert.ts`                                       |   1-12 | invariant                   | 런타임 내부                | 오류 처리 누락                | QUAL-001                     | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/cn.ts`                                           |   1-25 | class 병합                  | UI 내부                    | 스타일 충돌                   | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/cron-auth.ts`                                    |   1-75 | Cron 인증·실행 guard        | 외부 요청→내부 Worker      | secret 누락 시 공개           | AUTH-001                     | `VERIFIED`    | `aa7c48a+dirty`, 2026-07-25                            |
| `src/shared/lib/date.ts`                                         |   1-12 | 날짜 표시                   | 서버 시간→UI               | timezone 오표시               | M2-01                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/embedding.ts`                                    |  1-109 | embedding 생성/직렬화       | 앱→OpenAI                  | 비용·timeout·차원 오류        | QUAL-005                     | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/embedding-queue.ts`                              |   1-39 | Worker 조회 결과 분류       | DB 응답→Worker             | DB 오류를 빈 결과로 오인      | QUAL-005                     | `IN_PROGRESS` | `aa7c48a+dirty`, 단위 테스트 통과                      |
| `src/shared/lib/embedding-job-processor.ts`                      |  1-121 | Worker job 처리 경계        | provider/DB RPC→상태       | raw 오류·lease 덮어쓰기       | QUAL-005, G0-16              | `VERIFIED`    | provider/finalize/lease fault 4/4                      |
| `src/shared/lib/form-submission-lifecycle.ts`                    |   1-83 | form 멱등 수명              | 파일/payload→key·intent    | timeout 중복·다른 파일 재사용 | M2-06                        | `VERIFIED`    | 동일 payload 재사용·SHA-256 회전 4/4                   |
| `src/shared/lib/embeddings-worker.ts`                            |   1-50 | Worker 호출 client          | Vercel Cron→내부 API       | 잘못된 origin·인증 실패 은폐  | SEC-001, QUAL-005            | `IN_PROGRESS` | request logger 연계, staging 실패 검증                 |
| `src/shared/lib/hash.ts`                                         |    1-8 | hash                        | 입력→식별자                | 충돌·민감값 오용              | SEC-003                      | `NOT_STARTED` | 미검토                                                 |
| `src/shared/lib/idempotency.ts`                                  |   1-47 | 멱등 응답 replay            | API→Service Role DB        | 타 신원 cache·rate limit 차단 | SEC-005, M2-06               | `IN_PROGRESS` | hit/conflict/miss/error 단위 2/2, DB 필요              |
| `src/shared/lib/client-ip.ts`                                    |   1-19 | trusted IP 순수 경계        | Vercel header→식별자       | 위조·잘못된 IP                | RATE-001                     | `VERIFIED`    | Vercel/non-Vercel·malformed 2/2                        |
| `src/shared/lib/ip.ts`                                           |   1-10 | Next client IP adapter      | request headers→순수 경계  | 비-Vercel header 신뢰         | RATE-001                     | `IN_PROGRESS` | VERCEL=1에서만 신뢰, staging 필요                      |
| `src/shared/lib/monitoring-sanitizer.ts`                         |  1-165 | Sentry event/span 정제      | 오류/trace→외부 SaaS       | query·body·user·note 전송     | OPS-001, M1-01               | `IN_PROGRESS` | 민감 payload 제거 2/2, staging 확인 필요               |
| `src/shared/lib/operational-health.ts`                           |   1-64 | readiness 판정              | 환경/DB probe→운영 상태    | 누락 설정 허용·오류 노출      | OPS-001, M1-02               | `IN_PROGRESS` | Sentry DSN 포함 RED→GREEN 3/3, staging 필요            |
| `src/shared/lib/privacy-location.ts`                             |   1-50 | 추천 좌표 마스킹            | 정밀 좌표→API 응답         | claim으로 정밀도 해제         | PRIV-001, M1-06              | `VERIFIED`    | stable 0.05° grid·claim 비해제 3/3                     |
| `src/shared/lib/public-api-guard.ts`                             |  1-107 | 검색·bbox 입력 경계         | 공개 query→API             | sweep·숫자 prefix 입력        | SEC-008, SEC-012             | `VERIFIED`    | query/control/bbox 경계 3/3                            |
| `src/shared/lib/rate-limit.ts`                                   |  1-148 | atomic rate limit           | 요청→Service Role RPC      | 동시 승인 초과·회원 우회      | RATE-001, RATE-002           | `IN_PROGRESS` | IP/user 이중 RPC, 실제 동시성 필요                     |
| `src/shared/lib/structured-log.ts`                               |  1-227 | 구조화 로그·Sentry 연계     | 오류/컨텍스트→로그/Sentry  | secret·위치·note 노출         | OPS-001, M1-01               | `IN_PROGRESS` | 단위 7/7·API console 0, staging 필요                   |
| `src/shared/lib/upload-intents.ts`                               |  1-189 | 실파일 검증·orphan 정리     | Storage/intent→도메인 생성 | 신원·size·magic·late orphan   | SEC-005, SEC-010, M2-06      | `IN_PROGRESS` | 소비 후 replay 경계·단위 6/6, Storage 필요             |
| `src/shared/supabase/client.ts`                                  |   1-43 | 브라우저 anon client        | 브라우저→Supabase          | env·세션 구성 오류            | SEC-003                      | `IN_PROGRESS` | 전 라인 감사: 공개키만 사용, browser smoke 필요        |
| `src/shared/supabase/server.ts`                                  |   1-84 | cookie/Service Role clients | 서버→Supabase 특권         | 특권 client 오용·env 누락     | SEC-003, PRIV-001            | `IN_PROGRESS` | server-only·명시적 이름·fail-fast 2/2, bundle E2E 필요 |
| `src/shared/types/api.ts`                                        |   1-21 | 공용 API 타입               | 서버↔클라이언트            | 응답 계약 드리프트            | INPUT-001                    | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Button.tsx`                                       |   1-42 | 버튼                        | 사용자→UI                  | keyboard/focus 실패           | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Container.tsx`                                    |   1-17 | 레이아웃                    | UI 내부                    | 반응형 실패                   | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Divider.tsx`                                      |    1-8 | 구분선                      | UI 내부                    | 접근성 의미 오류              | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Loading.tsx`                                      |   1-10 | 로딩 표시                   | UI 내부                    | screen reader 상태 누락       | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Text.tsx`                                         |   1-49 | 텍스트 primitive            | 데이터→DOM                 | 의미/대비 오류                | M2-05                        | `NOT_STARTED` | 미검토                                                 |
| `src/shared/ui/Toast.tsx`                                        |   1-51 | 알림 UI                     | 앱 상태→DOM                | focus/announcement 누락       | M2-05                        | `NOT_STARTED` | 미검토                                                 |

### 5.3 SQL·migration

| 파일                                                                                   |    라인 | 역할                   | 신뢰 경계              | 주요 실패 모드               | finding/과제                  | 상태          | 마지막 검토 기준                              |
| -------------------------------------------------------------------------------------- | ------: | ---------------------- | ---------------------- | ---------------------------- | ----------------------------- | ------------- | --------------------------------------------- |
| `supabase/schema.sql`                                                                  |   1-641 | 통합 schema snapshot   | 역할→DB/RLS/RPC        | migration drift·과권한       | DB-001~003, G0-03/04/10/13/14 | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218000000_initial_schema.sql`                                |   1-256 | 빈 DB 초기 schema      | migration→DB           | 기본 객체·RLS 누락           | DB-003, G0-13                 | `IN_PROGRESS` | 순서 preflight 2/2, DB replay 필요            |
| `supabase/migrations/20250218120000_add_archived_at_28d_archiving.sql`                 |   1-255 | 보관·추천 함수         | 역할→DB/RPC            | security definer·권한        | DB-001, PRIV-003              | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218140000_add_user_sighting_feedback_7_5.sql`                |    1-68 | 피드백                 | 사용자→DB              | 타인 row 변경                | AUTHZ-001                     | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218160000_remove_dismissed_from_user_sighting_views.sql`     |     1-3 | 컬럼 제거              | migration→DB           | replay 순서 오류             | DB-003                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218170000_add_pet_name_to_lost_posts.sql`                    |     1-5 | pet_name 추가          | migration→DB           | schema drift                 | DB-003                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218180000_add_organizations_tenant_support.sql`              |    1-54 | tenant 추가(폐기 전)   | migration→DB           | 잔존 객체·RLS 오류           | DB-003                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250218190000_remove_organizations_tenant_support.sql`           |    1-14 | tenant 제거            | migration→DB           | 불완전 rollback              | DB-003                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250219100000_add_get_my_lost_posts_with_location.sql`           | 빈 파일 | 비어 있는 migration    | migration→DB           | 누락된 의도·replay 착시      | DB-003                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250219110000_lost_posts_map_add_display_fields.sql`             |    1-28 | 지도 RPC 수정          | 사용자→RPC             | 정밀 위치/권한               | PRIV-001, DB-001              | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250220100000_add_get_sighting_detail.sql`                       |    1-25 | 제보 상세 RPC          | 사용자→RPC             | IDOR·정밀 위치               | AUTHZ-003, PRIV-001           | `IN_PROGRESS` | 전 라인 감사: 소유권 없는 definer 상세        |
| `supabase/migrations/20250220110000_add_get_my_lost_post_paths.sql`                    |    1-59 | 경로 RPC               | 사용자→RPC             | 위치/note 노출               | PRIV-001, DB-001              | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250222100000_extend_get_my_lost_post_paths_with_photo_note.sql` |    1-62 | 경로 RPC 확장          | 사용자→RPC             | note·사진 과노출             | PRIV-001                      | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223100000_embeddings_trait_field.sql`                        |    1-39 | embedding 컬럼         | Worker→DB              | 상태 불일치                  | QUAL-005                      | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223110000_get_recommendations_field_weights.sql`             |    1-98 | 추천 RPC               | 사용자→RPC             | EXECUTE 과권한·비용          | DB-001, AUTHZ-003             | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223120000_embeddings_one_row_four_columns.sql`               |    1-68 | embedding 구조 변경    | Worker→DB              | 부분 업데이트                | QUAL-005                      | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223140000_get_recommendations_null_sim_half.sql`             |    1-96 | 추천 점수 수정         | 사용자→RPC             | null 처리·권한               | DB-001                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223150000_reset_embeddings_pending.sql`                      |    1-33 | embedding 상태 reset   | migration→DB           | 작업 중복·유실               | QUAL-005                      | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250223160000_remove_loc_time_from_score.sql`                    |    1-90 | 추천 점수 수정         | 사용자→RPC             | 과권한·회귀                  | DB-001                        | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250224000000_trait_tags_and_color_tokens.sql`                   |    1-15 | trait token 컬럼       | 입력→DB                | schema drift                 | INPUT-001                     | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20250224010000_recommendations_experiment2_tokens_tags.sql`       |   1-147 | 추천 RPC 실험2         | 사용자→RPC             | 권한·성능·null 회귀          | DB-001, RATE-002              | `NOT_STARTED` | 미검토                                        |
| `supabase/migrations/20260725000000_atomic_embedding_jobs.sql`                         |   1-211 | Worker 원자 job RPC    | Service Role→DB        | 중복 claim·부분 완료         | SEC-001, QUAL-005             | `IN_PROGRESS` | 정적 계약 5/5, DB replay 필요                 |
| `supabase/migrations/20260725010000_lock_down_data_plane.sql`                          |   1-125 | table/RPC 권한 행렬    | 브라우저 역할→DB       | 직접 쓰기·RPC 우회           | SEC-003/004/011               | `IN_PROGRESS` | 정적 계약 5/5, DB role matrix 필요            |
| `supabase/migrations/20260725020000_atomic_rate_limits.sql`                            |   1-110 | fixed-window counter   | Service Role→DB        | count 경쟁·bucket 누적       | SEC-007/012                   | `IN_PROGRESS` | 정적 계약 3/3, DB 동시성 필요                 |
| `supabase/migrations/20260725030000_upload_intents.sql`                                |   1-347 | intent·Storage 정책    | Storage/API→DB         | key 재사용·직접 object 조작  | SEC-005/010/011               | `IN_PROGRESS` | 정적 계약 6/6, 실제 matrix 필요               |
| `supabase/migrations/20260725040000_atomic_domain_idempotency.sql`                     |   1-407 | 원자 멱등 도메인 생성  | API→DB                 | 동시 중복·부분 커밋          | SEC-005, M2-06                | `IN_PROGRESS` | 계약 3/3, DB 20-way 경쟁 검증 필요            |
| `supabase/migrations/20260725050000_protect_precise_sighting_locations.sql`            |   1-423 | 정밀 위치·claim RPC    | 사용자 JWT→DB          | 위치/note IDOR·직접 mutation | PRIV-001, M1-06               | `IN_PROGRESS` | 정적 경계 5/5·마스킹 3/3, DB 역할 matrix 필요 |
| `supabase/migrations/20260725070000_lost_post_status_history.sql`                      |    1-94 | 상태 전이·이력         | 사용자 update→trigger  | 불법 전이·이력 유실          | M2-03                         | `IN_PROGRESS` | 상태/권한/API 계약 5/5, DB replay 필요        |
| `supabase/migrations/20260725080000_admin_moderation_audit.sql`                        |   1-222 | 관리자 숨김·감사       | app_metadata→권한 RPC  | 권한 남용·감사 변조          | OPS-003, M1-04                | `IN_PROGRESS` | 로컬 계약 4/4, DB role/admin E2E 필요         |
| `supabase/migrations/20260725090000_reports_blocks_sla.sql`                            |   1-824 | 신고·차단·SLA          | 사용자/관리자→권한 RPC | 중복 신고·차단 우회·SLA 누락 | OPS-003, M1-05                | `IN_PROGRESS` | 로컬 계약 6/6, DB 동시성·역할 E2E 필요        |
| `supabase/migrations/20260726000000_auth_map_precise_pins.sql`                         |   1-211 | 회원 지도 정밀 핀 복원 | 인증 JWT→RPC           | 비회원 정밀·줌 캡 회귀       | PRIV-001, M1-06               | `IN_PROGRESS` | contract + ops-verify 적용, 브라우저 E2E 필요 |
| `supabase/migrations/20260725100000_account_deletion_jobs.sql`                         |   1-437 | 계정 삭제 lease queue  | 사용자/Worker→Auth/DB  | 부분 삭제·접근 잔존          | PRIV-002, M1-09               | `IN_PROGRESS` | 로컬 계약/worker 10/10, DB·backup E2E 필요    |
| `supabase/migrations/20260725110000_operational_slo_snapshot.sql`                      |   1-366 | 운영 지표 snapshot     | Service Role→집계 RPC  | PII label·경보 누락          | OPS-004, M1-08                | `IN_PROGRESS` | evaluator/계약 7/7, live dashboard/alert 필요 |

### 5.4 테스트·시뮬레이션·root 설정

| 파일                                                |  라인 | 역할                     | 신뢰 경계                   | 주요 실패 모드               | finding/과제            | 상태          | 마지막 검토 기준                             |
| --------------------------------------------------- | ----: | ------------------------ | --------------------------- | ---------------------------- | ----------------------- | ------------- | -------------------------------------------- |
| `tests/security/app-origin.test.mjs`                |  1-75 | canonical origin 테스트  | 테스트→origin 모듈          | 변조 origin 누락             | SEC-006, SEC-013        | `IN_PROGRESS` | `aa7c48a+dirty`, 4/4                         |
| `tests/security/authenticated-list.test.mjs`        |  1-34 | token 목록 경계 테스트   | 테스트→목록 상태            | 이전 계정 데이터 노출        | QUAL-002, PRIV-001      | `IN_PROGRESS` | `aa7c48a+dirty`, 1/1                         |
| `tests/security/cron-auth.test.mjs`                 | 1-129 | Cron 인증 실패 테스트    | 테스트→인증 모듈            | 경계 case 누락               | SEC-001                 | `VERIFIED`    | `aa7c48a+dirty`, 9/9                         |
| `tests/security/service-role-boundary.test.mjs`     |  1-42 | Service Role 경계 테스트 | source→server bundle        | client import·특권 이름 혼동 | SEC-003                 | `VERIFIED`    | server-only/fail-fast·client scan 2/2        |
| `tests/security/security-headers.test.mjs`          |  1-51 | 보안 헤더·origin 테스트  | 환경→Next config            | CSP/헤더·환경 drift          | SEC-009, G0-17          | `IN_PROGRESS` | Supabase origin RED 0/2 → GREEN 2/2          |
| `tests/security/precise-location-boundary.test.mjs` | 1-160 | 정밀 위치 권한 계약      | route/SQL→권한 경계         | 비회원 mask·회원 pin 회귀    | PRIV-001, M1-06         | `IN_PROGRESS` | auth pin contract GREEN, 실제 DB E2E 필요    |
| `tests/unit/embedding-queue.test.mjs`               |  1-29 | Worker 조회 분류 테스트  | 테스트→Worker 경계          | DB 오류 은폐                 | QUAL-005                | `IN_PROGRESS` | `aa7c48a+dirty`, 2/2                         |
| `tests/unit/embedding-worker-faults.test.mjs`       | 1-109 | Worker fault injection   | fake provider/RPC→processor | retry·503·lease 회귀         | QUAL-005, G0-16         | `VERIFIED`    | provider/finalize/lease 4/4                  |
| `tests/unit/embedding-job-contract.test.mjs`        | 1-107 | Worker lease/Cron 계약   | source/SQL→계약 검사        | 잠금·grant·GET 누락          | SEC-001, QUAL-005       | `VERIFIED`    | RED 0/6 → GREEN 6/6                          |
| `tests/unit/data-plane-permissions.test.mjs`        | 1-120 | DB 권한 SQL 계약         | source/SQL→권한 검사        | RLS·grant·search_path 회귀   | SEC-003/004/011         | `VERIFIED`    | RED 0/4 → GREEN 5/5                          |
| `tests/unit/atomic-rate-limit-contract.test.mjs`    |  1-61 | atomic counter 계약      | source/SQL→경쟁 경계        | count-then-record 회귀       | SEC-007/012             | `VERIFIED`    | RED 0/3 → GREEN 3/3                          |
| `tests/unit/api-input.test.mjs`                     | 1-221 | 공용 API schema 테스트   | 비신뢰 입력→validator       | 위조·과대 입력 허용          | SEC-005/008             | `IN_PROGRESS` | RED 0/8 → GREEN 9/9, route E2E 필요          |
| `tests/unit/api-request.test.mjs`                   |  1-60 | JSON byte 상한 테스트    | HTTP stream→reader          | length 위조·과대 할당        | SEC-008                 | `VERIFIED`    | RED 0/3 → GREEN 3/3                          |
| `tests/unit/ci-release-gate.test.mjs`               |  1-59 | CI 설정 계약 테스트      | workflow/package→검사       | 검증 누락·과권한·secret 의존 | G0-11/12/18             | `VERIFIED`    | RED 0/4 → GREEN 4/4                          |
| `tests/unit/public-api-guard.test.mjs`              | 1-114 | 공개 API·IP 경계 테스트  | query/header→guard          | sweep·numeric prefix         | SEC-007/008/012         | `VERIFIED`    | RED 0/5 → GREEN 5/5                          |
| `tests/unit/operational-health.test.mjs`            |  1-55 | readiness 판정 테스트    | 설정/probe→상태             | 설정 누락·오류 원문 노출     | OPS-001, M1-02          | `VERIFIED`    | fail-closed·probe 분리 3/3                   |
| `tests/unit/monitoring-sanitizer.test.mjs`          | 1-103 | Sentry 정제 테스트       | 합성 민감 event→정제        | query·body·user·note 전송    | OPS-001, M1-01          | `VERIFIED`    | event/span 민감값 제거 2/2                   |
| `tests/unit/offline-build-assets.test.mjs`          |  1-19 | offline build 계약       | asset import→Webpack        | 외부 DNS로 release 실패      | G0-18                   | `VERIFIED`    | next/font/google 재도입 차단 1/1             |
| `tests/unit/privacy-location.test.mjs`              |  1-49 | 좌표 마스킹 테스트       | 정밀 좌표→근사 좌표         | grid drift·claim 정밀 해제   | PRIV-001, M1-06         | `VERIFIED`    | stable grid·claim 비해제·NaN 3/3             |
| `tests/unit/request-id-proxy.test.mjs`              |  1-34 | request ID 경계 테스트   | header→proxy                | ID 위조·재사용               | OPS-001, M1-01          | `VERIFIED`    | server UUID overwrite 2/2                    |
| `tests/unit/sentry-contract.test.mjs`               |  1-52 | Sentry 설정 계약         | source/config→계측          | runtime·boundary 누락        | OPS-001, M1-01          | `VERIFIED`    | client/server/edge/boundary 3/3              |
| `tests/unit/structured-log.test.mjs`                | 1-196 | 로그 redaction 계약      | 오류/컨텍스트→JSON          | secret·위치·note 원문 노출   | OPS-001, M1-01          | `VERIFIED`    | logger/redaction/Sentry 경계 7/7             |
| `tests/unit/upload-intent-contract.test.mjs`        | 1-117 | upload SQL/route 계약    | source/SQL→계약 검사        | intent·RPC·Storage 정책 회귀 | SEC-005/010/011         | `VERIFIED`    | Storage 보강 RED 5/6 → GREEN 6/6             |
| `tests/unit/upload-intents.test.mjs`                | 1-247 | 실파일·cleanup 테스트    | fake Storage→검증기         | IDOR·만료·late upload·위조   | SEC-005, M2-06          | `VERIFIED`    | 소비 후 replay·token cutoff GREEN 6/6        |
| `tests/unit/domain-idempotency-contract.test.mjs`   |  1-97 | 원자 멱등 SQL/API 계약   | source/SQL→계약 검사        | 조회-생성-저장 경쟁 회귀     | SEC-005, M2-06          | `VERIFIED`    | RED 0/3 → GREEN 3/3                          |
| `tests/unit/idempotency-replay.test.mjs`            |  1-89 | 멱등 cache replay 단위   | fake DB→API helper          | 타 신원 응답·DB 장애 우회    | SEC-005, M2-06          | `VERIFIED`    | RED module 없음 → GREEN 2/2                  |
| `tests/unit/form-submission-lifecycle.test.mjs`     | 1-103 | form retry 수명 테스트   | payload/file→key·intent     | 중복 생성·파일 혼동          | M2-06                   | `VERIFIED`    | key/intent 재사용·SHA-256 회전 4/4           |
| `tests/unit/lost-post-status-history.test.mjs`      |  1-75 | 상태 전이·이력 계약      | SQL/route→상태 machine      | 불법 전이·IDOR·actor 노출    | M2-03                   | `IN_PROGRESS` | source 계약 5/5, 실제 DB E2E 필요            |
| `tests/unit/map-data-state.test.mjs`                | 1-146 | 계정별 지도 상태 테스트  | 테스트→data reducer         | stale 계정 snapshot          | QUAL-004, PRIV-001      | `IN_PROGRESS` | RED 0/4·0/1 → GREEN 5/5                      |
| `tests/unit/map-domain.test.mjs`                    | 1-107 | 지도 계산 특성 테스트    | 테스트→순수 계산            | 필터·grid·경로 회귀          | QUAL-004                | `VERIFIED`    | RED 0/4 → GREEN 4/4                          |
| `tests/unit/map-request-guard.test.mjs`             |  1-54 | 최신 요청 취소 테스트    | 테스트→요청 lifecycle       | stale 응답 갱신              | QUAL-004, PRIV-001      | `VERIFIED`    | RED 0/4 → GREEN 4/4                          |
| `tests/unit/naver-map-adapter.test.mjs`             | 1-128 | SDK 정리 계약 테스트     | fake SDK→adapter            | listener·overlay 중복 정리   | QUAL-004                | `VERIFIED`    | RED 0/3·2/4 → GREEN 4/4                      |
| `tests/unit/map-layer-renderer.test.mjs`            | 1-315 | layer 정리 계약 테스트   | fake SDK→renderer           | marker·frame·timer 누수      | QUAL-004                | `VERIFIED`    | RED 3/5 → GREEN 5/5                          |
| `tests/integration/http-boundaries.mjs`             | 1-123 | production HTTP 경계     | 실제 Next HTTP→route        | 실패/trace/health 계약 회귀  | SEC-001/005/008/OPS-001 | `IN_PROGRESS` | 실패경계·request ID·health 8/8, staging 필요 |
| `tests/integration/db-permission-matrix.sql`        | 1-134 | 실제 DB 권한 행렬        | PostgreSQL roles→DB/Storage | grant·RLS·Storage drift      | G0-03/04/10/13/14       | `IN_PROGRESS` | CI job 연결, Docker replay 실행 필요         |
| `tests/integration/db-concurrency.mjs`              |  1-97 | DB 경쟁 검증             | 50/20 병렬 psql→RPC         | rate 초과·중복 lease         | G0-07/16                | `IN_PROGRESS` | CI job 연결, Docker 실행 필요                |
| `tests/unit/migration-order.test.mjs`               |  1-87 | migration 순서 preflight | SQL chain→검사              | 생성 전 ALTER·빈 DB 실패     | DB-003, G0-13           | `IN_PROGRESS` | RED 0/2 → GREEN 2/2, 실제 replay 필요        |
| `sim_test/compute_similarity.py`                    | 1-176 | 유사도 계산              | CSV/embedding→지표          | 수치·정규화 오류             | M3 제외, 품질 감사      | `NOT_STARTED` | 미검토                                       |
| `sim_test/fetch_embeddings.py`                      | 1-155 | embedding 수집           | 로컬→OpenAI                 | secret 로그·비용             | SEC-003, 품질 감사      | `NOT_STARTED` | 미검토                                       |
| `sim_test/image/placeholder_pipeline.py`            |  1-85 | 이미지 실험 placeholder  | 파일→모델                   | 미완성 경로 오사용           | M3 제외, 품질 감사      | `NOT_STARTED` | 미검토                                       |
| `sim_test/run_all.py`                               |  1-22 | 시뮬레이션 runner        | 로컬 프로세스               | 부분 실패 은폐               | QUAL-001                | `NOT_STARTED` | 미검토                                       |
| `sim_test/visualize_embeddings.py`                  | 1-142 | embedding 시각화         | 결과 파일→HTML/이미지       | 경로·데이터 누출             | SEC-003                 | `NOT_STARTED` | 미검토                                       |
| `.github/workflows/release-gate.yml`                |  1-59 | PR/push release gate     | GitHub→검증 toolchain       | 단계 누락·과권한·secret 의존 | G0-11/12/18             | `IN_PROGRESS` | HTTP 8/8 포함·합성 env build, CI run 필요    |
| `package.json`                                      |  1-50 | script·dependency 계약   | 개발/CI→toolchain           | script 불일치·취약 의존성    | SEC-002, G0-11/12/18    | `IN_PROGRESS` | Sentry 10.68·Webpack; Babel low 1 남음       |
| `next.config.ts`                                    | 1-155 | Next/Sentry 설정·헤더    | 환경→서버·브라우저          | CSP/ingest/source-map drift  | SEC-009, OPS-001        | `IN_PROGRESS` | Sentry ingest 검증·Webpack, staging 필요     |
| `sentry.server.config.ts`                           |  1-22 | Node Sentry 설정         | server 오류→외부 SaaS       | PII·과다 sampling            | OPS-001, M1-01          | `IN_PROGRESS` | no PII·sanitizer·5% trace, 실제 DSN 필요     |
| `sentry.edge.config.ts`                             |  1-22 | Edge Sentry 설정         | edge 오류→외부 SaaS         | PII·runtime 초기화 누락      | OPS-001, M1-01          | `IN_PROGRESS` | no PII·sanitizer·5% trace, 실제 DSN 필요     |
| `eslint.config.mjs`                                 |  1-23 | lint 정책                | 코드→CI                     | `.venv` 포함·규칙 공백       | QUAL-002                | `IN_PROGRESS` | `aa7c48a+dirty`, 외부 환경 제외              |
| `postcss.config.mjs`                                |   1-7 | CSS build 설정           | source→build                | 빌드 드리프트                | G0-18                   | `NOT_STARTED` | 미검토                                       |
| `tsconfig.json`                                     |  1-43 | TypeScript 설정          | source→compiler             | 과도한 제외·검사 공백        | QUAL-002                | `IN_PROGRESS` | `aa7c48a+dirty`, stale dev type 제외         |
| `vercel.json`                                       |  1-12 | Cron 배포 설정           | Vercel→Worker               | GET 불일치·정리 누락         | SEC-001/005, G0-18      | `IN_PROGRESS` | Worker GET·일일 cleanup 정적 검증            |

## 6. 코드 감사 제외 자산

이미지·아이콘·CSV·문서·생성물은 라인 기반 코드 감사에서 제외한다. 실행 코드가 읽는 자산은 사용 경로, 출처, 용량, 민감정보 포함 여부를 별도로 검증한다.

| 분류                 | 현재 목록                                                                                   | 검증 상태     | 남은 검증                        |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------- | -------------------------------- |
| 공개 SVG/ICO/PNG     | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`, `favicon.ico`       | `NOT_STARTED` | 출처·미사용 자산·메타데이터·용량 |
| 서비스 이미지/아이콘 | `public/icons/marker.png`, `my_location.svg`, `public/images/kakao_login_medium_narrow.png` | `NOT_STARTED` | 라이선스·출처·용량·메타데이터    |
| 시뮬레이션 CSV       | `sim_test/data/*.csv`                                                                       | `NOT_STARTED` | 합성 데이터 여부·개인정보 0·크기 |
| Python 의존성        | `sim_test/requirements.txt`                                                                 | `NOT_STARTED` | pinning·취약점·재현성            |
| 생성물               | `.next`, `sim_test/out`                                                                     | 감사 제외     | Git 추적 방지와 재생성 가능성    |
| 로컬 환경            | `.venv`, `node_modules`                                                                     | 감사 제외     | ESLint/검색/커밋 대상에서 제외   |

## 7. 반복 실행 기록

### 2026-07-25 — 기준선과 Worker 인증

- 기준 commit과 dirty working tree를 보존하고 파일 인벤토리를 생성했다.
- `dev`와 `build`를 Webpack으로 고정했다.
- `CRON_SECRET`이 없거나 빈 값·공백 포함 값이면 fail-closed `503`, 잘못된 bearer token은 `401`이 되도록 Worker 인증 경계를 분리했다.
- 실패 테스트를 먼저 작성했고 당시 `npm test`는 9/9 통과했다.
- 실제 Webpack build 결과는 24/24 page 성공이다.
- 독립 검토에서 Cron 인증 변경의 Critical/Important 지적은 0이었다.
- claim/finalize RPC는 lease token, `FOR UPDATE SKIP LOCKED`, 최대 20건,
  30~900초 lease와 최대 3회 backoff retry로 구현했다. 성공 시 embeddings와
  entity 상태가 한 transaction에서 `ready`가 되고, 실패 원문은 저장하지
  않는다.
- 남은 조건: 빈 DB migration replay, 동시 claim/fault injection, staging
  정상 호출, canonical `APP_ORIGIN` 환경 설정과 CI 재현.

### 2026-07-25 — dirty 변경 분류와 Worker 오류 경계

- 기존 dirty 변경을 `Webpack/Next 설정`, `Cron 인증·embedding 파이프라인`, `유실·제보 폼/trait`, `schema/migration·시뮬레이션`, `감사 문서`로 분류했다.
- 어떤 묶음도 삭제·reset·stage·commit하지 않았다.
- Worker의 초기 큐 DB 오류가 정상 빈 큐 `200`으로 변환되던 원인을 재현하고 `503`으로 분리했다.
- entity 조회의 DB 오류가 missing entity로 처리되던 경계를 분리했다.
- 내부 Worker URL에서 요청 Host 의존성을 제거하고 검증된 `APP_ORIGIN`만 사용하도록 변경했다.
- 실패 테스트는 각 구현 전에 RED를 확인했고 현재 전체 Node test는 14/14, TypeScript와 변경 파일 ESLint는 통과했다.
- 발견: `supabase/schema.sql`의 ivfflat index가 제거된 `embedding` 컬럼을 참조한다. 빈 DB replay 전에는 G0-13을 완료할 수 없다.
- Worker는 embeddings 직접 SELECT/UPDATE/DELETE를 제거하고 service-role 전용
  claim/complete/fail RPC만 사용한다. DB/완료 장애는 503, provider 장애는
  retry job으로 기록하며 lease를 잃은 Worker는 상태를 덮어쓰지 않는다.
- 남은 조건: 빈 DB replay와 실제 RPC grant/동시성/fault injection,
  schema/migration 정합성, staging 환경변수 및 정상 호출 검증.

### 2026-07-25 — origin·브라우저 헤더·의존성·lint

- OAuth callback과 Worker 목적지를 canonical `APP_ORIGIN`으로 고정하고 외부 redirect·Host/proto 입력을 제거했다.
- CSP, HSTS, content type, referrer, permissions, frame 정책을 Next config에 적용하고 실제 config 응답 테스트를 추가했다.
- Next `16.2.11`, Supabase JS `2.110.8`, OpenAI `6.49.0`으로 올리고 취약 간접 의존성을 patched 버전으로 override했다.
- `npm audit --omit=dev` 결과는 high/critical을 포함한 production 취약점 0이다.
- Node test 17/17, TypeScript, Next 16.2.11 Webpack build 24/24를 통과했다.
- `.venv`를 lint에서 제외하고 API/인증 목록/지도 SDK/Image 경고를 수정해 lint를 27 errors/37 warnings에서 9 errors/0 warnings로 줄였다.
- 남은 lint 9건은 `NaverMap.tsx`의 effect와 manual memoization이며 M1-07 characterization test와 계층 분리 없이 규칙을 끄지 않는다.
- G0-02는 route/E2E와 staging image smoke, G0-06/09/17은 staging 통합 검증 전까지 `IN_PROGRESS`다.

### 2026-07-25 — NaverMap 도메인·요청·SDK 경계 1차 분리

- 필터, 공개 zoom cap, grid cache key, 좌표 검증, 거리 비례 경로 보간을 `map-domain.ts`로 옮겼다.
- 순수 계산 테스트는 RED 0/4에서 GREEN 4/4로 전환됐고 빈 경로와 0거리 경로에서 `NaN`을 반환하지 않는다.
- 최신 요청 guard와 owner/principal-bound reducer를 추가했다. 새 요청·token 변경·unmount는 이전 signal을 abort하고, 늦은 응답은 cache·state·toast를 바꾸지 않는다.
- cluster, feedback, bookmark fetch와 cache를 `use-map-data.ts`로 이동하고 `NaverMap.tsx`에서 직접 소유하던 계정별 snapshot을 제거했다.
- Naver 공식 문서의 `Event.removeListener(MapEventListener)` 계약을 타입과 adapter에 반영하고 map 및 `idle`/`click` listener lifecycle을 adapter에 연결했다.
- marker, lost post, bookmark, polyline과 경로 animation 반영을
  `map-layer-renderer.ts`로 옮기고 overlay/frame/timer 교체·dispose 계약을
  RED→GREEN 5/5로 검증했다.
- 현재 증거는 `npm test` 88/88, TypeScript exit 0, 전체 lint 0 errors/0 warnings, Webpack build 25/25다.
- Webpack 개발 서버는 `http://localhost:3000`에서 141ms에 ready가 됐지만 현재 실행 환경에 연결 가능한 브라우저가 없어 UI 자동화는 수행하지 못했다. 브라우저 검증은 완료 증거로 계산하지 않는다.
- `NaverMap.tsx`는 2,195줄에서 현재 1,477줄이다. renderer 호출 뒤의 중복
  fallback은 제거됐으며 브라우저 핵심 흐름 검증 전까지 M1-07은
  `IN_PROGRESS`다.

### 2026-07-25 — G0-08 생성 API 입력 경계 1차 적용

- 비신뢰 JSON을 객체·타입·길이·배열 수·UUID·시각·전역 좌표·Storage key
  규칙으로 정규화하는 `api-input.ts`를 추가했다.
- 업로드 presign은 1~3개 JPEG/PNG와 1 byte~10 MiB의 안전한 정수 크기만
  허용하며, 제보와 유실글 생성은 해당 purpose에서 발급되는 날짜/UUID key만
  받는다. 이 단계의 선언 metadata 검증 뒤 실제 byte/signature, intent
  소유권과 orphan 정리는 아래 G0-05 단계에서 추가했다.
- 잘못된 JSON, 음수·NaN·과대 크기, 잘못된 MIME·좌표·시각·key, 긴 note,
  비표준 idempotency UUID를 포함한 테스트를 구현 전 RED 0/4에서 구현 후
  GREEN 5/5로 전환했다.
- 전체 검증은 Node test 88/88, TypeScript exit 0, 전체 ESLint 0/0,
  Next.js 16.2.11 Webpack build 25/25다.
- JSON mutation, pagination, 추천 비용 파라미터, 지도 숫자 파싱, 동적 UUID는
  공용 경계로 전환했고 모든 JSON mutation은 실제 stream 64 KiB 상한을
  거친다. production Next 서버를 구동하는 HTTP 통합 테스트에서 malformed
  JSON 400, 64 KiB 초과 413, 지도 numeric prefix 400, 무인증 embedding·upload
  cleanup 401을 5/5로 확인했다. 정상 DB·Storage 흐름과 staging 재현 전까지
  G0-08과 SEC-008은 `IN_PROGRESS`다.

### 2026-07-25 — G0-05 업로드 intent·원자 소비·orphan 정리

- presign 전에 owner 또는 익명 IP, purpose, bucket/key, 예상 MIME/크기와 15분
  만료를 `upload_intents`에 기록한다. 로그인 제보는 presign에도 access token을
  전달해 생성 요청의 사용자 신원과 일치시킨다.
- Storage bucket에 10 MiB와 JPEG/PNG 제한을 migration으로 고정하고, 생성
  직전 Storage API로 객체를 내려받아 실제 byte 크기와 JPEG/PNG signature를
  검증한다.
- service-role 전용 `create_sighting_with_uploads`와
  `create_lost_post_with_upload` RPC가 intent 행을 `FOR UPDATE`로 잠근 뒤
  도메인 생성과 `consumed_at` 기록을 한 트랜잭션에서 수행한다.
- 일일 fail-closed Cron은 만료된 미사용 intent의 객체를 Storage API로
  제거한 경우에만 intent 행을 삭제한다. Vercel Cron의 GET 호출과 기존
  embedding POST-only handler 불일치도 GET/POST 공유 handler로 수정했다.
- signed upload token은 provider 계약상 2시간 유효하므로 15분 intent 만료
  직후 행을 삭제하면 늦은 업로드가 추적 불가능해진다. cleanup 기준을
  `created_at + 2시간 + 5분` 이후로 늦춰 token 만료 전에 intent가 사라지지
  않도록 RED 9/11에서 GREEN 11/11로 수정했다.
- 정적 계약 6/6과 실파일/cleanup 단위 5/5가 통과했으며 전체 검증은 Node
  88/88, TypeScript, ESLint 0/0, Webpack 25/25, production audit 취약점
  0이다.
- 실제 migration replay, 역할별 RPC/Storage matrix, 동일 key 경쟁 소비,
  정상·위조 파일 staging E2E 전까지 G0-05/10과 SEC-005/010은
  `IN_PROGRESS`다.

### 2026-07-25 — G0-11/12 CI release gate

- `.github/workflows/release-gate.yml`은 PR과 `main`/`feature/all` push에서
  읽기 전용 권한, Node `.nvmrc`, npm cache와 `npm ci`를 사용한다.
- test, typecheck, 전체 ESLint, Webpack production build, 실제 production
  HTTP 실패경계 5건과 production dependency audit를 별도 단계로 실행한다.
  build와 HTTP 환경은 저장소 secret 없이 합성 Supabase/Naver/origin 값만
  사용한다.
- CI 계약은 RED 0/4에서 GREEN 4/4가 됐고 동일 합성 환경의 로컬 전체 검증은
  Node 88/88, TypeScript, ESLint 0/0, Webpack 25/25를 통과했다.
- 실제 GitHub Actions 실행, 깨끗한 runner의 `npm ci`, 의도적 실패 merge 차단,
  정상 DB API·RLS·핵심 E2E 추가 전까지 G0-11/12/18은 `IN_PROGRESS`다.

### 2026-07-25 — G0-05/M2-06 도메인 생성 원자적 idempotency

- 유실글 생성의 기존 `idempotency 조회 → 도메인 RPC → 응답 저장` 순서는
  같은 key의 동시 요청이 모두 cache miss를 보고 서로 다른 도메인 행을 만들
  수 있었다. 제보 생성은 클라이언트 idempotency key를 받지 않아 동일한
  장애 경계가 더 컸다.
- `20260725040000_atomic_domain_idempotency.sql`이 scope·key·사용자/IP별
  transaction advisory lock을 획득한다. 동일 hash의 재시도는 저장된 행을
  반환하고, 동일 key의 다른 payload는 `idempotency_conflict`로 거부한다.
- 새 도메인 행, upload intent 소비, embedding job, 24시간 응답 cache가 같은
  DB 트랜잭션에서 기록된다. API route의 선행 cache 조회와 후행
  `idempotency_keys`/`embeddings` 쓰기는 제거했고, 제보 생성도 canonical UUID
  key와 request hash를 RPC에 전달한다.
- 실패 계약은 RED 0/3에서 GREEN 3/3으로 전환됐다. 소비된 intent의 안전한
  응답 replay 경계는 RED 5/6에서 GREEN 6/6으로 보강했다. cache replay
  helper는 module 없음 RED에서 hit/conflict/miss/DB 장애 GREEN 2/2로
  전환했다. 제보 replay는 생성 rate limit과 Storage 검증보다 먼저 처리한다.
  전체 검증은 Node 105/105, TypeScript exit 0, 전체 ESLint 0/0,
  Next.js 16.2.11 Webpack 27/27,
  production dependency 취약점 0이다.
- 이 증거는 SQL source 계약이며 실제 PostgreSQL 실행 증거를 대신하지 않는다.
  migration history 정합화 후 동일 key·동일 payload 20개 동시 요청은 도메인
  행 1개를, 동일 key·다른 payload는 409를 만드는지 합성 데이터로 검증해야
  한다. UI가 timeout 뒤 같은 key와 upload key를 재사용하는 흐름도 아직
  구현되지 않았으므로 M2-06은 `IN_PROGRESS`다.

### 2026-07-25 — G0-13 빈 DB migration 기준선

- 기존 migration의 첫 파일은 기본 table을 만들지 않고 `sightings`와
  `lost_posts`를 바로 변경해 저장소만으로 빈 DB replay가 불가능했다.
- Git 기준 schema에서 후속 migration 전 핵심 객체만 분리해
  `20250218000000_initial_schema.sql`을 추가했다. 후속 기능과 RPC는 기존
  timestamped migration이 계속 담당한다.
- migration을 시간순으로 평가해 table/function이 생성되기 전에 ALTER되는
  오류를 막는 preflight는 RED 0/2에서 GREEN 2/2가 됐다. 전체 Node test는
  88/88, TypeScript와 ESLint 0/0을 통과했다.
- Supabase CLI 2.109.1 실행 경로와 Git 제외 로컬 DB 연결 비밀번호를
  구성했다. 읽기 전용 `migration list` 결과 로컬 `20250218...`~`20260725...`와
  원격 `20260217...`~`20260218...` 사이 공통 version이 0개였다. 이
  상태에서는 전체 `db push`를 실행하지 않는다.
- 원격 메타데이터에서 `users`·`embeddings`·`idempotency_keys` RLS 비활성,
  anon/authenticated 전체 grant, `sightings_public_insert`, 과도한 RPC
  EXECUTE를 확인했다. 이는 G0-03/04/14의 실제 Critical/High 출시 차단
  증거이며 로컬 lock-down은 아직 원격에 적용되지 않았다.
- 사용자 제공 schema 리포트도 기존 8개 앱 table과 공개 insert 정책을
  재확인했지만 `rate_limit_buckets`·`upload_intents`가 없고 migration
  statements·constraint·index·trigger·function DDL은 포함하지 않았다. 따라서
  이 자료는 drift 증거로 사용하되 migration 정합화나 replay 완료 증거로
  사용하지 않는다.
- Docker가 없어 schema dump는 실행하지 못했고 원격 migration fetch도 실행
  승인 한도에서 중단됐다. 원격 statements 대조, 실제 빈 DB replay, schema
  diff와 역할별 matrix 전까지 G0-13과 QUAL-003은 `IN_PROGRESS`다.
- 대화에 노출된 service-role, OpenAI, Naver 비밀값은 재발급 전까지
  폐기 대상으로 취급하며 값 자체는 문서·로그·Git에 기록하지 않는다.

### 2026-07-25 — G0-10 public image·Storage object 정책

- 현재 모든 이미지 소비 경로가 `getPublicUrl()`을 사용하므로 `sightings`와
  `lost` bucket을 명시적 public으로 고정했다. 기존 private bucket도 migration
  재적용 시 `public = excluded.public`으로 교정한다.
- public download 외 metadata 조회·직접 insert/update/delete는 anon과
  authenticated에 restrictive 정책을 적용한다. signed upload token과
  service-role cleanup은 기존 서버 경계를 유지한다.
- 기존 private bucket 교정 누락은 계약 테스트 RED 5/6으로 재현한 뒤 GREEN
  6/6으로 수정했다. 전체 Node 88/88, TypeScript, ESLint 0/0, Webpack
  25/25, HTTP 5/5, production audit 0을 통과했다.
- 실제 빈 DB replay와 anon/authenticated/service-role Storage matrix,
  public URL 정상 조회·직접 mutation 거부 검증 전까지 G0-10과 SEC-010은
  `IN_PROGRESS`다.

### 2026-07-25 — G0-09/17 환경별 Supabase origin

- CSP의 image/connect/WebSocket origin과 Next Image hostname에 특정 프로젝트
  ref가 하드코딩되어 새 Supabase 환경에서 이미지·API가 차단되는 문제를
  제거했다.
- `NEXT_PUBLIC_SUPABASE_URL`은 credential·port·path·query·fragment가 없는
  정확한 HTTPS `*.supabase.co` origin만 허용한다. 누락·외부 origin은 config
  단계에서 fail-fast한다.
- 다른 프로젝트 URL 반영과 잘못된 외부 URL 거부는 RED 0/2에서 GREEN 2/2가
  됐고 전체 Node 88/88, TypeScript, ESLint 0/0, 합성 환경 Webpack 25/25를
  통과했다.
- Naver/Next inline script·overlay 때문에 남은 `unsafe-inline` 축소와 staging
  CSP violation·지도·로그인·이미지 E2E 전까지 G0-09/17은 `IN_PROGRESS`다.

### 2026-07-25 — M1-01 request ID·구조화 로그 기반

- 모든 `/api/*` 요청에서 클라이언트가 보낸 `x-request-id`를 신뢰하지 않고
  proxy가 새 UUID를 생성해 upstream 요청과 응답에 동일하게 전달한다.
- API route의 직접 `console.*` 호출을 제거하고 `requestId`, 고정 route,
  bounded event/context를 가진 한 줄 JSON logger로 전환했다. 비동기 embedding
  trigger도 호출 request logger를 전달받아 같은 trace를 유지한다.
- authorization, cookie, token, secret, API key, note, 원시 위·경도·위치·IP,
  오류 message/details/hint/stack은 key 기반으로 제거한다. 오류는 name과
  bounded code만 보존하며 context가 timestamp/level/event/requestId/route를
  덮어쓸 수 없다.
- 실패 테스트는 request ID 위조와 logger export 부재를 각각 RED로 확인한 뒤
  GREEN으로 전환했다. 구조화 로그·proxy 계약 8/8, API 직접 console 경계,
  전체 Node 99/99, TypeScript, ESLint 0/0, Webpack 25/25, production HTTP
  6/6을 통과했다.
- Sentry 연동, 실제 Vercel 로그에서 route별 trace 연결률·민감 원문 0 확인,
  의도적 Supabase/OpenAI 실패와 alert 검증 전까지 M1-01과 OPS-001은
  `IN_PROGRESS`다.

### 2026-07-25 — M1-02 health/readiness 경계

- `/api/v1/health`는 외부 dependency를 호출하지 않는 process liveness로
  분리하고 `no-store` 200만 반환한다.
- `/api/v1/readiness`는 Supabase/Auth/OpenAI/Naver/Cron/origin 필수 설정을
  값 노출 없이 검사한다. 누락이 있으면 dependency probe를 호출하지 않고
  즉시 503이며, 설정이 완전할 때만 Supabase `embeddings`를 3초 timeout으로
  읽어 실제 DB 접근 가능성을 확인한다.
- 공개 503 응답에는 누락 환경변수 이름과 upstream error가 없고, 서버의
  redacted 구조화 로그에만 실패 분류가 남는다.
- helper 부재 RED를 확인한 뒤 단위 3/3을 GREEN으로 만들었다. 전체 Node
  103/103, TypeScript, ESLint 0/0, 합성 환경 Webpack 27/27, production HTTP
  8/8이 통과했다.
- 실제 스테이징 정상 readiness 200, Supabase 단절 503, Vercel monitor와
  5분 이내 alert·runbook 연결 전까지 M1-02와 OPS-001은 `IN_PROGRESS`다.

### 2026-07-25 — M1-01 Sentry error tracking

- 공식 Next.js SDK `@sentry/nextjs` 10.68.0의 Next 16 peer 호환성을 확인하고
  client/Node/Edge instrumentation과 `captureRequestError`, app/root React
  error boundary를 연결했다.
- `sendDefaultPii=false`, logs/replay/AI input-output 기록 비활성, error 100%와
  trace 5%를 적용했다. event는 request header/cookie/body/query/user/extra와
  오류 원문을 제거하고 stack frame을 보존하며, span과 breadcrumb URL은
  query·fragment를 제거한다.
- 처리된 API 5xx도 구조화 logger가 원본 error와 event/requestId/route/status를
  Sentry에 전달한다. monitoring reporter 자체 오류는 API 응답 경로에 영향을
  주지 않는다.
- 공개 tunnel은 사용하지 않는다. CSP는 검증된 sentry.io ingest origin만
  허용하고 source map은 `SENTRY_AUTH_TOKEN`이 있을 때만 업로드한다.
- sanitizer 부재와 Sentry 설정 부재, 처리된 5xx 미보고를 각각 RED로 확인한
  뒤 계약 12/12를 GREEN으로 만들었다. 전체 Node 112/112, TypeScript,
  ESLint 0/0, 네트워크 허용 Webpack 27/27을 통과했다.
- 설치 후 production audit는 high/critical 0이나 Sentry 간접
  `@babel/core@7.28.5`의 `GHSA-4x5r-pxfx-6jf8` low 1이다. 패치 버전 조회와
  Sentry 포함 HTTP 8/8 재실행은 실행 승인 사용량 한도로 거부돼 우회하지
  않았다.
- 실제 DSN·org/project/auth token 설정, source map event, 민감 원문 0과
  request ID 연결, 패치 후 audit 0, HTTP 재검증 전까지 M1-01은
  `IN_PROGRESS`다.

### 2026-07-25 — SEC-003/PRIV-001 Supabase 특권 경계 감사

- `src/shared/supabase/client.ts:1-43`과
  `src/shared/supabase/server.ts:1-84`, Service Role factory의 실제 API
  호출처 14개를 추적했다. 브라우저 bundle은 anon key만 사용하고 서버 인증
  helper는 cookie session의 user를 그대로 권한 근거로 쓰지 않고 Auth
  `getUser(access_token)`으로 재검증한다.
- 서버 특권 factory는 `server-only` import guard, 필수 환경변수 fail-fast,
  `createServiceRoleSupabase`라는 명시적 이름으로 보강했다. client module
  전체를 스캔하는 회귀 테스트와 함께 2/2가 통과한다.
- 기존 실제 과권한은 인증 지도·상세 route에서 확인했다. 지도 route가
  로그인만 확인한 뒤 Service Role로 `is_public:false` RPC를 호출하고 상세
  route가 임의 UUID를 읽던 경로는 세션 JWT의 `auth.uid()`를 사용하는 전용
  privacy RPC로 교체했다.
- 지도 제품 정책: 비회원은 마스킹 클러스터만, 회원은 확대 시 비차단 제보의
  정밀 pin/note를 받는다(`20260726000000_auth_map_precise_pins`). 추천 API
  후보 좌표는 계속 0.05° 격자로 마스킹한다. 공개 클러스터 우회·차단 누락·
  DB 역할 snapshot이 남으면 PRIV-001은 High로 유지한다.
- 추가 호출 경로 감사에서 추천 API도 소유한 유실글의 모든 후보에 정밀
  좌표를 반환하는 것을 확인했다. claim 생성 API는 전달된 sighting UUID가
  실제 추천 후보인지 확인하지 않으므로 현재 claim row만으로 “실제 매칭”을
  증명할 수 없다. claim 직접 쓰기는 회수하고 검색 중인 유실글의 만료되지
  않은 추천 cache에 포함된 미보관 sighting만 RPC로 claim하도록 제한했다.
  이 claim은 여전히 북마크이며 정밀 권한으로 사용하지 않는다.

#### PRIV-001 역할별 목표 응답

| 주체                     | 지도 좌표             | 추천 좌표       | 사진·공개 특성         | 비공개 note     | 정밀 상세        |
| ------------------------ | --------------------- | --------------- | ---------------------- | --------------- | ---------------- |
| anon                     | 마스킹 클러스터       | 없음            | 집계/공개 범위만       | 금지            | 금지             |
| 일반 member              | 확대 시 정밀 pin      | 마스킹          | 지도·상세 허용         | 지도·상세 허용  | 비차단 제보 허용 |
| sighting owner           | 본인 제보 정밀        | 마스킹(타 후보) | 본인 제보 허용         | 본인 제보 허용  | 허용             |
| lost-post owner, 매칭 전 | 회원 지도와 동일      | 마스킹          | 후보 공개 범위만(추천) | 추천에서는 금지 | 회원 상세와 동일 |
| 서버 검증 matched-owner  | 해당 관계의 제보 정밀 | 해당 제보 정밀  | 해당 제보 허용         | 해당 제보 허용  | 허용             |

실패 테스트는 다른 회원의 UUID 직접 상세, 후보가 아닌 UUID claim, 다른
사용자의 lostPostId와 sightingId 조합, claim 삭제 후 재접근, archived
sighting 접근, 지도·추천 bbox 반복 sweep을 포함한다. 모든 거부 응답은
존재 여부를 드러내지 않도록 404로 통일하고 캐시에는 정밀 결과를 공유
저장하지 않는다.

#### 2026-07-25 구현·검증 증거

- `tests/security/precise-location-boundary.test.mjs`와
  `tests/unit/privacy-location.test.mjs`를 RED에서 시작해 API/RPC/grant,
  stale cache·closed/archived 데이터, 안정 격자와 claim 비해제 계약을
  GREEN으로 만들었다.
- `revoke create on schema public`로 Security Definer 이름 가로채기를 막고,
  privacy RPC는 `authenticated`에만 EXECUTE를 부여했다.
- claim 테이블 직접 DELETE 회수 뒤 남아 있던 전역 북마크 해제 API도
  `unclaim_sighting_from_all_my_posts` 원자 RPC로 전환해 적용 후 회귀를
  막았다.
- 전체 Node 134/134, TypeScript, ESLint 0/0을 통과했다. 빌드 중
  `next/font/google` DNS 의존을 재현한 뒤 시스템 font stack으로 교체했고,
  같은 제한 환경에서 Webpack 27/27과 offline asset 계약 1/1이 통과했다.
- Supabase CLI 2.101.0 임시 다운로드는 승인 사용량 제한으로 거절됐다.
  우회하지 않았으며 migration dry-run/lint, 원격 적용, 역할별 E2E 전까지
  관련 SQL/API 상태는 `IN_PROGRESS`다.

### 2026-07-25 — 원격 DB 스키마 요약 대조

- 제공된 원격 자료는 테이블·열·enum·일부 RLS 정책의 스냅샷이며 실행 가능한
  전체 DDL은 아니다. 함수 본문, 함수별 `EXECUTE`, 테이블 `GRANT`, 인덱스,
  trigger, Storage bucket/policy와 migration 적용 이력은 포함되지 않았다.
- 스냅샷에는 `users`, `lost_posts`, `sightings`, `embeddings`,
  `recommendation_cache`, `idempotency_keys`, `user_sighting_views`,
  `lost_post_sighting_claims`가 확인된다. 로컬 Gate 0 migration이 추가하는
  atomic rate-limit, upload intent와 atomic domain idempotency 관련 객체의
  원격 적용 여부는 이 자료만으로 증명할 수 없다.
- `sightings_public_insert`의 `WITH CHECK (true)`가 현재 정책 목록에 남아 있어
  브라우저 직접 INSERT 차단 migration의 원격 미적용 가능성을 다시 확인했다.
  원격 migration history를 정합화하고 역할별 grant/RLS matrix를 실행하기
  전까지 `G0-03`, `G0-04`, `G0-10`, `G0-13`은 VERIFIED로 올리지 않는다.

### 2026-07-25 — M1-04/05/08/09 로컬 운영 경계

- 관리자 권한은 Auth `app_metadata`만 신뢰하며 hide/unhide와 신고 상태 변경을
  원자 RPC로 처리하고 actor/action/target/reason/time을 append-only audit에
  기록한다. 일반 회원 관리자 API는 404로 숨긴다.
- 신고는 동일 reporter-target의 활성 중복을 원자 차단하고 high 24시간,
  일반 72시간 SLA를 DB가 정한다. 양방향 사용자 차단은 추천·인증 지도·상세·
  claim·path의 민감 조회에 적용했다.
- 계정 삭제는 bounded 확인 후 즉시 Auth ban, lease/backoff queue, Storage→
  DB→Auth 순서와 최소 hash tombstone으로 구현했다. provider backup 30일
  만료는 코드 값만으로 증명하지 않는다.
- 저 cardinality RED 관측 경계, service-role 전용 운영 snapshot과
  availability 99.5%, read p95 1초, write p95 2초, 5xx 1%, 예산 80/100%
  warning/critical evaluator를 구현했다.
- 전체 Node 170/170, TypeScript, ESLint 0/0, production audit 0을 통과했다.
  신규 migration의 빈 DB replay, 실제 role/admin E2E, dashboard와 5분 alert,
  backup/삭제 rehearsal 전까지 M1-04/05/08/09는 `IN_PROGRESS`다.

## 8. 승인된 M1-07 NaverMap 분리 설계

### 범위와 불변 조건

- 목적은 `NaverMap.tsx`의 effect·SDK·데이터·레이어 결합을 분리해 lint와 lifecycle 오류를 제거하는 것이다.
- 지도 화면, 마커 색상, 필터, 북마크, 경로 애니메이션, 상세 카드와 API 계약은 변경하지 않는다.
- 새로운 제품 기능, 지도 공급자 교체, API·DB schema 변경은 이 작업에 포함하지 않는다.
- React hook 규칙을 disable하거나 lint 예외로 숨기지 않는다.

### 선택한 접근

기존 컴포넌트를 한 번에 재작성하지 않고 다음 경계를 순서대로 추출한다.

1. 필터, 좌표 검증, viewport/bbox, 경로 보간을 순수 함수로 옮기고 현재 결과를 characterization test로 고정한다.
2. Naver SDK 생성·이벤트 등록·해제를 adapter로 분리한다.
3. 인증 지도·클러스터·북마크·경로 요청을 data hook으로 분리하고 AbortController 또는 동등한 취소 경계를 둔다.
4. marker, lost-post marker, polyline, animation을 layer renderer로 분리하고 모든 overlay/listener/timer/frame을 명시적으로 정리한다.
5. `NaverMap.tsx`에는 화면 상태와 UI 조합만 남긴다.

lint 예외만 추가하는 방식은 결합과 stale closure를 남기므로 사용하지 않는다. 전면 재작성은 기존 2,000줄 이상의 동작을 동시에 바꿔 회귀 범위가 크므로 사용하지 않는다.

### 모듈 경계

| 단위                 | 책임                               | 입력                   | 출력·정리                         |
| -------------------- | ---------------------------------- | ---------------------- | --------------------------------- |
| `map-domain`         | 필터·좌표·bbox·경로 계산           | API DTO, 지도 상태     | 부수효과 없는 값                  |
| `naver-map-adapter`  | Map/Marker/Polyline/Event SDK 호출 | DOM, SDK options       | typed handle과 idempotent cleanup |
| `use-map-data`       | 인증별 fetch·오류·취소·stale 차단  | token, layer, viewport | token/request-bound snapshot      |
| `map-layer-renderer` | marker·polyline·animation 반영     | adapter, domain result | overlay/timer/frame cleanup       |
| `NaverMap`           | 사용자 이벤트와 화면 조합          | props, hooks           | JSX와 접근성 상태                 |

### 데이터와 오류 흐름

1. 지도 idle 이벤트는 정규화된 viewport를 만든다.
2. data hook은 request key와 token을 묶어 요청하고 이전 요청을 취소한다.
3. 완료된 응답은 순수 필터를 거쳐 layer renderer로 전달된다.
4. renderer는 새 overlay를 적용하기 전에 이전 handle을 정리한다.
5. SDK·network 오류는 민감 응답을 로그하지 않고 사용자용 오류 상태로 변환한다.
6. unmount, token 변경, layer 변경 시 listener, overlay, timeout, animation frame, 진행 중 fetch가 모두 정리된다.

### 테스트와 완료 조건

- 순수 함수 characterization test가 필터·bbox·경로 보간의 현재 결과를 고정한다.
- adapter test가 listener/overlay cleanup의 exactly-once와 중복 cleanup 안전성을 검증한다.
- data hook 또는 추출된 reducer test가 logout·계정 전환·응답 순서 역전에서 stale 데이터 노출 0을 검증한다.
- `npm test`, TypeScript, 전체 lint, Webpack build가 통과한다.
- 지도 핵심 흐름을 브라우저에서 확인하고 marker/listener/animation 누수가 없음을 검증한다.
- 기존 API와 DB interface diff는 0이어야 한다.

## 9. NaverMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 지도 동작과 API 계약을 보존하면서 계산·요청·SDK·레이어 책임을
분리하고 `NaverMap.tsx`의 React hook lint 오류 9건을 제거한다.

**Architecture:** 순수 계산을 `map-domain.ts`, 최신 요청 판정을
`map-request-guard.ts`, 요청·상태 조합을 `use-map-data.ts`, Naver SDK 자원
관리를 `naver-map-adapter.ts`, overlay 반영을 `map-layer-renderer.ts`로
분리한다. `NaverMap.tsx`는 이 경계를 조합하고 JSX와 사용자 이벤트만 소유한다.

**Tech Stack:** Next.js 16.2.11 Webpack, React 19.2.3, TypeScript 5, Node 22
내장 test runner, Naver Maps JavaScript SDK.

### Global Constraints

- 지도 화면, 마커 색상, 필터, 북마크, 경로 애니메이션, 상세 카드와 기존 API
  URL·요청·응답 형식을 변경하지 않는다.
- API route, Supabase schema, migration을 변경하지 않는다.
- React hook lint 규칙을 비활성화하거나 파일 단위 예외를 추가하지 않는다.
- 각 작업은 실패 테스트 확인 후 최소 구현하고 전체 검증 전 상태를
  `VERIFIED`로 바꾸지 않는다.
- 커밋은 staged diff와 문구를 사용자에게 먼저 제시하고 승인받기 전에는
  실행하지 않는다.

---

### Task 1: 순수 지도 도메인 계산

**Files:**

- Create: `src/features/map/lib/map-domain.ts`
- Modify: `src/features/map/components/NaverMap.tsx`
- Test: `tests/unit/map-domain.test.mjs`
- Modify: `docs/OPERATIONAL_STABILITY_GOAL.md`

**Interfaces:**

- Produces:
  `normalizeSightingId(id: string): string`,
  `getFilteredItems(rawItems, feedbackMap, layer): MapItem[]`,
  `getGridSize(zoom: number, authenticated: boolean): number`,
  `buildMapCacheKey(viewport, zoom, authenticated, layer): string`,
  `getBookmarkPathCoordinates(path): Coordinate[]`,
  `interpolatePath(coordinates, progress): Coordinate[]`.
- Consumes: `MapItem` from `src/features/map/types/naver.ts`.

- [x] **Step 1:** 필터가 cluster를 제외하고 ID를 소문자·trim 처리하는 테스트,
      비로그인 zoom 상한과 기존 grid 크기 경계 테스트, 동일 viewport cache key
      테스트, 유효하지 않은 좌표 제거와 거리 비례 경로 보간 테스트를 작성한다.
- [x] **Step 2:** 아래 명령이 `map-domain.ts` 부재 또는 export 부재로 실패하는
      것을 확인한다.

  ```bash
  npm test -- tests/unit/map-domain.test.mjs
  ```

- [x] **Step 3:** 현재 `NaverMap.tsx` 35-64, 477-495, 1115-1148,
      1153-1163의 계산을 위 함수로 이동하고 컴포넌트가 이를 import하도록 한다.
- [x] **Step 4:** 대상 테스트와 TypeScript, 새 모듈 lint를 통과시키고
      `NaverMap.tsx`의 기준선 9 errors/0 warnings가 증가하지 않았는지 확인한다.

  ```bash
  npm test -- tests/unit/map-domain.test.mjs
  npx tsc --noEmit
  npx eslint src/features/map/lib/map-domain.ts
  npx eslint src/features/map/components/NaverMap.tsx
  ```

  결과: RED 0/4 → GREEN 4/4, TypeScript exit 0, 새 모듈 lint exit 0,
  `NaverMap.tsx`는 기존과 동일한 9 errors/0 warnings로 후속 Task 2-5 대상이다.

### Task 2: 최신 요청 소유권과 취소 경계

**Files:**

- Create: `src/features/map/lib/map-request-guard.ts`
- Create: `src/features/map/hooks/use-map-data.ts`
- Modify: `src/features/map/components/NaverMap.tsx`
- Test: `tests/unit/map-request-guard.test.mjs`
- Modify: `docs/OPERATIONAL_STABILITY_GOAL.md`

**Interfaces:**

- Produces:
  `createLatestRequestGuard(): { begin(ownerKey: string): RequestLease;
dispose(): void }`.
- `RequestLease`는 `signal: AbortSignal`, `isCurrent(): boolean`,
  `finish(): void`를 제공하며 새 `begin`과 `dispose`가 이전 signal을 abort한다.
- Produces:
  `useMapData({ accessToken, authenticated, authLoading, layer,
initialLostPostId }): MapDataState`.
- `MapDataState`는 `loadViewport(viewport, zoom)`, `reloadBookmark()`,
  `rawItems`, `items`, `feedback`, `lostPosts`, `paths`, `error`를 제공한다.

- [x] **Step 1:** 같은 owner의 두 번째 요청, token 변경 owner, unmount dispose가
      이전 요청을 abort하고 늦은 응답의 `isCurrent()`를 false로 만드는 테스트를
      작성한다.
- [x] **Step 2:** 아래 명령이 export 부재로 실패하는 것을 확인한다.

  ```bash
  npm test -- tests/unit/map-request-guard.test.mjs
  ```

- [x] **Step 3:** request guard와 `useMapData`를 구현하고
      cluster·feedback·bookmark `fetch`에 signal을 연결한다. 응답으로
      state/cache를 바꾸기 직전에 `lease.isCurrent()`를 검사하고 완료 시
      `finish()`를 호출한다.
- [x] **Step 4:** logout·계정 전환·레이어 변경 후 이전 응답이 state를
      갱신하지 않는 대상 테스트와 TypeScript, 대상 lint를 통과시킨다.

### Task 3: Naver SDK 자원 adapter

**Files:**

- Create: `src/features/map/lib/naver-map-adapter.ts`
- Modify: `src/features/map/types/naver.ts`
- Modify: `src/features/map/components/NaverMap.tsx`
- Test: `tests/unit/naver-map-adapter.test.mjs`
- Modify: `docs/OPERATIONAL_STABILITY_GOAL.md`

**Interfaces:**

- Produces:
  `createNaverMapAdapter(api): NaverMapAdapter`.
- `NaverMapAdapter`는 `createMap`, `listen`, `createMarker`,
  `createPolyline`, `replaceMarkers`, `replacePolylines`, `dispose`를 제공한다.
- 모든 handle은 `dispose(): void`를 제공하고 두 번 호출해도 SDK 정리 호출은
  한 번만 발생한다.

- [x] **Step 1:** map listener, marker, polyline을 생성한 뒤 `dispose()`를 두 번
      호출해 공식 `Event.removeListener`, `setMap(null)`, `destroy`가 각 자원마다
      정확히 한 번 호출되는 fake SDK 테스트를 작성한다.
- [x] **Step 2:** 아래 명령이 adapter export 부재로 실패하는 것을 확인한다.

  ```bash
  npm test -- tests/unit/naver-map-adapter.test.mjs
  ```

- [x] **Step 3:** adapter와 typed SDK option/handle을 구현하고 map 초기화와
      기본 marker lifecycle을 adapter에 연결한다.
- [x] **Step 4:** 대상 테스트, TypeScript, 대상 lint를 통과시킨다.

### Task 4: 지도 레이어 renderer

**Files:**

- Create: `src/features/map/lib/map-layer-renderer.ts`
- Modify: `src/features/map/components/NaverMap.tsx`
- Test: `tests/unit/map-layer-renderer.test.mjs`
- Modify: `docs/OPERATIONAL_STABILITY_GOAL.md`

**Interfaces:**

- Produces:
  `createMapLayerRenderer(adapter, scheduler): MapLayerRenderer`.
- `MapLayerRenderer`는 `renderSightings`, `renderLostPosts`,
  `renderPaths`, `clearLayer`, `dispose`를 제공한다.
- `scheduler`는 `requestFrame`, `cancelFrame`, `setDelay`, `clearDelay`,
  `now`를 제공해 경로 애니메이션을 결정적으로 테스트한다.

- [x] **Step 1:** 새 렌더 전에 이전 overlay가 제거되는 테스트, 레이어 해제와
      dispose 시 marker/polyline/frame/timeout이 남지 않는 테스트, 경로
      애니메이션이 1800ms 진행 후 1000ms 대기하는 테스트를 작성한다.
- [x] **Step 2:** 아래 명령이 renderer export 부재로 실패하는 것을 확인한다.

  ```bash
  npm test -- tests/unit/map-layer-renderer.test.mjs
  ```

- [x] **Step 3:** 기존 marker HTML, 색상, anchor, path style을 그대로 옮기고
      React state 변경은 renderer callback으로만 전달한다.
- [x] **Step 4:** 대상 테스트, TypeScript, 대상 lint를 통과시킨다.

### Task 5: NaverMap UI shell과 전체 검증

**Files:**

- Modify: `src/features/map/components/NaverMap.tsx`
- Modify: `docs/OPERATIONAL_STABILITY_GOAL.md`
- Modify: `docs/SECURITY_AND_QUALITY_AUDIT.md`
- Modify: `docs/PUBLIC_MVP_ROADMAP.md`

**Interfaces:**

- Consumes: Task 1-4의 도메인 함수, request lease, adapter, renderer.
- Produces: 기존 `NaverMapProps`와 JSX/API 계약을 유지하는 UI shell.

- [x] **Step 1:** 인증 token을 문자열 snapshot으로 분리하고, SDK 이벤트나
      fetch 완료 callback에서만 state를 변경한다. 계산 가능한
      `selectedSighting`·bookmark feedback은 render 단계 파생값으로 바꾼다.
- [x] **Step 2:** 아래 검증에서 NaverMap의 기존 9개 오류가 0이 되고 다른
      lint 오류·경고도 0인지 확인한다.

  ```bash
  npm test
  npx tsc --noEmit
  npm run lint
  npm run build
  ```

- [ ] **Step 3:** Webpack 개발 서버에서 default/unseen/bookmark 전환,
      marker·cluster 클릭, 현재 위치, 초기 포커스, 북마크 등록·해제, 경로
      애니메이션을 합성 계정으로 확인한다.
- [x] **Step 4:** 브라우저 확인 전에는 M1-07을 `IN_PROGRESS`로 유지하고,
      검증 명령·exit code·브라우저 증거·남은 조건을 세 문서에 동기화한다.

## 10. 다음 실행 순서

1. Supabase CLI 실행이 허용되면 migration dry-run·lint·history 대조를 먼저
   수행하고, 적용 대상과 SQL을 사용자에게 설명한 뒤 테스트 전용 원격 DB에
   적용한다.
2. anon/member/sighting-owner/lost-owner 역할별 privacy RPC·REST matrix와
   stale/closed/archived/임의 UUID negative E2E를 실행한다.
3. 실제 매칭 승인 상태와 허용 전이를 설계해 북마크 claim과 정밀 접근 권한을
   분리한다.
4. Sentry 포함 production HTTP 8/8과 지도 핵심 브라우저 회귀를 재실행한다.
5. 관련 감사 원장과 기존 감사·로드맵 상태를 동기화하되 외부 검증 전에는
   `VERIFIED` 또는 `CLOSED`로 올리지 않는다.
6. 커밋이 가능한 기능 단위가 만들어지면 staged diff와 제안 문구를 사용자에게
   먼저 제시하고 승인 전에는 커밋하지 않는다.
