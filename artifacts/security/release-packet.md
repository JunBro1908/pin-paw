# PinPaw Security Release Packet

상태: **HOLD — 공개 운영 전환 승인 불가**  
기준일: 2026-08-17  
판정 기준: `docs/SECURITY_OPERATING_ARCHITECTURE_REVIEW.md` Gate 0~4

## 1. 현재 코드·자동화 증거

| 영역                                 | 결과                                                | 증거                                                 |
| ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| Unit/contract/security test          | PASS — 420/420                                      | `npm test`                                           |
| TypeScript                           | PASS                                                | `npm run typecheck`                                  |
| ESLint                               | PASS                                                | `npm run lint`                                       |
| Webpack production build             | PASS — 41 static pages/routes compiled              | `npm run build`                                      |
| HTTP boundary integration            | PASS — 8/8 (latest rerun)                           | `npm run test:integration`                           |
| Formatting/diff hygiene              | PASS                                                | `npx prettier --check`, `git diff --check`           |
| Secret naming/bundle boundary        | PASS — server-only names absent from `.next/static` | `tests/security/naver-secret-boundary.test.mjs`      |
| Conditional cache visibility         | PASS                                                | `tests/security/conditional-cache-boundary.test.mjs` |
| Recommendation block filtering       | FAIL-CLOSED 구현                                    | `tests/unit/recommendation-evidence-enrich.test.mjs` |
| Upload presign idempotency isolation | PASS — owner/IP binding                             | `tests/unit/upload-intent-contract.test.mjs`         |
| CI release gate contract             | PASS                                                | `tests/unit/ci-release-gate.test.mjs`                |
| Lifecycle/runbook contract           | PASS                                                | `tests/unit/account-deletion-contract.test.mjs`      |
| Local SBOM reproduction              | PASS — CycloneDX 1.5, 491 components                | `npm sbom --sbom-format=cyclonedx`                   |
| Production dependency audit          | PASS — 0 vulnerabilities                            | `npm audit --omit=dev --audit-level=low`             |
| Release packet consistency           | PASS                                                | `tests/security/release-packet-consistency.test.mjs` |

## 2. CI에 반영된 gate

로컬 build에서 `metadataBase` 경고가 보였지만, layout은 유효한 `APP_ORIGIN`이
설정된 경우에만 metadata base를 생성하도록 fail-safe 처리되어 있다. 운영 build에서는
canonical `APP_ORIGIN`을 필수로 주입해야 하며, localhost fallback을 운영 증거로
사용하지 않는다.

- `npm ci`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:integration`
- `npm audit --omit=dev --audit-level=low`
- CycloneDX SBOM 생성 및 artifact 보관
- Supabase migration replay
- DB permission matrix
- DB concurrency test

## 3. 미충족·외부 증거 대기

사용자 환경에서 `npm run db:reset` 성공 및 PostgreSQL 18.6 연결이 확인됐고 `db-permission-matrix.sql`은
`db permission matrix passed`, DB concurrency는 `rate limit 50-way, lease 20-way`
결과로 통과했다. replay 성공 출력도 사용자 실행으로 확보되어 로컬 DB Gate를 완료 처리한다.

다음 항목은 코드 존재만으로 완료 처리하지 않는다.

- [x] Supabase CLI/Docker로 빈 DB migration replay 성공 — 사용자 실행 성공
- [x] anon/authenticated/owner/admin/service-role RLS·RPC·Storage matrix 성공
- [x] 20~50-way DB/upload/rate-limit 동시성 실측 — rate limit 50-way, lease 20-way
- [ ] staging OAuth redirect/session/revoke/logout 검증
- [ ] staging Storage signed URL·orphan cleanup 검증
- [ ] Naver/OpenAI quota·timeout·alert 실측
- [ ] Sentry/Vercel synthetic PII redaction 실측
- [ ] backup restore rehearsal 및 checksum 비교
- [ ] RPO ≤ 24시간·RTO ≤ 4시간 측정
- [ ] provider backup expiry 확인
- [ ] GitHub branch protection required check 확인
- [ ] 의도적 보안 테스트 실패가 merge를 차단하는지 확인
- [ ] production secret rotation 및 이전 값 revoke 증거

최근 production 읽기 전용 확인:

- `/api/v1/health`: HTTP 200
- `/api/v1/readiness`: HTTP 200, `status=ready`
- 두 endpoint 모두 `Cache-Control: no-store, max-age=0`
- 판정: production readiness 통과. Sentry DSN을 포함한 필수 readiness 환경변수가 deployment에 반영된 상태로 확인됨.

production root 읽기 전용 보안 헤더도 확인했다: CSP, HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`가 모두 존재한다. 외부
provider 검색·업로드·쓰기 API는 비용·데이터 변경 가능성 때문에 실행하지 않았다.

사용자 승인 후 production에서 비파괴 API 경계를 추가 확인했다:

- valid public map viewport: HTTP 200, `clusters=[]`, ETag 및 public cache policy 확인
- 동일 public map 요청에 ETag 재사용: HTTP 304, `public, max-age=0, must-revalidate` 확인
- invalid map viewport: HTTP 400 validation error
- invalid upload body: HTTP 400 validation error, 파일/intent 생성 없음
- Cron 인증 누락/오류: 각각 HTTP 401
- health/readiness: 각각 HTTP 200
- 보호 API 4종 unauthenticated 요청: 모두 HTTP 401 (`auth map`, `recommendations`, `notifications`, `my sightings`)
- OAuth callback 외부 redirect probe: 수정·재배포 후 `307 → 308` chain이 `https://www.pinpaw.co.kr/?auth=cancelled`로 종료됨. `evil.example`로 redirect되지 않아 canonical origin 경계 통과.

## 4. 승인 판정

위 미충족 항목 중 P0/P1 또는 운영 권한·provider·DB 증거가 필요한 항목이 남아 있으므로 현재 판정은 **HOLD**다.

### 사용자 범위 결정

사용자는 남은 staging/provider/backup/GitHub 운영 검증을 현 단계에서 실행하지
않기로 결정했다. 해당 항목은 `UNVERIFIED / RISK ACCEPTANCE REQUIRED`로 남기며,
이 결정은 검증 완료나 공개 운영 승인으로 해석하지 않는다.

공개 운영 전환 조건:

1. Gate 0~4의 모든 체크를 실행한다.
2. 각 결과에 command/API output과 실행 시각을 첨부한다.
3. 실패 항목은 수정 후 동일 검증을 재실행한다.
4. 남은 위험은 명시적 risk acceptance와 담당자를 기록한다.
5. 보안 검토자와 운영 승인자가 release packet을 승인한다.
