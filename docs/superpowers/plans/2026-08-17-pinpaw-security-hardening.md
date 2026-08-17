# PinPaw Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PinPaw의 인증·RLS·위치정보·익명 제보·Storage·운영 복구 경계를 실제 DB와 staging evidence로 검증해 공개 운영 가능한 보안 기준선을 만든다.

**Architecture:** 현재 `Next.js + Vercel + Supabase`를 유지한다. 브라우저는 public key와 최소 데이터만 사용하고, 보호된 쓰기·정밀 조회·운영 작업은 Next.js BFF와 allowlisted RPC/worker를 통해 수행한다. DB/RLS, application authorization, edge quota, 운영 모니터링을 서로 독립된 방어층으로 둔다.

**Tech Stack:** Next.js 16.2.11, Node 22, TypeScript, Supabase Auth/Postgres/PostGIS/Storage, Vercel Cron, npm, Node test runner, GitHub Actions, Sentry, Naver API, OpenAI Embeddings

## Global Constraints

- Notion과 과거 감사 문서는 설계 의도와 역사적 맥락으로만 사용하고 Repository·migration·runtime evidence를 최종 근거로 삼는다.
- 익명 제보 UX를 유지하는 방향을 우선하며 CAPTCHA·전화 인증·device fingerprint는 human decision 없이 도입하지 않는다.
- Service Role은 브라우저와 일반 client module에서 import하지 않는다.
- 모든 보안 변경은 실패 테스트 또는 재현 가능한 negative test를 먼저 만든다.
- P0/P1은 실제 DB·staging evidence 없이 `CLOSED`로 표시하지 않는다.
- production secret rotation, provider 설정, migration 적용, traffic 변경은 승인된 운영 권한 없이는 실행하지 않는다.
- 각 task는 관련 테스트와 증거 파일을 남기며, 전체 회귀 명령은 `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`를 사용한다.

## File Map

| 영역        | 주요 파일                                                                                                                     | 책임                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| DB 기준선   | `supabase/schema.sql`, `supabase/migrations/*`                                                                                | table/RLS/RPC/Storage 정책           |
| 인증·경계   | `src/shared/supabase/server.ts`, `src/shared/lib/cron-auth.ts`, `src/app/auth/callback/route.ts`                              | token 재검증, 내부 route, redirect   |
| 위치·권한   | `src/shared/lib/privacy-location.ts`, map/detail/recommendation routes                                                        | response minimization과 owner policy |
| 익명·업로드 | `src/shared/lib/client-ip.ts`, `src/shared/lib/rate-limit.ts`, `src/shared/lib/upload-intents.ts`, upload/sighting routes     | abuse, intent, idempotency           |
| 운영        | `src/shared/lib/account-deletion-worker.ts`, `src/shared/lib/structured-log.ts`, Sentry config, `docs/runbooks/OPERATIONS.md` | 삭제, redaction, alert, recovery     |
| 검증        | `tests/security/*`, `tests/unit/*`, `tests/integration/*`, `.github/workflows/release-gate.yml`                               | 계약·동시성·release gate             |

## Human Decision Gate

다음 항목은 agent가 임의로 결정하지 않고 해당 task 시작 전에 승인 기록을 받아야 한다.

- public/authenticated/owner/admin별 위치 정밀도
- 익명 제보의 route별 rate limit, cooldown, burst, payload limit
- 사진·GPS·note·trail·embedding·cache·log의 보존기간
- CAPTCHA/전화 인증/device risk 도입 여부
- 관리자 MFA, break-glass, JIT 권한, IP 정책
- 신고 SLA, 자동 hide, appeal/복구
- backup 보존과 삭제 요청의 법적 예외

---

### Task 1: Repository와 DB 권한 기준선 고정

**Files:**

- Modify: `docs/SECURITY_OPERATING_ARCHITECTURE_REVIEW.md`
- Inspect: `package.json`, `supabase/schema.sql`, `supabase/migrations/*`, `src/app/api/**`, `src/shared/**`
- Test: `tests/security/service-role-boundary.test.mjs`, `tests/unit/data-plane-permissions.test.mjs`, `tests/integration/db-permission-matrix.sql`
- Evidence: `artifacts/security/baseline-inventory.json`, `artifacts/security/baseline-test.log`

**Interfaces:**

- Consumes: current routes, migrations, package scripts, existing security tests
- Produces: asset/API/RPC/Storage/Cron inventory and an explicit list of runtime checks that remain unverified

- [ ] **Step 1: Inventory 대상 확정**

  다음 명령으로 route, migration, test, secret reference 목록을 저장한다.

  ```bash
  rg --files src/app/api src/shared supabase/migrations tests/security tests/integration .github/workflows
  rg -n "SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|NAVER|CRON_SECRET|NEXT_PUBLIC_" src supabase .github docs .env.example
  ```

  성공 기준: 목록에 누락된 API route·migration·security test가 없고 secret 값은 출력하지 않는다.

- [ ] **Step 2: 기준선 테스트 실행**

  ```bash
  npm test
  npm run typecheck
  npm run lint
  npm run build
  ```

  성공 기준: 명령별 exit code와 test count를 evidence에 기록하고, 실패는 원인과 후속 task를 명시한다.

- [ ] **Step 3: 문서 상태 재분류**

  기존 finding을 `CONFIRMED`, `VERIFY`, `OPEN`, `HUMAN`으로 구분한다. migration에 통제가 있다는 사실과 remote DB에서 통과했다는 사실을 한 상태로 합치지 않는다.

- [ ] **Step 4: 독립 검토**

  문서에서 `TBD`, `TODO`, “적절히”, “나중에” 같은 실행 불가능한 표현을 검색하고, 각 항목에 파일·명령·성공 기준을 추가한다.

  ```bash
  rg -n "TBD|TODO|적절히|나중에|추후" docs/SECURITY_OPERATING_ARCHITECTURE_REVIEW.md docs/superpowers/plans/2026-08-17-pinpaw-security-hardening.md
  ```

  성공 기준: 계획 문서에 실행 기준 없는 placeholder가 없다.

---

### Task 2: RLS/RPC/Service Role 권한 경계 검증

**Files:**

- Modify if needed: `supabase/migrations/*`, `supabase/schema.sql`, `tests/integration/db-permission-matrix.sql`
- Test: `tests/security/service-role-boundary.test.mjs`, `tests/unit/data-plane-permissions.test.mjs`, `tests/integration/db-permission-matrix.sql`
- Runbook: `docs/runbooks/OPERATIONS.md`
- Evidence: `artifacts/security/db-catalog.json`, `artifacts/security/db-permission-matrix.json`

**Interfaces:**

- Consumes: Task 1 inventory and a disposable Supabase project or local Supabase
- Produces: role/table/function/storage matrix with expected and actual privilege rows

- [ ] **Step 1: 격리 DB 생성 또는 local DB 시작**

  ```bash
  npm run db:start
  npm run db:reset
  ```

  성공 기준: 전체 migration이 빈 DB에서 순서대로 적용되고 실패 migration이 없다.

- [ ] **Step 2: catalog query 실행**

  `tests/integration/db-permission-matrix.sql`을 기준으로 다음을 추출한다.
  - 모든 앱 table의 `relrowsecurity`
  - `anon`, `authenticated`, `service_role` table privilege
  - 모든 `security definer` function의 owner, `search_path`, execute privilege
  - `storage.objects` policy와 bucket public flag

  성공 기준: 결과가 `artifacts/security/db-catalog.json`에 저장되고, secret·JWT는 포함하지 않는다.

- [ ] **Step 3: negative matrix 실행**

  anon/member role로 operational table, precise location, embedding, rate-limit, idempotency, service-only RPC를 직접 호출한다.

  성공 기준: 허용되지 않은 SELECT/INSERT/UPDATE/DELETE/EXECUTE는 모두 거부되고, owner flow와 public masked read만 통과한다.

- [ ] **Step 4: 필요한 경우 최소 migration 작성**

  기존 schema를 대규모 재작성하지 않고, 실제 불일치 하나당 하나의 migration과 회귀 테스트를 추가한다. 모든 `security definer`는 `pg_catalog, public, extensions` 고정 search path와 명시적 role grant를 가진다.

- [ ] **Step 5: 전체 권한 회귀**

  ```bash
  npm test
  npm run typecheck
  npm run lint
  npm run db:reset
  ```

  성공 기준: 정적 계약과 실제 catalog 결과가 일치하고 기존 owner/public flow가 회귀하지 않는다.

---

### Task 3: 인증·IDOR·위치정보 응답 경계

**Files:**

- Inspect/Modify: `src/shared/supabase/server.ts`, `src/app/auth/callback/route.ts`, `src/shared/lib/privacy-location.ts`
- Inspect/Modify: map clusters, map detail, recommendation, trail, lost-post routes
- Test: `tests/security/app-origin.test.mjs`, `tests/security/authenticated-list.test.mjs`, `tests/security/precise-location-boundary.test.mjs`, relevant `tests/unit/*`
- Evidence: `artifacts/security/authorization-matrix.json`, `artifacts/security/location-response-snapshots/`

**Interfaces:**

- Consumes: Task 2 verified roles and test fixtures
- Produces: public/authenticated/owner/admin response contracts and IDOR negative tests

- [ ] **Step 1: 보호 route 호출 순서 확인**

  각 route에서 `getUser(access_token)` 또는 동등한 서버 검증 이후 resource lookup, ownership/status/block check, projection이 실행되는지 확인한다.

- [ ] **Step 2: IDOR test 작성**

  다음 입력을 다른 사용자 fixture로 바꿔 401/403/404 계약을 검증한다.
  - `userId`
  - `lostPostId`
  - `sightingId`
  - recommendation cache key
  - trail/path identifier

- [ ] **Step 3: 위치 response snapshot 작성**

  public, non-owner authenticated, owner, admin 각각의 raw JSON에서 precise lat/lng, note, photo key, owner identity, trail을 검사한다.

  성공 기준: UI가 아니라 API body 자체가 역할별 최소 필드만 포함한다.

- [ ] **Step 4: 추론 경로 테스트**

  zoom 1~21, 최대/minimum bbox, viewport 분할, cluster 반복, archived/blocked/closed row, 304/ETag를 조합한다.

- [ ] **Step 5: human policy와 결과 대조**

  승인된 위치 정밀도 표와 실제 snapshot을 비교한다. 승인 전에는 정밀도를 완화 또는 강화하는 제품 정책 변경을 구현하지 않는다.

---

### Task 4: 익명 제보 abuse와 Upload intent 원자성

**Files:**

- Inspect/Modify: `src/shared/lib/client-ip.ts`, `src/shared/lib/rate-limit.ts`, `src/shared/lib/upload-intents.ts`
- Inspect/Modify: sighting/lost-post/upload routes
- Modify if needed: `supabase/migrations/20260725020000_atomic_rate_limits.sql`, `20260725030000_upload_intents.sql`, `20260725040000_atomic_domain_idempotency.sql`
- Test: `tests/unit/atomic-rate-limit-contract.test.mjs`, `tests/unit/domain-idempotency-contract.test.mjs`, `tests/integration/db-concurrency.mjs`, upload-related tests
- Evidence: `artifacts/security/abuse-concurrency.json`, `artifacts/security/upload-rehearsal.json`

**Interfaces:**

- Consumes: Task 2 role matrix and Task 3 authenticated identity policy
- Produces: abuse policy test suite, server-side file verification, orphan cleanup evidence

- [ ] **Step 1: limiter dimensions 고정**

  route별로 anonymous IP hash, authenticated user, idempotency key, burst/concurrency를 어떤 순서로 소비하는지 기록한다. proxy header는 trusted proxy 경계에서만 사용한다.

- [ ] **Step 2: concurrency test 실행**

  20~50개 병렬 요청에서 허용 개수, 거부 코드, DB row 수, duplicate row 수를 측정한다. IPv4, IPv6, NAT-like shared identity, 회원 전환, 조작된 `x-forwarded-for`를 포함한다.

- [ ] **Step 3: upload negative test 실행**

  정상 JPEG/PNG와 다음 변형을 제출한다.
  - MIME만 위조
  - 확장자만 위조
  - magic bytes mismatch
  - 10 MiB 초과
  - 다른 목적의 key
  - 다른 owner/IP의 intent
  - 만료·중복 소비
  - 같은 idempotency key의 payload 변경

- [ ] **Step 4: orphan rehearsal 실행**

  provider signed URL 수명보다 먼저 intent를 삭제하지 않는지 확인하고, 업로드 후 domain row를 만들지 않은 object가 TTL 이후에만 정리되는지 확인한다.

- [ ] **Step 5: UX 통제는 승인 대기**

  CAPTCHA·전화 인증·device fingerprint는 구현하지 않고, 현재 limiter만으로 허용할 abuse 예산과 초과 시 사용자 경험을 `HUMAN` 승인 대상으로 남긴다.

---

### Task 5: Secret·Provider·Logging 경계

**Files:**

- Modify: `.env.example`, `src/shared/lib/naver-credentials.ts`, `src/shared/lib/operational-health.ts`, `.github/workflows/release-gate.yml`
- Inspect/Modify: `src/shared/lib/structured-log.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`, `src/instrumentation*.ts`
- Test: `tests/integration/http-boundaries.mjs`, `tests/security/security-headers.test.mjs`, secret/bundle scan script
- Evidence: `artifacts/security/secret-scan.txt`, `artifacts/security/observability-redaction.json`

**Interfaces:**

- Consumes: Task 1 secret inventory and Task 4 failure paths
- Produces: private/public environment contract, redaction evidence, provider failure behavior

- [ ] **Step 1: environment contract 정리**

  검색 secret은 `NAVER_CLIENT_SECRET`으로 통일하고 `NEXT_PUBLIC_`는 공개 지도 browser key에만 사용한다. 기존 이름을 제거할 때는 먼저 배포 환경과 readiness check를 함께 확인한다.

- [ ] **Step 2: static secret scan 실행**

  tracked files, `.env.example`, source map, build output, test output에서 secret pattern을 검사하고 실제 값은 출력하지 않는다.

- [ ] **Step 3: provider failure contract 확인**

  Naver/OpenAI timeout, 4xx/5xx, quota exhaustion, retry upper bound, circuit breaker, 429/503 response를 테스트한다.

- [ ] **Step 4: synthetic PII redaction 확인**

  GPS, note, JWT-like value, cookie, Authorization, presigned query를 포함한 staging event를 발생시키고 Sentry/Vercel에서 원문이 저장되지 않는지 운영 계정으로 확인한다.

- [ ] **Step 5: secret rotation은 승인 후 실행**

  rotation 계획과 이전 값 revoke 결과를 기록한다. production secret을 agent가 임의로 바꾸지 않는다.

---

### Task 6: CI/CD와 Release Gate 강화

**Files:**

- Modify: `.github/workflows/release-gate.yml`, `package.json` only if a missing script is required
- Inspect: `package-lock.json`, repository branch protection settings
- Test: `tests/unit/ci-release-gate.test.mjs`
- Evidence: `artifacts/security/ci-release-evidence.txt`, SBOM/artifact metadata

**Interfaces:**

- Consumes: Tasks 1~5의 static/unit/integration checks
- Produces: clean checkout에서 재현되는 required release checks

- [ ] **Step 1: clean install gate**

  ```bash
  npm ci
  npm audit --omit=dev --audit-level=low
  npm test
  npm run typecheck
  npm run lint
  npm run build
  ```

  성공 기준: production dependency Critical/High 0, 모든 명령의 exit code 0.

- [ ] **Step 2: permission/replay gate 연결**

  격리 DB가 제공되는 workflow에서 migration replay와 permission matrix를 실행한다. DB credential이 없는 PR에서는 “통과”로 위장하지 않고 `not run` evidence를 남긴다.

- [ ] **Step 3: artifact provenance**

  lockfile diff review, SBOM, build commit SHA, Node/npm version, workflow revision을 evidence에 기록한다.

- [ ] **Step 4: deliberate failure 확인**

  보안 test 하나를 의도적으로 실패시키고 branch protection이 release를 차단하는지 확인한 뒤 테스트 변경을 원복한다.

- [ ] **Step 5: 권한 보호 확인**

  GitHub branch protection에서 release gate가 required check인지 사람이 확인하고 기록한다.

---

### Task 7: Data Lifecycle와 Backup/Restore Rehearsal

**Files:**

- Inspect/Modify after human policy: `supabase/migrations/20250218120000_add_archived_at_28d_archiving.sql`, `20260725100000_account_deletion_jobs.sql`, `src/shared/lib/account-deletion-worker.ts`, `docs/runbooks/OPERATIONS.md`
- Test: `tests/unit/account-deletion-contract.test.mjs`, `tests/unit/account-deletion-worker.test.mjs`, DB restore verification script
- Evidence: `artifacts/security/restore-rehearsal.json`, `artifacts/security/deletion-lifecycle.json`

**Interfaces:**

- Consumes: approved retention/deletion policy and Task 2 permission baseline
- Produces: restore timing, checksum/row count comparison, deletion residue report

- [ ] **Step 1: lifecycle policy 승인 수집**

  LostPost, Sighting, photo, trail, embedding, recommendation cache, log/audit별 생성·사용·archive·삭제·backup expiry를 승인받는다.

- [ ] **Step 2: account deletion flow 검증**

  삭제 요청 후 DB row, Storage object, Auth user, embedding job, cache, notification, token이 어떤 상태인지 실제 fixture로 확인한다.

- [ ] **Step 3: 격리 프로젝트 restore**

  DB/Auth/Storage를 격리 대상으로 복구하고 row count, checksum, role privilege, 핵심 API 흐름을 비교한다.

- [ ] **Step 4: RPO/RTO 측정**

  RPO ≤ 24시간, RTO ≤ 4시간을 실제 elapsed time으로 기록한다. 목표를 못 맞추면 release gate를 통과시키지 않는다.

- [ ] **Step 5: rollback/forward-fix rehearsal**

  application rollback과 migration 실패 후 forward-fix 절차를 runbook에 따라 수행한다. production DB에 직접 실험하지 않는다.

---

### Task 8: 최종 Release Packet과 운영 승인

**Files:**

- Modify: `docs/SECURITY_OPERATING_ARCHITECTURE_REVIEW.md`, `docs/runbooks/OPERATIONS.md`, `docs/PROJECT_STATUS_KO.md`
- Evidence: `artifacts/security/release-packet.md`

**Interfaces:**

- Consumes: Tasks 1~7 evidence와 human decision record
- Produces: public traffic 확대 여부를 판단할 수 있는 단일 release packet

- [ ] **Step 1: finding 상태 갱신**

  각 finding을 evidence 링크와 함께 `OPEN`, `VERIFY`, `CLOSED`, `RISK_ACCEPTED` 중 하나로 갱신한다. 코드에 migration이 있다는 이유만으로 `CLOSED`로 바꾸지 않는다.

- [ ] **Step 2: release checklist 실행**

  리뷰 문서의 Gate 0~4를 하나씩 실행하고 agent/human/joint, 권한, 성공 기준, 증거 파일을 채운다.

- [ ] **Step 3: incident readiness 확인**

  위치 노출, secret 노출, Storage 비용 공격, DB 권한 오류, provider 장애에 대한 연락망·차단·복구 경로를 실제로 호출할 수 있는지 확인한다.

- [ ] **Step 4: 승인 기록 생성**

  P0/P1 종료, P2/P3 risk acceptance, human policy approval, traffic rollout 단계와 rollback owner를 release packet에 기록한다.

- [ ] **Step 5: 공개 전환 판정**

  P0와 필수 P1 evidence가 없으면 판정은 `HOLD`다. 모든 조건이 충족된 경우에만 제한 pilot → 관찰 → 단계적 확대 순서로 진행한다.

## Verification Summary

완료 선언 전에 다음을 모두 다시 확인한다.

```bash
npm ci
npm audit --omit=dev --audit-level=low
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

그리고 로컬 성공과 별도로 다음 evidence가 존재해야 한다.

- 실제 DB migration replay와 role/RLS/RPC/Storage matrix
- IDOR와 location raw response snapshot
- 20~50-way abuse/upload concurrency
- provider timeout/quota/replay와 PII redaction
- backup restore, deletion residue, RPO/RTO
- branch protection, release gate, human approval

이 계획은 구현 승인이 내려진 뒤 task 단위로 실행한다. 승인 전에는 문서·테스트 계획만 보완하고 production 코드·DB·secret·provider 설정을 변경하지 않는다.
