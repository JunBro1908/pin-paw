# PinPaw 보안·품질 감사

- **기준일**: 2026-07-25
- **대상**: 현재 working tree의 Next.js 애플리케이션, API Route, Supabase
  기준 스키마·마이그레이션, 배포 설정, npm 의존성
- **목표**: 공개 MVP 배포 전에 해결해야 할 위험을 증거와 검증 방법이 있는
  개발 백로그로 전환한다.

## 1. 결론

현재 애플리케이션은 `npm run build`와 `npx tsc --noEmit`을 통과하고,
인증 API 대부분이 Supabase Auth의 `getUser(access_token)`으로 사용자를
재검증한다. 공개 지도는 줌을 제한하고 격자 중심만 반환하며, `.env.local`과
`sim_test/.env`는 Git에서 제외되어 있다.

그러나 공개 MVP 출시는 아래 P0 항목을 모두 해소하기 전까지 보류해야 한다.

- **SEC-001**: 내부 임베딩 Worker 인증이 환경변수 미설정 시 fail-open이다.
- **SEC-002**: production 의존성에 high 취약점 4개가 있고, 직접 의존성
  Next.js `16.1.1`에 다수의 공개 취약점이 보고되어 있다.
- **SEC-003**: 기준 스키마에서 `users`, `embeddings`, `idempotency_keys`에
  RLS가 활성화되지 않는다. 실제 배포 권한도 별도 검증되지 않았다.
- **SEC-004**: `security definer` RPC의 역할별 EXECUTE 권한이 명시되지 않았다.
- **SEC-005**: 서명 업로드와 최종 제보 데이터가 동일 요청자·파일인지 서버에서
  연결 검증하지 않는다.
- **SEC-007**: 현재 rate limit은 헤더 위조·동시 요청·회원 전환으로 우회될 수
  있다.
- **SEC-010**: Storage bucket과 object 정책이 코드로 재현되지 않는다.
- **SEC-011**: `sightings_public_insert` 정책이 anon의 API 우회 insert를
  허용할 수 있다.
- **SEC-012**: Naver 검색과 광역 지도 조회에 공개 호출 제한과 비용 경계가
  없다.
- **SEC-013**: 요청 Host 기반 origin 구성으로 redirect 경계와 Cron secret
  전달 대상이 오염될 수 있다.
- **QUAL-001**: 자동화 테스트와 CI가 없고 전체 ESLint가 실패한다.
- **QUAL-003**: 기준 스키마와 마이그레이션 이력에 불일치가 있어 새 환경 재현을
  신뢰할 수 없다.
- **QUAL-005**: 임베딩 Worker가 DB 오류를 정상 응답으로 숨기거나 상태 갱신
  실패를 확인하지 않는다.

상세 구현 순서는 [공개 MVP 로드맵](./PUBLIC_MVP_ROADMAP.md), 실행 규칙은
[AI 개발 플레이북](./AI_VIBE_CODING_PLAYBOOK.md)을 따른다.

## 2. 감사 방법과 실제 결과

### 2.1 수행한 검사

| 검사                          | 2026-07-25 결과                              | 판정      |
| ----------------------------- | -------------------------------------------- | --------- |
| `next build --webpack`        | 컴파일·TypeScript·27개 route 생성 성공        | 통과      |
| 변경 전 `npm run build` (Turbopack) | panic 또는 장시간 정체가 재현됨         | 실패      |
| `npx tsc --noEmit`            | 오류 없음                                    | 통과      |
| `npm run lint`                | 0 errors, 0 warnings                         | 통과      |
| `npm audit --json`            | high 6, moderate 1, low 1                    | 개선 필요 |
| `npm audit --omit=dev --json` | high/critical 0, `@babel/core` low 1          | 개선 필요 |
| `npm test`                    | unit·보안 경계 테스트 134/134 통과           | 개선 필요 |
| CI 설정 검색                  | release gate 추가, 정적 계약 4/4             | 개선 필요 |
| 추적 파일의 키 패턴 검색      | 키 값 발견 없음                              | 통과      |
| 환경파일 추적 확인            | `.env.local`, `sim_test/.env` 모두 ignore    | 통과      |
| API 인증·Service Role 추적    | 22개 API route와 공용 클라이언트 수동 검토   | 개선 필요 |
| SQL RLS·함수 검토             | 기준 스키마와 전체 migration 검색            | 실패      |

`npm audit` 결과는 감사 시점의 레지스트리 정보다. 수정 시점에는 동일 명령을
다시 실행해 최신 advisory와 안전 버전을 확정해야 한다.

Webpack 첫 실행에서 `next/font/google`이 `fonts.googleapis.com` DNS에
의존해 실패했다. Geist 전용 사용처가 없고 본문은 이미 시스템 폰트를
사용함을 확인한 뒤 Google font import를 제거하고 sans/mono 토큰을 시스템
font stack으로 고정했다. 같은 제한 환경에서 Webpack 27/27이 통과했고
재도입 방지 계약 1/1도 통과한다. Turbopack은 사용자 실행에서
`Permission denied (os error 13)` panic을 남겼으므로 공개 MVP release
build는 Webpack으로 유지한다.

### 2.2 위협 모델

- 공격자는 익명 또는 일반 회원으로 공개 HTTP API와 Supabase REST/RPC에
  접근할 수 있다.
- 공격자는 요청 body, query, `Authorization`, `Idempotency-Key`,
  `x-forwarded-for`를 조작할 수 있다.
- 공격자는 서명 업로드 URL을 반복 발급하거나 발급된 storage key를 다른 API에
  재사용할 수 있다.
- Service Role, OpenAI API key, Naver secret, `CRON_SECRET` 탈취는 별도
  최고 위험으로 본다.
- 위치, 사진, 자유 서술은 개인 식별과 안전에 영향을 줄 수 있는 민감 데이터로
  취급한다.

## 3. 발견 사항

상태 값은 `OPEN`, `VERIFY`, `CLOSED`만 사용한다. 부분 구현은 진행 증거와 남은
조건을 기록한 채 `OPEN`을 유지하고, 전체 검증 기준이 충족될 때만 `CLOSED`로
변경한다.

### SEC-001 — 내부 임베딩 Worker 인증 fail-open

- **심각도 / 상태**: Critical / OPEN
- **근거**: `src/app/api/v1/internal/embeddings/process/route.ts:19-24`,
  `src/shared/lib/embeddings-worker.ts:17-18`, `vercel.json`
- **시나리오**: 배포 환경에 `CRON_SECRET`이 없으면 누구나 Worker를 호출해
  Service Role DB 작업과 OpenAI 임베딩 비용을 반복 발생시킬 수 있다.
- **영향**: 비용 증가, 큐 선점, 데이터 상태 변경, 서비스 가용성 저하.
- **개선**: secret 미설정 시 서버 시작 또는 요청을 거부하는 fail-closed
  검증을 공용 함수로 만든다. Vercel Cron 인증 규칙과 수동 트리거 규칙을
  하나로 고정하고, 동시 실행 잠금과 호출 rate limit을 추가한다.
- **검증**: secret 없음·오류·정상 세 경우의 API 테스트에서 각각 503·401·200,
  무인증 반복 호출에서 OpenAI 호출 0회를 확인한다.
- **진행 증거 (2026-07-25)**: 공용 fail-closed helper와 `npm test` 9건을
  추가했다. production build에서 secret 없음 503, 잘못된 token 401을
  확인했고 인증 실패 시 Service Role/fetch callback 0회를 테스트한다.
- **진행 증거 (2026-07-25, job lease)**: service-role 전용 claim RPC가
  `FOR UPDATE SKIP LOCKED`와 5분 lease token으로 중복 claim을 차단한다.
  Worker는 lease RPC 밖에서 embeddings를 직접 변경하지 않는다.
- **진행 증거 (2026-07-25, Cron method)**: Vercel Cron의 GET 호출이
  fail-closed POST handler를 그대로 사용하도록 연결했고 정적 계약 6/6이
  통과했다.
- **남은 조건**: 빈 DB에서 migration을 재생하고 격리 스테이징에서 정상
  Vercel Cron 200, 동시 호출의 중복 OpenAI 호출 0, 호출 제한을 검증한다.
- **로드맵**: `G0-01`

### SEC-002 — 취약한 런타임 의존성

- **심각도 / 상태**: High / IN_PROGRESS
- **초기 근거**: `package.json`의 Next.js `16.1.1`; `npm audit --omit=dev`에서
  Next.js, PostCSS, sharp, ws high 4건. 전체 트리에서는 총 11건.
- **시나리오**: 공개 advisory에 명시된 DoS, 인증/프록시 우회, SSRF, cache
  confusion 계열 취약점의 영향 범위에 들어갈 수 있다.
- **영향**: 가용성, 서버 데이터 접근, 인증 경계, 캐시 무결성.
- **개선**: `npm audit`이 제시한 최소 안전 후보 Next.js `16.2.11` 이상을
  공식 release note와 호환성 기준으로 검토하고 React·eslint-config-next를
  함께 정렬한다. `npm audit fix --force`는 사용하지 않는다.
- **검증**: production audit high 0, 전체 build·route smoke·회귀 테스트
  통과.
- **진행 증거 (2026-07-25)**: Next.js와 eslint-config-next를 `16.2.11`,
  Supabase JS를 `2.110.8`, OpenAI를 `6.49.0`으로 올렸다. Next 내부
  postcss/sharp와 OpenAI의 ws는 각각 `8.5.18`, `0.35.0`, `8.21.0`으로
  override했다. `npm audit --omit=dev`은 취약점 0, Node test 17/17,
  TypeScript와 Webpack build 24/24를 통과했다.
- **Sentry 추가 후 증거**: `@babel/core`를 호환 가능한 7.29.7로 고정해
  `GHSA-4x5r-pxfx-6jf8`을 제거했다. `npm audit --omit=dev --audit-level=low`
  결과는 0이며 전체 Node 140/140, TypeScript, lint가 통과했다.
- **남은 조건**: 깨끗한 CI 설치의 audit 0, 핵심 route/E2E와 스테이징 이미지
  최적화 smoke를 통과한 뒤 CLOSED 처리한다.
- **로드맵**: `G0-02`

### SEC-003 — RLS 적용 범위와 실제 DB 권한 미확정

- **심각도 / 상태**: Critical / IN_PROGRESS
- **근거**: `supabase/schema.sql:314-316`은 `lost_posts`, `sightings`,
  `recommendation_cache`만 RLS를 활성화한다. `users`, `embeddings`,
  `idempotency_keys`에는 RLS·명시적 revoke가 없다.
- **시나리오**: Supabase의 실제 table grant가 anon/authenticated에 열려
  있으면 REST API를 통해 프로필, 임베딩, IP hash, 캐시된 응답을 읽거나
  변경할 수 있다.
- **영향**: 개인정보·운영 데이터 노출, rate limit 우회, 추천 데이터 변조.
- **개선**: 격리 스테이징의 `pg_class.relrowsecurity`,
  `information_schema.role_table_grants`, storage policy를 덤프해 실제 상태를
  확인한다. 앱 전용 비공개 테이블은 RLS 활성화 후 anon/authenticated 정책을
  두지 않거나 권한을 revoke한다.
- **검증**: anon·회원 JWT의 직접 REST SELECT/INSERT/UPDATE/DELETE가 모두
  거부되고 Service Role만 필요한 작업을 수행하는지 확인한다.
- **진행 증거 (2026-07-25)**:
  `20260725010000_lock_down_data_plane.sql`은 `users`, `embeddings`,
  `idempotency_keys` RLS를 활성화하고 이 테이블과 recommendation cache의
  anon/authenticated grant를 전부 회수한다. owner flow에 필요한
  `lost_posts`, `sightings`, feedback/claim 권한만 명시적으로 다시 부여했다.
  정적 권한 계약은 RED→GREEN 5/5다.
- **원격 확인 (2026-07-25)**: 연결된 테스트 DB에서 `users`, `embeddings`,
  `idempotency_keys`의 RLS가 실제로 꺼져 있고 anon/authenticated에 모든 table
  privilege가 부여된 상태를 읽기 전용 메타데이터 쿼리로 확인했다.
  `spatial_ref_sys`도 자동 경고에 포함됐지만 PostGIS 확장 소유 객체이므로 앱
  table과 같은 migration으로 변경하지 않는다.
- **남은 조건**: 원격 migration history를 안전하게 정합화한 뒤 lock-down을
  적용하고 anon/member/owner/service-role 실제 REST CRUD matrix를 통과한다.
- **서버 클라이언트 감사 (2026-07-25)**:
  `src/shared/supabase/server.ts:1-69` 전체를 검토했다. 사용자 client는
  `getSession()`의 user를 권한 근거로 쓰지 않고 `getUser(access_token)`으로
  재검증한다. 반면 Service Role factory는 이름만으로 특권을 드러내지 않고
  `server-only` import guard와 자체 필수 환경변수 검증이 없어, 향후 client
  import나 일반 route의 우발적 RLS 우회를 컴파일 단계에서 차단하지 못한다.
  현재 실제 호출처 14개를 추적했으며 정밀 위치 과권한은 `PRIV-001`에
  연결했다.
- **로드맵**: `G0-03`

### SEC-004 — `security definer` RPC 실행 권한 검증 부재

- **심각도 / 상태**: High / IN_PROGRESS
- **근거**: 추천, 아카이빙, 사용자 지도·상세 RPC가 `security definer`로
  정의된다. 함수들은 `search_path = public`을 사용하지만 migration에
  `REVOKE EXECUTE FROM PUBLIC/anon`과 필요한 역할의 `GRANT`가 없다.
- **시나리오**: 기본 EXECUTE 권한이 유지되면 API route 인증을 우회해 RPC를
  직접 호출할 수 있다. 특히 아카이빙과 상세 조회 함수의 영향이 크다.
- **영향**: 데이터 변경, 상세 위치·내용 노출, 추천 연산 남용.
- **개선**: 함수별 호출 주체 표를 만들고 PUBLIC/anon/authenticated/service_role
  권한을 명시적으로 revoke/grant한다. 인증용 함수 내부에는 `auth.uid()`와
  소유권 검사를 유지한다.
- **검증**: 역할별 RPC 호출 매트릭스와 DB 권한 쿼리 결과가 설계표와 일치.
- **진행 증거 (2026-07-25)**: 공개 지도·추천·상세·아카이빙 RPC는
  service-role 전용, `get_my_*` RPC는 authenticated 전용으로 기본 EXECUTE를
  회수해 다시 부여했다. security-definer lookup path는
  `pg_catalog, public, extensions`로 고정했다. 정적 계약 5/5가 통과했다.
- **원격 확인 (2026-07-25)**: 현재 테스트 DB의 `get_my_*`와 추천 RPC는
  `PUBLIC`, anon, authenticated, service-role 모두 EXECUTE 가능하고
  security-definer 함수의 search path가 `public`뿐인 상태다. 로컬 보완
  migration은 아직 적용되지 않았다.
- **남은 조건**: history 정합화 후 실제 DB에서 최소 권한 migration을
  적용하고 anon/member/service-role RPC matrix와 owner 우회 negative test를
  통과한다.
- **로드맵**: `G0-04`

### SEC-005 — 업로드 발급과 도메인 데이터의 연결 검증 부재

- **심각도 / 상태**: High / OPEN
- **근거**: `uploads/presign`은 Service Role로 임의 UUID key의 업로드 URL을
  발급한다. `sightings` POST는 전달받은 `photoKeys`의 bucket, prefix,
  업로더, 존재 여부를 검증하지 않고 저장한다. `lost-posts`도 동일 계열이다.
- **시나리오**: 다른 사용자의 공개 storage key를 재사용하거나, presign을
  대량 발급해 orphan object를 만들거나, body의 크기·MIME 선언과 실제 파일을
  다르게 업로드할 수 있다.
- **영향**: 사진 도용, 저장소 비용 증가, 비이미지 콘텐츠 유입, 데이터 무결성
  훼손.
- **개선**: 업로드 intent를 DB에 저장하고
  `owner/IP + purpose + key + expected MIME/size + expires_at + consumed_at`을
  제보 생성 시 원자적으로
  소비한다. 업로드 후 서버 측 object metadata·magic bytes를 검사하고
  실패·만료 object를 정리한다.
- **검증**: 타 사용자 key, 잘못된 prefix, 만료·중복 소비, MIME·크기 위조가
  거부되고 정상 1~3개 이미지만 저장된다.
- **진행 증거 (2026-07-25)**: 15분 `upload_intents`가 owner/익명 IP,
  purpose, bucket/key, 예상 MIME/크기를 묶는다. 생성 전 Storage 객체의 실제
  크기와 JPEG/PNG signature를 검사하고 service-role 전용 RPC가 intent 잠금,
  도메인 생성, 소비 기록을 한 트랜잭션에서 처리한다. 일일 fail-closed Cron은
  Storage 삭제 성공 key만 정리한다. 관련 정적 6/6·단위 5/5와 전체 88/88,
  TypeScript, ESLint 0/0, Webpack 25/25, production audit 0이 통과했다.
- **진행 증거 (2026-07-25, late upload)**: provider signed upload token의
  2시간 수명보다 먼저 15분 intent 행을 삭제하면 이후 업로드가 영구 orphan이
  되는 순서를 재현했다. 도메인 생성 기한은 15분으로 유지하되 cleanup은
  `created_at + 2시간 + 5분` 이후에만 실행하도록 RED 9/11에서 GREEN
  11/11로 수정했다.
- **진행 증거 (2026-07-25, atomic idempotency)**: 유실글의 분리된
  cache 조회·도메인 생성·cache 저장과 제보의 idempotency 부재를 제거했다.
  새 service-role RPC는 scope/key/identity advisory lock 뒤 기존 hash를
  비교하며, 도메인 행·intent 소비·embedding job·응답 cache를 같은
  트랜잭션에 기록한다. 이미 소비된 intent도 동일 신원·purpose일 때 RPC의
  cache 판정까지 도달하게 해 응답 유실 재시도를 복구하되, 다른 key의 재사용은
  RPC에서 409로 거부한다. 정확히 일치하는 live cache는 신원을 함께 검사해
  생성 rate limit과 Storage 재검증 전에 반환하고 DB 오류는 503으로 닫는다.
  SQL/API 계약은 RED 0/3에서 GREEN 3/3, consumed-intent replay는 RED
  5/6에서 GREEN 6/6, cache helper는 module 없음 RED에서 GREEN 2/2다.
  전체 Node 105/105, TypeScript, ESLint 0/0, Webpack 27/27, production
  audit 0을 통과했다.
- **남은 조건**: 실제 migration replay, owner/IP·만료·경쟁 소비 RPC matrix,
  동일 key 20-way 동시 생성, 정상/위조 파일 Storage E2E와 orphan 정리
  rehearsal을 통과한다. timeout 뒤 client가 같은 idempotency/upload key를
  재사용하는 fault flow는 M2-06에서 구현한다.
- **로드맵**: `G0-05`

### SEC-006 — OAuth callback의 외부 redirect 허용

- **심각도 / 상태**: Medium / IN_PROGRESS
- **근거**: `src/app/auth/callback/route.ts:7,17`에서 사용자 입력 `redirect`를
  `new URL(redirect, baseUrl)`에 그대로 전달한다.
- **시나리오**: 절대 URL을 전달하면 로그인 완료 후 피싱 사이트로 이동시킬 수
  있다.
- **영향**: 피싱, 사용자 신뢰 손상.
- **개선**: `/`로 시작하는 same-origin 상대 경로만 허용하고 `//`,
  backslash, 제어문자, 외부 origin은 `/`로 대체한다.
- **검증**: 정상 내부 경로만 유지되고 `https://evil.example`, `//evil.example`,
  인코딩 우회는 모두 `/`로 이동.
- **진행 증거 (2026-07-25)**: callback이 Host/proto 대신 검증된
  `APP_ORIGIN`을 사용한다. 절대 URL, scheme-relative, backslash,
  `javascript:` 입력이 canonical root로 강등되고 내부 path/query만
  유지되는 Node 테스트를 RED→GREEN으로 확인했다.
- **남은 조건**: staging OAuth 정상 로그인·복귀와 변조 redirect 통합 테스트.
- **로드맵**: `G0-06`

### SEC-007 — 우회·경합 가능한 rate limit

- **심각도 / 상태**: High / IN_PROGRESS
- **근거**: `src/shared/lib/ip.ts`가 첫 `x-forwarded-for` 값을 신뢰한다.
  `checkRateLimit()`은 count 후 별도 insert를 수행하며 회원 업로드·제보에는
  제한을 적용하지 않는다.
- **시나리오**: 신뢰되지 않은 프록시 환경에서 헤더를 바꾸거나 동시 요청을
  보내 제한을 초과한다. 계정을 생성하면 익명 제한을 피할 수 있다.
- **영향**: spam, 저장소·OpenAI 비용, DB 부하.
- **개선**: 플랫폼이 보장한 IP 헤더만 사용하고 HMAC 기반 IP 식별자를
  적용한다. DB 함수 또는 외부 atomic counter로 check-and-increment를
  원자화하며 IP·user·scope 제한을 함께 적용한다.
- **검증**: 위조 헤더, 동시 요청, 로그인 전환에도 설정된 제한을 넘지 않는다.
- **진행 증거 (2026-07-25)**: Vercel이 덮어쓰는
  `x-vercel-forwarded-for`는 `VERCEL=1`일 때만 신뢰하고 잘못된 IP는
  `unknown`으로 강등한다. `consume_rate_limit` RPC는 fixed-window PK
  upsert로 증가와 허용 판정을 원자화하며 service-role만 실행할 수 있다.
  업로드·제보·회원 지도는 IP와 user 축을 모두 소비한다. 계약·spoof 경계
  테스트는 RED 0/7에서 GREEN 7/7이다.
- **남은 조건**: 실제 PostgreSQL에서 50개 동시 요청의 허용 수가 max
  이하인지, Vercel staging에서 지정한 forwarding header가 덮어써지는지
  검증한다.
- **로드맵**: `G0-07`

### SEC-008 — API 입력 검증이 필드별 수동 검사에 의존

- **심각도 / 상태**: Medium / IN_PROGRESS
- **근거**: `src/shared/lib/api-input.ts`와 `public-api-guard.ts`가 JSON
  mutation, pagination, 추천 비용 파라미터, 지도 viewport와 동적 UUID의
  공용 경계를 제공한다. 모든 JSON mutation은 실제 stream을 64 KiB에서
  중단하며 production Next 서버의 HTTP 실패 응답도 자동 검증한다.
- **시나리오**: 비정상 좌표, 매우 긴 문자열, 잘못된 배열·시각으로 DB 오류,
  저장 비용, 로그 노이즈를 유발한다.
- **영향**: 500 응답, 데이터 품질 저하, 자원 고갈.
- **개선**: route 경계에 공유 schema validation을 도입하고 body 크기,
  문자열 정규화, UUID, ISO date, 위경도, 배열 길이, enum을 서버에서
  검증한다.
- **검증**: 필드별 경계값·잘못된 타입·초과 payload 테스트가 일관된 400
  error code를 반환.
- **진행 증거 (2026-07-25)**: presign·제보·유실글 생성/수정과 claim/view
  body에 객체·타입·문자열 길이·배열 수·UUID·시각·전역 좌표·Storage key
  검증을 적용했다. pagination, 추천 비용 범위, 지도 숫자 prefix/소수 zoom,
  동적 UUID도 엄격히 검사한다. validator 테스트는 RED 0/8에서 GREEN 9/9,
  지도 query 테스트는 5/5다. 선언·실제 byte 초과와 잘못된 JSON을 다루는
  stream reader 테스트는 RED 0/3에서 GREEN 3/3이다. production Next HTTP
  통합 테스트는 malformed JSON 400, 실제 64 KiB 초과 413, 지도 numeric
  prefix 400, 무인증 내부 API 401 두 건을 5/5로 확인했다. 전체 test 88/88,
  TypeScript, lint 0/0, Webpack 25/25가 통과했다.
- **남은 조건**: 실제 DB·Storage를 사용하는 정상 API 흐름, 업로드 MIME/byte
  위조와 staging 응답 계약을 검증한다.
- **로드맵**: `G0-08`

### SEC-009 — 브라우저 보안 헤더 기준 없음

- **심각도 / 상태**: Medium / IN_PROGRESS
- **근거**: `next.config.ts`가 enforce CSP와 표준 브라우저 헤더를 설정한다.
  Supabase source는 검증된 환경 origin에서 만들지만 Naver/Next 동작을 위해
  script/style `unsafe-inline`이 남아 있다.
- **시나리오**: 향후 사용자 입력 렌더링이나 외부 스크립트가 늘 때 XSS·클릭재킹
  피해 범위가 커진다.
- **영향**: 브라우저 측 방어 심층성 부족.
- **개선**: Naver Map, Supabase image, OAuth에 필요한 origin만 허용하는
  report-only CSP를 먼저 관찰한 후 enforce한다. 나머지 보안 헤더를
  Next.js headers 설정으로 고정한다.
- **검증**: 헤더 통합 테스트, CSP report 0, 지도·로그인·이미지 회귀 통과.
- **진행 증거 (2026-07-25)**: Next config testing API로 CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  frame 정책을 검증한다. Naver/Supabase source를 제한한 enforce CSP와
  HSTS를 적용했다. 하드코딩 프로젝트 ref는 제거하고 exact HTTPS
  `NEXT_PUBLIC_SUPABASE_URL`을 CSP와 Next Image의 단일 origin으로 사용한다.
  환경 origin 테스트는 RED 0/2에서 GREEN 2/2이며 전체 Node 88/88,
  TypeScript, lint 0/0과 합성 환경 Webpack 25/25를 통과했다.
- **남은 조건**: Naver SDK의 inline script/style 때문에 남은
  `unsafe-inline` 제거 전략, staging 브라우저 CSP violation 0, 핵심 E2E.
- **로드맵**: `G0-09`

### SEC-010 — Storage 정책이 코드로 재현되지 않음

- **심각도 / 상태**: High / VERIFY
- **근거**: `20260725030000_upload_intents.sql`이 두 public bucket과 10 MiB,
  JPEG/PNG 제한을 고정한다. 앱의 모든 사진 소비 경로는 `getPublicUrl()`을
  사용하며 anon/authenticated object 작업에는 restrictive 정책을 적용한다.
- **시나리오**: 대시보드 수동 설정이 환경마다 달라 업로드가 과도하게 열리거나
  비공개여야 할 사진이 공개될 수 있다.
- **영향**: 개인정보 노출, 환경 재현 실패.
- **개선**: bucket·용량·MIME·object 정책을 migration으로 관리하고 공개
  사진의 위치·보존 정책을 제품 정책에 맞춰 확정한다.
- **검증**: 새 스테이징을 migration만으로 구성한 뒤 익명/회원/Service Role
  저장·조회 매트릭스 통과.
- **진행 증거 (2026-07-25)**: 기존 private bucket도 public으로 교정하고,
  public download 외 browser role의 metadata 조회·직접
  insert/update/delete를 차단한다. 기존 bucket 갱신 누락은 RED 5/6에서
  GREEN 6/6으로 수정했으며 전체 Node 88/88, TypeScript, lint 0/0,
  Webpack 25/25, HTTP 5/5와 production audit 0을 통과했다.
- **남은 조건**: 빈 DB replay와 실제 anon/authenticated/service-role
  Storage matrix, public URL 조회와 직접 mutation 거부를 검증한다.
- **로드맵**: `G0-10`

### SEC-011 — 익명 사용자가 Next.js API를 우회해 sightings 직접 insert 가능

- **심각도 / 상태**: Critical / IN_PROGRESS
- **근거**: `supabase/schema.sql:332-335`의 `sightings_public_insert` 정책은
  `with check (true)`다. 브라우저에 제공되는 anon key로 Supabase REST table
  endpoint에 접근할 수 있는 구성에서는 앱 route를 거치지 않는다.
- **시나리오**: 공격자가 `/api/v1/sightings`의 rate limit, 필드 정규화,
  `photoKeys` 검사, embedding enqueue를 우회해 sightings를 직접 대량
  insert한다.
- **영향**: spam·부적절한 위치/내용, storage key 도용, 추천·지도 데이터 오염,
  운영 비용 증가.
- **개선**: sightings table의 anon/authenticated 직접 INSERT를 revoke하고
  Service Role을 사용하는 검증된 서버 API만 쓰게 한다. 익명 DB 직접 쓰기가
  제품 요구라면 제한된 RPC에 동일한 validation과 atomic rate limit을 넣고
  table INSERT는 닫는다.
- **검증**: anon/member의 REST table INSERT가 거부되고 정상 Next.js API
  요청만 데이터·embedding·rate-limit 기록을 원자적으로 생성한다.
- **진행 증거 (2026-07-25)**: `sightings_public_insert` 정책을 제거하고
  anon/authenticated의 table INSERT·UPDATE grant를 회수했다. authenticated는
  기존 owner SELECT·DELETE만 유지하며 서버 Service Role 생성 경로는
  변경하지 않았다.
- **원격 확인 (2026-07-25)**: 테스트 DB에는 `WITH CHECK (true)`인
  `sightings_public_insert`가 실제 활성화되어 있고 anon/authenticated에
  INSERT를 포함한 table privilege가 남아 있다.
- **남은 조건**: history 정합화 후 원격 정책·grant를 닫고 실제 anon/member
  REST INSERT 거부, 정상 익명/회원 API 생성과 embedding enqueue를 격리
  DB에서 검증한다.
- **로드맵**: `G0-14`

### SEC-012 — 공개 외부 API·광역 지도 조회의 비용 증폭

- **심각도 / 상태**: High / IN_PROGRESS
- **근거**: `src/app/api/v1/search/local/route.ts:13-51`은 무인증으로 Naver
  Search API를 호출하고 rate limit이 없다.
  `src/app/api/v1/public/map/clusters/route.ts:10-61`은 Service Role로 RPC를
  호출하며 위경도 값은 검사하지만 최대 bbox 면적·호출 빈도 제한은 없다.
- **시나리오**: 공격자가 검색어를 바꾸거나 전 세계 크기의 bbox를 병렬 호출해
  Naver quota, DB CPU, PostGIS scan과 서버 실행 시간을 소모한다.
- **영향**: 외부 API 비용·quota 고갈, 지도 지연, 서비스 가용성 저하.
- **개선**: route별 IP/device rate limit, query cache, 허용 bbox 면적·zoom
  조합, timeout·circuit breaker를 둔다. 지도 RPC가 bbox index를 사용하는지
  `EXPLAIN ANALYZE`로 확인하고 비용 상한을 정한다.
- **검증**: 검색 burst와 최대 bbox 경계 테스트가 429/400을 반환하며 quota와
  DB latency가 정한 한도를 넘지 않는다.
- **진행 증거 (2026-07-25)**: 검색은 query 80자·control 문자 경계,
  5초 upstream timeout, IP당 30/분·300/일을 적용했다. 공개·회원 지도는
  위도/경도 span 2°와 IP당 120/분을 적용하고 회원 지도는 user 축도 함께
  제한한다. upstream 오류 원문은 응답에서 제거했다. 전체 test 88/88,
  TypeScript, lint 0/0, Webpack 25/25가 통과했다.
- **남은 조건**: 실제 DB counter replay·burst 429, Naver quota 관찰,
  PostGIS `EXPLAIN ANALYZE`, staging timeout·정상 검색/지도 회귀를 통과한다.
- **로드맵**: `G0-15`

### SEC-013 — 요청 Host 기반 origin 신뢰

- **심각도 / 상태**: High / IN_PROGRESS
- **근거**: `src/app/auth/callback/route.ts:14-19`는 `Host`와
  `x-forwarded-proto`로 redirect base URL을 만든다.
  `src/shared/lib/embeddings-worker.ts:6-19`는 `request.url`의 origin으로
  `CRON_SECRET`이 포함된 내부 요청을 보낸다.
- **시나리오**: 배포 프록시가 공격자 지정 Host/proto를 원본 요청에 허용하면
  OAuth redirect가 외부 origin을 사용하거나 Worker trigger가 secret을 외부
  호스트에 전송할 수 있다.
- **영향**: 피싱, Cron secret 노출, 내부 Worker 무단 호출.
- **개선**: 서버 전용 `APP_ORIGIN`을 환경별 canonical origin으로 검증하고
  callback·Worker 내부 호출에만 사용한다. 허용 host 외 요청을 거부하고
  platform이 정규화하는 헤더 계약을 integration test로 고정한다.
- **검증**: 변조 Host/proto가 redirect·내부 fetch 목적지를 바꾸지 못하고,
  모든 Worker Authorization 전송 대상이 configured origin과 정확히 일치한다.
- **진행 증거 (2026-07-25)**: Worker와 OAuth callback에서 요청 Host/proto
  입력을 제거하고 검증된 HTTPS 또는 loopback HTTP `APP_ORIGIN`만 사용한다.
  잘못된 origin에서는 Worker trigger를 생략하고 callback은 503으로
  fail-closed한다. 관련 Node 테스트 4건이 통과한다.
- **남은 조건**: 배포 환경에 secret 값을 기록하지 않고 `APP_ORIGIN`을
  설정한 뒤 preview/production Host 변조 통합 테스트.
- **로드맵**: `G0-17`

### PRIV-001 — 회원에게 정밀 위치·제보 상세가 광범위하게 노출

- **심각도 / 상태**: High / IN_PROGRESS
- **기존 근거**: 인증 지도·상세·추천·claim 경계가 Service Role 조회와
  클라이언트 제공 UUID를 신뢰해 일반 회원에게 정밀 `lat/lng`·`note`를
  노출하거나 임의 claim을 허용했다.
- **시나리오**: 일반 회원 계정이 넓은 영역을 순회해 제보자의 동선·민감
  서술을 수집하거나, 추천·공유 등에서 알게 된 sighting UUID로 상세를 반복
  조회한다. 유실글 소유자는 후보 조회 또는 임의 claim을 반복해 매칭이
  확정되지 않은 제보의 정밀 위치를 수집할 수 있다.
- **영향**: 위치 프라이버시와 안전 위험.
- **개선**: 일반 회원 지도와 매칭 전 추천 결과는 공개 마스킹 좌표만
  반환한다. 정밀 좌표·비공개 note는 제보 소유자 또는 서버가 추천 후보
  적격성과 유실글 소유권을 검증해 생성한 match/claim 관계를 함께 확인하는
  전용 RPC를 통해서만 반환한다. 클라이언트가 임의 UUID로 만든 claim은
  정밀 접근 권한으로 인정하지 않는다.
- **검증**: anon/member/lost-owner/sighting-owner/eligible-candidate/
  matched-owner 역할별 응답 snapshot, 임의 UUID claim·상세 접근 거부,
  지도·추천 sweep에서 실제 좌표·note 0건, 검증된 matched-owner만 정밀 응답.
- **진행 증거 (2026-07-25)**: 인증 지도와 상세는 세션 JWT의 `auth.uid()`를
  사용하는 전용 RPC로 전환했다. 타인 지도 좌표와 모든 추천 응답은 안정적인
  0.05° grid로 마스킹하며 claim은 정밀도를 해제하지 않는다. claim RPC는
  lost-post owner, 검색 중·미보관 글, 만료되지 않은 추천 cache, 미보관
  sighting을 함께 검증한다. source/SQL 경계 5/5와 마스킹 단위 3/3을 포함한
  전체 Node 134/134, TypeScript, lint가 통과했다.
- **남은 조건**: 빈 DB migration replay, anon/member/lost-owner/
  sighting-owner 역할별 실제 RPC snapshot, PT-08 sweep, 별도 서버 검증
  matched-owner workflow와 정밀 응답 E2E가 필요하다.
- **검증 제한**: Supabase CLI 2.101.0 임시 다운로드 승인이 사용량 제한으로
  거절되어 migration dry-run/lint 및 원격 적용은 수행하지 않았고 우회하지
  않았다. Service Role factory의 `server-only`·명시적 이름·env fail-fast와
  client import 차단 계약 2/2는 로컬에서 통과했다.
- **로드맵**: `M1-06`

### QUAL-001 — 핵심 자동화 테스트·CI 부재

- **심각도 / 상태**: High / OPEN
- **근거**: unit·보안·SQL/source 계약 테스트, production Next HTTP 실패경계
  통합 테스트와 PR/push release workflow가 추가됐다. 실제 DB API·RLS·핵심
  E2E와 GitHub runner 실행 증거는 없다.
- **시나리오**: 인증·RLS·추천·업로드 변경이 수동 확인 없이 배포된다.
- **영향**: 보안 회귀와 장애 탐지 지연.
- **개선**: unit, route integration, SQL/RLS, 핵심 E2E 계층을 만들고 PR에
  build·lint·test·audit gate를 둔다.
- **검증**: 의도적으로 실패시킨 테스트가 배포를 차단하며 정상 branch에서
  전체 gate가 통과.
- **진행 증거 (2026-07-25)**: 읽기 전용 workflow가 `.nvmrc` Node 22,
  `npm ci`, test, typecheck, lint, Webpack build, production HTTP 경계 5건,
  production audit를 각각 실행한다. CI 계약은 RED 0/4에서 GREEN 4/4이며
  합성 비밀값 없는 로컬 검증은 88/88·TypeScript·lint 0/0·Webpack
  25/25·HTTP 5/5를 통과했다.
- **남은 조건**: 실제 GitHub Actions와 의도적 실패 차단, 정상 DB API·RLS·핵심
  E2E gate를 통과한다.
- **로드맵**: `G0-11`

### QUAL-002 — ESLint 실패와 검사 범위 오염

- **심각도 / 상태**: Medium / IN_PROGRESS
- **초기 근거**: `npm run lint` 27 errors, 37 warnings. `sim_test/.venv`의
  site-packages JS까지 검사하며, 앱에는 React effect/ref, `any`, hook
  dependency 오류가 남아 있다.
- **시나리오**: 실제 앱 오류가 외부 패키지 노이즈에 묻히고 React Compiler
  최적화가 건너뛰어진다.
- **영향**: 회귀 탐지 신뢰도와 렌더링 안정성 저하.
- **개선**: `.venv/**`를 전역 ignore하고 앱 오류를 원인별로 수정한다.
  CI에서는 warning budget을 0 또는 명시적 allowlist로 관리한다.
- **검증**: `npm run lint` exit 0, 외부 가상환경 파일 0건 검사.
- **진행 증거 (2026-07-25)**: `.venv`와 생성 결과를 ignore하고 API 타입,
  stale 인증 목록 상태, 지도 SDK 타입, 이미지 최적화 경고를 수정했다.
  NaverMap의 도메인·요청·SDK lifecycle을 분리해 현재 전체 lint는
  errors 0, warnings 0이며 외부 가상환경 검사는 0건이다.
- **진행 증거 (2026-07-25, CI)**: release workflow의 독립 필수 lint 단계와
  정적 계약 테스트를 추가했다.
- **남은 조건**: 새 checkout과 실제 GitHub Actions에서 전체 lint exit 0을
  재현한다.
- **로드맵**: `G0-12`

### QUAL-003 — 기준 스키마와 migration drift

- **심각도 / 상태**: High / OPEN
- **근거**: `schema.sql`의 ivfflat index가 현재 없는 `embedding` 컬럼을
  참조한다. 기준 스키마에는 제거된 `dismissed_at`의 과거 상태와 일부 최신
  migration 반영 여부가 혼재한다. migration에는 조직 도입 후 제거 이력도
  존재한다.
- **시나리오**: 신규 환경 bootstrap 또는 복구 시 SQL이 실패하거나 운영 DB와
  다른 정책·함수를 만든다.
- **영향**: 배포 실패, 데이터 손실 위험, 감사 불가능.
- **개선**: migration을 단일 진실 공급원으로 정하고 빈 DB replay를 자동화한다.
  `schema.sql`은 자동 dump로 재생성하거나 제거하고 수동 편집을 금지한다.
- **검증**: 빈 스테이징에 전체 migration 적용, schema diff 0, RPC smoke와
  rollback/recovery rehearsal 통과.
- **진행 증거 (2026-07-25)**: 기본 table/function 없이 `ALTER`부터 시작하던
  migration chain에 후속 변경 전 초기 schema를 추가했다. 시간순으로
  table/function 생성 전 ALTER를 탐지하는 preflight는 RED 0/2에서 GREEN
  2/2가 됐고 전체 Node test 88/88, TypeScript, lint 0/0이 통과했다.
- **원격 확인 (2026-07-25)**: 로컬 version은 `20250218...`~`20260725...`,
  원격 history는 `20260217...`~`20260218...`로 공통 version이 0개다. 이
  상태에서 전체 `db push`는 기존 객체에 로컬 이력을 재적용할 위험이 있어
  금지한다.
- **제공 schema 리포트 확인 (2026-07-25)**: 현재 8개 앱 table과
  `sightings_public_insert WITH CHECK (true)`는 원격 메타데이터 조회와
  일치한다. 반면 로컬 보안 migration의 `rate_limit_buckets`와
  `upload_intents`가 없으며, 제공 자료는 전체 DDL이나 migration statements가
  아니므로 history repair 근거로는 불충분하다.
- **남은 조건**: 원격 migration statements를 확보해 로컬 이력과 객체별로
  대조하고 정합화 계획을 승인한 뒤, 별도 빈 Supabase 전체 replay와 schema
  diff, RPC·RLS·Storage smoke를 통과한다. 정적 preflight는 PostgreSQL
  문법이나 권한 동작의 완료 증거로 사용하지 않는다.
- **로드맵**: `G0-13`

### QUAL-004 — 지도 컴포넌트의 과도한 책임 집중

- **심각도 / 상태**: Medium / IN_PROGRESS
- **초기 근거**: `NaverMap.tsx` 2,202줄. 지도 초기화, API fetch, cache, marker,
  경로 animation, 인증 상태, modal과 claim mutation을 한 파일이 담당한다.
- **시나리오**: 작은 지도 기능 변경이 다른 layer·상태·cleanup을 깨뜨린다.
- **영향**: 리뷰 난이도, 메모리 누수·중복 listener·회귀 가능성 증가.
- **개선**: 현재 동작 characterization test를 먼저 만든 뒤 map adapter,
  data hooks, layer renderer, selection state, presentation으로 단계 분리한다.
- **검증**: 기존 E2E 통과, listener·overlay cleanup test, 파일별 단일 책임
  리뷰 통과.
- **진행 증거 (2026-07-25)**: 순수 계산, owner/principal-bound data hook,
  최신 요청 guard, Naver SDK adapter와 layer renderer를 추출했다.
  `NaverMap.tsx`는 1,477줄이며 unit 88/88, TypeScript, lint 0/0,
  Webpack build 25/25가 통과했다.
  adapter cleanup은 RED 0/3·2/4에서 GREEN 4/4로 전환됐고 지도·listener와
  제보/유실글/경로 overlay 그룹에 연결됐다. renderer는 marker·polyline·
  frame·timeout 교체와 dispose를 RED→GREEN 5/5로 검증했다.
- **진행 증거 (2026-07-25, renderer 통합)**: renderer 호출 뒤의 중복 SDK
  fallback 287줄을 제거한 뒤 unit 88/88, TypeScript, lint 0/0, Webpack
  build 25/25를 다시 통과했다.
- **남은 조건**: default/unseen/bookmark·초기 포커스·claim 흐름의
  브라우저 회귀와 실제 SDK 자원 누수 검증을 통과한다.
- **로드맵**: `M1-07`

### QUAL-005 — 임베딩 Worker가 처리 실패를 정상으로 보고

- **심각도 / 상태**: High / IN_PROGRESS
- **초기 근거**: 기존 Worker는 DB SELECT error와 빈 큐를 같은 200 응답으로
  처리했고 엔티티 `embedding_status = ready` update 오류도 확인하지 않았다.
- **시나리오**: Supabase 장애·권한 오류가 발생해도 Cron은 성공으로 기록되고,
  embeddings row와 entity 상태가 불일치한 채 추천이 계속 pending이 된다.
- **영향**: 조용한 데이터 파이프라인 중단, 잘못된 운영 지표, 추천 기능 장애.
- **개선**: DB error와 empty queue를 분리하고 오류는 retry 가능한 5xx로
  반환한다. row와 entity 상태 전이를 DB 함수/transaction으로 원자화하거나
  보상·재조정 job을 둔다. 모든 update error를 확인한다.
- **검증**: SELECT/update/OpenAI 단계별 fault injection에서 5xx·retry·최종
  일관성이 확인되고, empty queue만 200을 반환한다.
- **진행 증거 (2026-07-25)**:
  `20260725000000_atomic_embedding_jobs.sql`에 claim/complete/fail RPC,
  lease token, 만료, 최대 3회 backoff를 추가했다. success RPC는 embeddings와
  entity 상태를 한 transaction에서 갱신하고 현재 lease token만 허용한다.
  함수 기본 EXECUTE를 회수하고 `service_role`에만 부여했다. Worker는 DB
  dependency/finalize 오류를 503으로 반환하며 raw 오류 메시지를 DB에
  저장하지 않는다. 정적 SQL·Worker 계약은 RED 0/5에서 GREEN 5/5다.
- **fault 진행 증거 (2026-07-25)**: provider 오류의 안전한 retry code,
  complete RPC 오류의 503 분류, lease 상실 시 덮어쓰기 차단, fail RPC의
  lease 상실을 injectable processor로 검증했다. 단계별 단위 4/4와 전체
  Node 140/140이 통과한다.
- **남은 조건**: 실제 PostgreSQL migration replay, anon/member/service-role
  EXECUTE 행렬, 20-way 동시 claim과 실제 DB/provider fault injection을
  격리 스테이징에서 통과한다.
- **로드맵**: `G0-16`

### QUAL-006 — 기본 Turbopack release build가 현재 환경에서 불안정

- **심각도 / 상태**: Medium / OPEN
- **근거**: 기존 `package.json:7`의 build script는 `next build`여서 Next.js
  16.1.1의 Turbopack을 사용했다. 사용자 실행의 panic log
  `/var/folders/qt/926xhqk94sq1ghdqb50y0_cr0000gn/T/next-panic-66724474034b845f211f1475f98f7c2a.log`에는
  `Permission denied (os error 13)`이 기록됐고, 감사 중 Turbopack 재실행도
  컴파일 단계에서 6분간 정체됐다. 같은 working tree의
  `next build --webpack`은 exit 0이었다.
- **시나리오**: 개발자 또는 CI가 기본 build script를 실행할 때 산출물을
  만들지 못해 검증과 배포가 중단된다.
- **영향**: release gate의 재현성 저하와 배포 지연.
- **개선**: 공개 MVP release build script와 CI를 Webpack으로 고정하고
  Turbopack은 선택적 실험 명령으로 분리한다. Next.js 업그레이드 후 격리
  branch에서 권한·캐시·watcher 원인을 재평가한다.
- **검증**: 새 checkout과 CI에서 Webpack 기반 `npm run build`가 연속 2회
  exit 0이고 24개 정적 페이지를 생성한다. Turbopack 실패는 release를
  차단하지 않으며 별도 issue에 panic log와 환경 정보를 보존한다.
- **진행 증거 (2026-07-25)**: `dev`와 `build` script를 Webpack으로
  고정했고 로컬 `npm run build` 연속 2회와 이후 보안 변경 포함 build가
  exit 0, 정적 페이지 24/24를 기록했다.
- **남은 조건**: 새 checkout과 CI의 연속 build 증거 및 별도 Turbopack issue
  기록이 필요하다.
- **로드맵**: `G0-18`

### OPS-001 — 관측성·운영 대응 기반 부족

- **심각도 / 상태**: Medium / OPEN
- **근거**: API route request ID·구조화 event, health/readiness와 Sentry
  client/Node/Edge 계측은 구현됐지만 실제 DSN/source map event,
  dashboard·alert와 스테이징 trace 증거가 아직 없다.
- **시나리오**: Supabase DNS, OpenAI, Cron, upload 장애가 발생해도 사용자
  503 로그 외에 영향 범위와 원인을 빠르게 찾기 어렵다.
- **영향**: 평균 복구 시간 증가, 비용 이상 탐지 지연.
- **개선**: 민감값을 제거한 구조화 로그, correlation ID, error tracking,
  dependency health, SLO와 alert를 도입한다.
- **검증**: 격리 스테이징의 의도적 Supabase/OpenAI 실패가 대시보드와 alert에
  나타나고 키·토큰·note 원문은 기록되지 않는다.
- **진행 증거 (2026-07-25)**: proxy가 비신뢰 `x-request-id`를 서버 UUID로
  교체해 요청·응답에 연결하고, API route의 직접 `console.*`는 0건이다.
  JSON logger는 token/secret/note/raw 위치·IP와 오류 원문을 제거하며 비동기
  embedding trigger까지 동일 request ID를 전달한다. 관련 계약 8/8, 전체
  Node 99/99, TypeScript, ESLint 0/0, Webpack 25/25, HTTP 6/6이 통과했다.
- **Sentry 진행 증거 (2026-07-25)**: SDK 10.68.0을 Next instrumentation,
  request error, app/root boundary와 처리된 API 5xx에 연결했다. PII 기본 전송,
  logs/replay/AI 원문은 끄고 request/body/query/user/extra/오류 원문과 span
  query를 제거한다. 공개 tunnel은 없고 검증된 ingest CSP만 허용한다. 관련
  계약 12/12, 전체 Node 112/112, TypeScript, ESLint 0/0, Webpack 27/27이
  통과했다.
- **남은 조건**: 실제 DSN·source map, Vercel/Sentry 민감 원문 0와 request ID
  연결률, Sentry 적용 후 HTTP 8/8, dependency 장애 dashboard·alert 검증.
- **health 진행 증거 (2026-07-25)**: dependency를 호출하지 않는 liveness와
  필수 설정·3초 Supabase probe를 사용하는 readiness를 분리했다. 설정 누락은
  probe 전 503으로 닫히며 공개 응답에 환경변수 이름·upstream 오류가 없다.
  단위 3/3, 전체 Node 103/103, Webpack 27/27, HTTP 8/8이 통과했다.
- **health 남은 조건**: 스테이징 정상 200·Supabase 단절 503, Vercel monitor,
  5분 이내 alert와 runbook 연결.
- **로드맵**: `M1-01`, `M1-02`

### OPS-002 — 백업·복구 절차와 복구 목표 미검증

- **심각도 / 상태**: High / VERIFY
- **근거**: DB·Storage backup/restore, 배포 rollback, incident runbook과
  RPO/RTO 목표는 추가됐으나 실제 복구 rehearsal 증거가 없다.
- **시나리오**: 운영자 실수, 외부 장애 또는 잘못된 migration으로 DB와
  object가 일부 손실돼도 복구 절차와 달성 가능한 시점이 확인되지 않는다.
- **영향**: 운영자 실수·DB 장애·잘못된 migration 이후 데이터 복구 불확실.
- **개선**: Supabase DB와 Storage를 함께 백업하고 기본 목표를
  `RPO ≤ 24시간`, `RTO ≤ 4시간`으로 정한 복구 runbook을 작성한다.
- **검증**: 격리 스테이징에서 합성 데이터를 복구해 RPO/RTO를 충족하고
  DB row와 object 체크섬이 원본과 일치한다.
- **진행 증거 (2026-07-25)**: `docs/runbooks/OPERATIONS.md`에 사전 Gate,
  앱/DB rollback 분기, DB·Storage backup, 합성 데이터 restore rehearsal,
  checksum, incident 대응과 타 작업자 증거 양식을 고정했다.
- **로드맵**: `M1-03`

### OPS-003 — 관리자·신고·변경 감사 기능

- **심각도 / 상태**: High / IN_PROGRESS
- **기존 근거**: 관리자 역할, 신고 route/table, 콘텐츠 숨김, 관리자 변경 audit
  log가 없어 유해 콘텐츠와 권한 남용을 추적할 수 없었다.
- **시나리오**: spam·유해 콘텐츠가 게시되거나 관리자 계정이 오용돼도
  사용자가 신고할 수 없고 누가 어떤 조치를 했는지 추적할 수 없다.
- **영향**: 공개 서비스의 spam·유해 콘텐츠·권한 남용 대응 불가.
- **개선**: 최소권한 관리자 역할, 신고 상태 전이, 콘텐츠 숨김과 관리자 변경
  audit log를 도입한다.
- **검증**: 모든 관리자 변경에 actor/time/reason이 남고 일반 회원의 관리자
  API 접근 성공은 0건이어야 한다.
- **진행 증거 (2026-07-25)**: Auth `app_metadata` 전용 관리자 판정, 원자
  hide/unhide, append-only audit, 중복 신고 방지, 양방향 차단 필터, high
  24시간·일반 72시간 SLA와 관리자 triage RPC/API를 구현했다. 일반 회원
  관리자 route는 404로 거부하며 전체 Node 170/170이 통과한다.
- **남은 조건**: 빈 DB replay, 일반 회원/admin 역할 matrix, 동시 신고와
  차단·hide 사용자/관리자 E2E, SLA alert 수신 검증.
- **로드맵**: `M1-04`, `M1-05`

### OPS-004 — 서비스·비용 SLO 대시보드

- **심각도 / 상태**: Medium / IN_PROGRESS
- **기존 근거**: API latency/error, upload, embedding queue, 외부 quota·
  비용을 집계하는 dashboard와 alert 설정이 없었다.
- **시나리오**: API 지연, embedding backlog 또는 외부 API 비용이 계속
  증가해도 임계치 경보가 없어 사용자 신고 전까지 운영자가 인지하지 못한다.
- **영향**: 성능 저하·비용 이상을 사용자가 신고한 뒤에야 인지.
- **개선**: availability 99.5%, API read p95 1초, write p95 2초, 5xx 1%
  미만을 초기 SLO로 정하고 월 예산 80%·100% alert를 연결한다.
- **검증**: 격리 스테이징 synthetic event가 각 SLO와 비용 임계치의
  dashboard·alert를 발생시키는지 확인한다.
- **진행 증거 (2026-07-25)**: identifier를 label로 사용하지 않는 RED 관측,
  service-role 전용 bounded snapshot, availability/read·write p95/5xx,
  queue·orphan·SLA·삭제 지연과 예산 80/100% evaluator를 구현했다.
  evaluator·RPC·내부 endpoint 계약 7/7이 통과한다.
- **남은 조건**: staging dashboard, synthetic warning/critical event와
  5분 이내 alert·runbook 링크 수신 검증.
- **로드맵**: `M1-08`

### PRIV-002 — 계정·데이터 삭제와 보존 정책

- **심각도 / 상태**: High / IN_PROGRESS
- **기존 근거**: 28일 archive SQL은 있으나 사용자 계정 삭제 요청, 사진·
  claim·cache, backup 내 데이터의 보존·삭제 흐름과 사용자 안내가 없었다.
- **시나리오**: 사용자가 계정 삭제를 요청해도 관련 사진·claim·cache와 backup
  사본이 기한 없이 남거나 일부만 삭제된다.
- **영향**: 불필요한 개인정보 장기 보유와 삭제 요청 처리 불가.
- **개선**: 데이터 분류별 보존 기간과 삭제·익명화 정책, 사용자 안내, backup
  만료 절차를 정한다.
- **검증**: 계정 접근 즉시 차단, primary 24시간 내 삭제, backup 30일 내
  만료를 E2E와 복구 표본으로 확인한다.
- **진행 증거 (2026-07-25)**: bounded 본인 요청, 즉시 Auth ban,
  deletion-pending 공용 인증 차단, lease/최대 8회 backoff worker,
  Storage→DB→Auth 삭제 순서와 민감정보 없는 hash tombstone을 구현했다.
  계정 삭제 계약·worker 테스트 10/10과 전체 Node 170/170이 통과한다.
- **남은 조건**: 빈 DB replay, 실제 Auth ban/token 차단, Storage/primary
  24시간 삭제, provider backup 30일 만료와 복구 표본 E2E.
- **로드맵**: `M1-09`

## 4. 긍정적 통제

- 서버 인증 helper는 쿠키 session 객체를 그대로 신뢰하지 않고
  `getUser(access_token)`으로 재검증한다.
- Service Role key는 `NEXT_PUBLIC_*`가 아니며 서버 모듈에서만 참조된다.
- 환경파일과 키 값은 현재 Git 추적 대상에서 발견되지 않았다.
- public cluster는 상세 point를 직접 반환하지 않고 줌과 좌표를 격자로 제한한다.
- presign은 목적, 개수, 선언 MIME, 선언 크기의 기본 allowlist를 갖는다.
- 익명 제보와 presign에는 DB 기반 rate limit의 초기 구현이 있다.
- 추천·개인 지도 RPC의 다수는 `search_path = public`과 `auth.uid()` 소유권
  조건을 사용한다.

## 5. 공개 출시 Gate

### Gate 0 — 반드시 충족

- [ ] `G0-01`~`G0-18`이 구현·리뷰·검증되고 연결 finding이 `CLOSED`다.
- [ ] production `npm audit` high/critical 0이며 예외는 만료일·완화책·승인자가
      기록되어 있다.
- [ ] build, TypeScript, lint, unit, API integration, RLS, 핵심 E2E가 CI에서
      통과한다.
- [ ] 격리 스테이징 침투 테스트의 Critical/High 미해결 항목이 0이다.
- [ ] Service Role, OpenAI, Naver, Cron secret이 회전·분리되고 로그에
      노출되지 않는다.
- [ ] 새 DB 환경 replay와 백업 복구 rehearsal이 성공한다.

### 격리 스테이징 침투 테스트 매트릭스

운영과 분리된 Supabase project·Vercel project, 합성 계정, 별도 key가 준비된
뒤에만 수행한다. 이번 감사에서는 운영/스테이징 대상에 공격 요청을 보내지
않았으므로 아래 상태는 `NOT RUN`이다.

| ID    | 시나리오                                        | 기대 결과                    | 현재    |
| ----- | ----------------------------------------------- | ---------------------------- | ------- |
| PT-01 | 무인증·오류 secret으로 Worker 반복 호출         | 401/503, OpenAI 호출 0       | NOT RUN |
| PT-02 | 타 사용자 lostPost/sighting 조회·수정·삭제      | 403 또는 404                 | NOT RUN |
| PT-03 | anon/member의 비공개 table REST/RPC 직접 호출   | 명시적으로 거부              | NOT RUN |
| PT-04 | 타 사용자·잘못된 prefix·만료 key로 제보 생성    | 400/403                      | NOT RUN |
| PT-05 | MIME, magic bytes, 음수·초과 크기 위조          | 업로드 또는 consume 거부     | NOT RUN |
| PT-06 | IP 헤더 변경·동시 요청·회원 전환으로 제한 우회  | 제한 초과 요청 429           | NOT RUN |
| PT-07 | OAuth 외부·scheme-relative redirect             | same-origin `/`로 고정       | NOT RUN |
| PT-08 | 지도 영역 sweep로 정밀 위치 수집                | 역할별 정밀도·빈도 정책 준수 | NOT RUN |
| PT-09 | 과대 JSON·배열·문자열·잘못된 좌표/시각          | 안정적인 400, 자원 급증 없음 | NOT RUN |
| PT-10 | 로그·에러 응답에서 token/key/note 검색          | 민감값 0건                   | NOT RUN |
| PT-11 | 검색·지도 API의 속도·일일 한도와 과대 bbox 우회 | 429/400, 외부 비용 상한 준수 | NOT RUN |
| PT-12 | 변조 Host/proto로 callback·Worker 호출          | 외부 redirect·secret 전송 0  | NOT RUN |

## 6. 백로그 요약

| 우선순위 | Finding                                                             | 개발 과제                                         |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| P0       | SEC-001~005, SEC-007, SEC-010~013, QUAL-001, QUAL-003, QUAL-005     | G0-01~05, G0-07, G0-10~11, G0-13~17               |
| P1       | SEC-006, SEC-008~009, QUAL-002, QUAL-006, PRIV-001~002, OPS-001~004 | G0-06, G0-08~09, G0-12, G0-18, M1-01~06, M1-08~09 |
| P2       | QUAL-004와 운영 후 hardening                                        | M1-07 및 로드맵 Later                             |

## 7. 관련 문서의 현재성

- `docs/PRODUCTION_READINESS.md`의 “Rate limit 없음”은 현재 코드와 다르다.
  익명 presign·제보에 초기 구현이 있으나 SEC-007 때문에 공개 운영 기준은
  충족하지 못한다.
- `docs/SDD.md`는 구현 이력과 설계를 제공하지만 출시 Gate나 검증 상태를
  대체하지 않는다.
- `docs/SIMILARITY_PIPELINE_AND_FORMULA.md`는 추천 기준 시점 자료다. 추천 변경
  시 평가 결과와 함께 갱신한다.
