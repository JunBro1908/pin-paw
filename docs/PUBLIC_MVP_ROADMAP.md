# PinPaw 공개 MVP 제품·기술 로드맵

> **최신 상태 안내 (2026-08-02):** 이 문서의 과제 정의와 2026-07-25 진행
> 기록은 유지한다. 현재 코드 규모, 최신 검증 결과, 의존성 설치 상태와 출시
> 판정은 [현재 프로젝트 진행 현황](./PROJECT_STATUS_KO.md)을 우선한다.

> 기준일: 2026-07-25  
> 최우선 성과: **운영 안정성**  
> 출시 대상: 불특정 사용자가 접근하는 공개 MVP

## 1. 로드맵 원칙

1. 보안·데이터 보호·복구 가능성이 기능 출시보다 우선한다.
2. Gate 0이 닫히기 전에는 격리 스테이징 외 트래픽을 받지 않는다. 외부 공개는
   Milestone 2와 공개 MVP Goal 완료 조건까지 충족한 후에만 허용한다.
3. 각 과제는 독립적으로 검증 가능해야 하며 완료 기준과 지표가 없으면 시작하지
   않는다.
4. DB migration, 인증, storage, 공개 API 변경은 보안 리뷰를 필수로 한다.
5. Milestone 2까지가 공개 MVP Goal의 완료 범위다. Milestone 3은 공개 MVP
   운영 데이터가 확보된 뒤 별도 제품 Goal로 전환한다.

보안 근거는 [보안·품질 감사](./SECURITY_AND_QUALITY_AUDIT.md), 실행 규칙은
[AI 개발 플레이북](./AI_VIBE_CODING_PLAYBOOK.md)을 사용한다.

## 2. 표기

- **우선순위**: P0 공개 차단, P1 공개 전 운영 필수, P2 성장·고도화
- **시점**: Now 현재 milestone, Next 다음 milestone, Later 운영 데이터 이후
- **크기**: S 1~2일, M 3~5일, L 1~2주. 테스트·리뷰·문서를 포함한 상대 추정치다.
- **상태**: Planned, In Progress, Blocked, Done

## 3. Gate 0 — 공개 차단 해소

Gate 0은 선행 조건을 지키며 진행한다. `G0-03`과 `G0-04`, `G0-05`와
`G0-07`, `G0-02`와 `G0-18`은 인터페이스가 겹치므로 각각 같은 시점에 병렬
구현하지 않는다.

| ID    | 우선순위 / 시점 / 크기 | 개발 과제와 사용자 가치                                      | 선행 조건                        | 완료 기준·지표                                                            | 위험                         | Finding  |
| ----- | ---------------------- | ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------- | ---------------------------- | -------- |
| G0-01 | P0 / Now / S           | Worker 인증 fail-closed, 동시 실행 잠금. 비용·큐 남용 차단   | 별도 `CRON_SECRET` 발급          | secret 없음 503, 오류 401, 정상 200; 무인증 OpenAI 호출 0                 | Cron 헤더 불일치로 작업 중단 | SEC-001  |
| G0-02 | P0 / Now / M           | Next.js와 런타임 의존성을 안전 버전으로 업그레이드           | 공식 호환성·release note 확인    | production audit high/critical 0; build·E2E 통과                          | React/Next 동작 변경         | SEC-002  |
| G0-03 | P0 / Now / M           | 모든 public table의 RLS·grant를 명시해 직접 REST 접근 차단   | 스테이징 권한 dump               | 역할별 CRUD matrix 통과; 비공개 table anon/member 접근 0                  | 잘못된 policy로 앱 장애      | SEC-003  |
| G0-04 | P0 / Now / M           | `security definer` RPC의 PUBLIC/role EXECUTE 최소화          | G0-03 권한표                     | 역할별 RPC matrix 통과; 소유권 우회 0                                     | Cron·앱 RPC 호출 차단        | SEC-004  |
| G0-05 | P0 / Now / L           | 업로드 intent 발급·검사·원자적 소비와 orphan 정리            | Storage 정책 결정                | 위조 요청 100% 거부; 24시간 초과 orphan은 일 1회 삭제, 참조 object 삭제 0 | 기존 업로드 호환성           | SEC-005  |
| G0-06 | P1 / Now / S           | OAuth callback same-origin redirect allowlist                | 없음                             | redirect 우회 테스트 전부 `/`; 정상 내부 이동 유지                        | 로그인 후 복귀 경로 손상     | SEC-006  |
| G0-07 | P0 / Now / L           | 신뢰 가능한 IP 추출과 atomic rate limit, 회원·익명 이중 제한 | 배포 프록시 규칙 확정            | 한도 미만 요청 100% 허용; 50개 동시 요청의 승인 수가 설정 max 이하        | NAT 환경 오탐                | SEC-007  |
| G0-08 | P1 / Now / M           | 공용 입력 schema와 일관된 API 400 응답                       | API 오류 계약 고정               | route 경계값 테스트 통과; validation 유발 500 응답 0                      | 기존 클라이언트 payload 거부 | SEC-008  |
| G0-09 | P1 / Now / M           | CSP report-only→enforce와 브라우저 보안 헤더                 | Naver/Supabase/OAuth origin 목록 | 스테이징 7일·핵심 E2E에서 허용되지 않은 CSP violation 0 후 enforce        | 지도 SDK 차단                | SEC-009  |
| G0-10 | P0 / Now / M           | bucket·object 정책을 migration으로 재현                      | 사진 공개 범위 결정              | 빈 환경 replay 후 role별 storage matrix 통과                              | 기존 public URL 변경         | SEC-010  |
| G0-11 | P0 / Now / L           | unit·API·RLS·핵심 E2E와 CI release gate                      | 테스트 DB 구성                   | 의도적 실패가 merge 차단; 정상 CI 전 단계 통과                            | flaky E2E                    | QUAL-001 |
| G0-12 | P1 / Now / M           | ESLint 범위 정상화와 앱 오류 제거                            | G0-11 CI 기초                    | lint error 0, 외부 `.venv` 검사 0, warning 정책 문서화                    | React effect 수정 회귀       | QUAL-002 |
| G0-13 | P0 / Now / L           | migration 단일 진실 공급원, 빈 DB replay와 schema diff       | 스테이징 초기화 절차             | replay 성공, drift 0, RPC smoke·복구 rehearsal 통과                       | 잘못된 migration 순서        | QUAL-003 |
| G0-14 | P0 / Now / M           | sightings table 직접 INSERT를 닫고 검증된 서버 쓰기만 허용   | G0-03, G0-07, G0-08              | anon/member REST insert 거부; 정상 API만 원자적 기록 생성                 | 익명 제보 흐름 중단          | SEC-011  |
| G0-15 | P0 / Now / M           | Naver 검색·공개 지도에 호출·bbox·비용 상한 적용              | G0-07, G0-08                     | 검색 30/분·300/일/IP, 지도 120/분/IP; 위·경도 span 2° 초과 400            | 정상 지도 이동 제한          | SEC-012  |
| G0-16 | P0 / Now / M           | Worker 오류·빈 큐 분리와 상태 전이 일관성 보장               | G0-01, G0-11                     | 단계별 fault injection에서 5xx·retry·최종 상태 일치                       | 중복 embedding 처리          | QUAL-005 |
| G0-17 | P0 / Now / S           | canonical `APP_ORIGIN`으로 callback·Worker 목적지 고정       | G0-01, G0-06                     | 변조 Host/proto에서 외부 redirect·secret 전송 0                           | preview 환경 origin 불일치   | SEC-013  |
| G0-18 | P1 / Now / S           | 공개 MVP release build와 CI를 Webpack으로 고정               | 없음                             | 새 checkout·CI에서 `npm run build` 연속 2회 exit 0, 정적 페이지 24개 생성 | 임시 workaround 장기화       | QUAL-006 |

### 현재 진행 상황 — 2026-07-25

| ID    | 상태        | 완료한 범위·증거                                                                      | 남은 완료 조건                                       |
| ----- | ----------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| G0-01 | In Progress | fail-closed 9건; service-role SKIP LOCKED lease; Vercel Cron GET 계약 6/6             | DB replay, 정상 Cron 200, 동시 호출·호출 제한 검증   |
| G0-02 | In Progress | Babel 7.29.7 override·production audit 0; Next 16.2.11; Node 140/140·TS·Webpack 27/27 | 깨끗한 CI·핵심 E2E·staging image smoke               |
| G0-03 | In Progress | 로컬 RLS/grant lock-down; 원격 3 table RLS OFF·browser 전체 grant 확인                | history 정합화·원격 적용·역할별 REST CRUD matrix     |
| G0-04 | In Progress | auth.uid privacy RPC·claim 직접 쓰기 revoke·public CREATE revoke·경계 계약 통과       | CLI lint·원격 적용·RPC/owner 우회 matrix             |
| G0-05 | In Progress | intent·원자 생성/소비·orphan·cache replay; 계약 3/3·replay 단위 8/8                   | DB/Storage replay·20-way 경쟁·위조 파일 E2E          |
| G0-06 | In Progress | 외부/scheme-relative/backslash redirect 차단 테스트; canonical origin 적용            | staging OAuth 정상 복귀·변조 통합 테스트             |
| G0-07 | In Progress | Vercel-only IP trust, atomic fixed-window RPC, IP/user 이중 제한; 계약 7/7            | DB 50-way concurrency·staging spoof 검증             |
| G0-08 | In Progress | mutation·query·UUID·64 KiB; production HTTP 실패·trace·health 경계 8/8                | 정상 DB/Storage API·위조 upload·staging 검증         |
| G0-09 | In Progress | CSP/헤더와 env-bound Supabase image/connect origin RED 0/2→GREEN 2/2                  | inline 정책 축소, staging CSP/E2E·7일 관찰           |
| G0-10 | In Progress | public bucket·10 MiB·JPEG/PNG·browser object 작업 restrictive 정책; 계약 6/6          | 빈 DB replay·실제 역할별 Storage matrix              |
| G0-11 | In Progress | PR/push CI: app gate+DB replay/matrix/concurrency 계약; Node 140/140                  | 실제 Actions·API/RLS/E2E gate                        |
| G0-12 | In Progress | `.venv` 제외·lint 0/0·CI 필수 단계; 합성 env 전체 local 재현                          | 실제 Actions·branch protection에서 재현              |
| G0-13 | In Progress | 초기 schema·순서 2/2; 원격/로컬 공통 migration version 0개 확인                       | statements 대조·정합화 승인·빈 DB replay/schema diff |
| G0-14 | In Progress | 로컬 INSERT 차단; 원격 `WITH CHECK(true)`·browser INSERT grant 확인                   | history 정합화·원격 적용·정상 API 통합 검증          |
| G0-15 | In Progress | 검색 30/분·300/일·5초 timeout, 지도 120/분·2° bbox, test 140/140                      | DB burst·Naver quota·EXPLAIN·staging 회귀            |
| G0-16 | In Progress | 원자 RPC·lease/backoff; provider/finalize/lease fault injection 4/4                   | DB replay·권한 행렬·실제 20-way 경쟁                 |
| G0-17 | In Progress | APP_ORIGIN·exact HTTPS Supabase origin 검증; 요청 Host/proto·project ref 제거         | preview/staging Host·환경 drift 검증                 |
| G0-18 | In Progress | dev/build Webpack 고정·Google font 의존 제거; 제한 네트워크 build 27/27·계약 1/1      | 새 checkout·CI 연속 build, Turbopack issue 증거 보존 |

### Gate 0 종료 조건

- `G0-01`~`G0-18`이 Done이며 연결된 감사 finding이 CLOSED다.
- 격리 스테이징 `PT-01`~`PT-12`에서 Critical/High 미해결이 0이다.
- build, lint, typecheck, unit, API integration, RLS, 핵심 E2E가 CI에서
  재현된다.
- 배포 secret이 개발/스테이징/운영으로 분리되고 운영 secret 회전 절차가
  검증된다.

## 4. Milestone 1 — 운영 가능성

| ID    | 우선순위 / 시점 / 크기 | 개발 과제와 사용자 가치                                                   | 선행 조건                    | 완료 기준·지표                                                               | 위험                    | Finding  |
| ----- | ---------------------- | ------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | ----------------------- | -------- |
| M1-01 | P1 / Next / M          | request ID, 구조화 로그, 민감값 redaction, error tracking. 장애 원인 추적 | Gate 0                       | 핵심 route trace 연결률 100%; key/token/note 원문 0                          | 로그 비용·과다 수집     | OPS-001  |
| M1-02 | P1 / Next / M          | health/readiness, Supabase·OpenAI·Cron 상태와 alert                       | M1-01                        | 의도적 dependency 장애 후 5분 내 alert·runbook 링크 수신                     | 외부 장애로 false alert | OPS-001  |
| M1-03 | P1 / Next / M          | DB·Storage 백업, point-in-time 복구와 quarterly rehearsal                 | G0-10, G0-13                 | 합성 데이터 RPO ≤24시간, RTO ≤4시간 복구; 체크섬 일치                        | 복구 중 object 누락     | OPS-002  |
| M1-04 | P1 / Next / L          | 관리자 역할, 제보·유실글 조회/숨김, 변경 audit log                        | G0-03~04                     | 일반 회원 접근 0; 모든 관리자 변경 actor/time/reason 기록                    | 관리자 권한 남용        | OPS-003  |
| M1-05 | P1 / Next / L          | 신고, 차단, spam triage, 처리 상태·사유                                   | M1-04, G0-07                 | E2E 통과; high 신고 24시간·일반 신고 72시간 SLA 표시·alert                   | 악의적 신고             | OPS-003  |
| M1-06 | P1 / Next / L          | 위치·사진·note 노출 정책과 역할별 정밀도·보존 기간                        | G0-03~05                     | role별 응답 snapshot·PT-08 통과; 필드별 보존 기간 100% 명시                  | 매칭 가치 감소          | PRIV-001 |
| M1-07 | P2 / Next / L          | NaverMap을 adapter/data hook/layer renderer/UI로 단계 분리                | G0-11 characterization tests | 주요 E2E 동일; listener·overlay cleanup test 통과                            | 지도 기능 회귀          | QUAL-004 |
| M1-08 | P1 / Next / M          | 운영 대시보드: API 오류율·latency·upload·embedding 비용·queue             | M1-01~02                     | 99.5% availability, read p95 1초, write p95 2초, 5xx <1%; 예산 80/100% alert | 지표 cardinality 비용   | OPS-004  |
| M1-09 | P1 / Next / M          | 개인정보 처리, 계정·데이터 삭제, 28일 archive/삭제 정책 정합화            | M1-03, M1-06                 | 계정 접근 즉시 차단, primary 24시간 내 삭제, backup 30일 내 만료 E2E         | 법·정책 해석 오류       | PRIV-002 |

### 현재 진행 상황 — 2026-07-25

| ID    | 상태        | 완료한 범위·증거                                                                    | 남은 완료 조건                                                    |
| ----- | ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| M1-01 | In Progress | Sentry client/Node/Edge·5xx correlation·strict sanitizer; 전체 170/170·build 27/27  | DSN/source map·Sentry 후 HTTP·민감값 0 staging                    |
| M1-02 | In Progress | dependency 없는 health와 설정/DB readiness 분리; 단위 3/3·HTTP 8/8                  | staging 정상/장애 monitor·5분 alert·runbook                       |
| M1-03 | In Progress | 배포·rollback·DB/Storage backup/restore·incident runbook과 증거 양식 작성           | 다른 작업자 staging rehearsal·RPO/RTO/checksum                    |
| M1-04 | In Progress | app_metadata admin·원자 hide/unhide·append-only actor/action/target/reason audit    | migration replay·비관리자/admin 역할 E2E                          |
| M1-05 | In Progress | 원자 중복 신고·양방향 차단 필터·high 24h/일반 72h SLA·관리자 triage                 | DB 동시성·사용자/관리자 E2E·SLA alert                             |
| M1-06 | In Progress | JWT 권한 RPC·0.05° 마스킹·활성 추천 후보 claim 검증; 전체 Node 170/170·build 27/27  | CLI lint·빈 DB replay, 서버 검증 match workflow, 역할별 E2E·PT-08 |
| M1-07 | In Progress | domain·data hook·SDK adapter·renderer 연결, fallback 제거; 56 tests·lint 0·build 24 | 지도 핵심 브라우저 회귀·실제 SDK 누수 검증                        |
| M1-08 | In Progress | low-cardinality RED·운영 snapshot·SLO/예산 warning/critical evaluator               | live dashboard·synthetic event·5분 alert                          |
| M1-09 | In Progress | 즉시 Auth ban·lease/backoff 삭제 worker·Storage→DB→Auth·최소 tombstone              | primary/backup 실제 삭제·복구 표본 E2E                            |

### Milestone 1 종료 조건

- 모든 P1 항목이 Done이고, 미완료 P2는 공개 운영에 미치는 위험과 후속 일정을
  기록한다.
- 장애를 감지하고 담당자가 runbook만으로 진단·복구할 수 있다.
- 관리자 행위와 신고 처리가 감사 가능하다.
- 백업·복구와 데이터 삭제를 스테이징에서 실제로 재현했다.
- 정밀 위치·사진·note가 역할과 보존 정책에 맞게만 노출된다.

## 5. Milestone 2 — 사용자 신뢰와 공개 MVP 완성

`근거 = Product`는 현재 취약점 finding의 수정이 아니라 공개 MVP에 새로 필요한
제품 기능임을 뜻한다. 구현 중 보안·품질 문제가 발견되면 finding ID로 교체한다.

| ID    | 우선순위 / 시점 / 크기 | 개발 과제와 사용자 가치                            | 선행 조건           | 완료 기준·지표                                                | 위험               | 근거    |
| ----- | ---------------------- | -------------------------------------------------- | ------------------- | ------------------------------------------------------------- | ------------------ | ------- |
| M2-01 | P1 / Next / L          | 새 후보·claim·상태 변경 알림과 수신 설정           | M1-01, M1-06        | 중복 0, opt-out 1분 내 반영, 스테이징 delivery 성공률 ≥95%    | 알림 피로·개인정보 | Product |
| M2-02 | P1 / Next / M          | 회원 제보 수정과 사진 교체·삭제                    | G0-05, G0-08, M1-04 | 소유자만 수정; 교체 후 orphan 0; 변경 audit 100%              | 수정으로 추천 왜곡 | Product |
| M2-03 | P1 / Next / M          | 유실글·제보 상태 이력과 찾음/마감 후 후속 흐름     | M1-01               | 허용·금지 상태 전이 테스트 통과; 이력 유실 0                  | 잘못된 상태 전이   | Product |
| M2-04 | P1 / Next / M          | 공유 링크, Open Graph, 민감 위치를 제외한 미리보기 | M1-06               | Kakao·Slack·일반 crawler snapshot 통과; 비공개 필드 노출 0    | crawler cache      | Product |
| M2-05 | P1 / Next / M          | 키보드·스크린리더·색 대비·focus와 모바일 지도 UX   | G0-11               | 핵심 E2E keyboard 통과; axe critical/serious 0                | 지도 SDK 제약      | Product |
| M2-06 | P1 / Next / M          | 네트워크 오류·offline·재시도·중복 제출 UX          | G0-05, G0-07        | DNS/timeout/중복 20회 fault test마다 도메인 데이터 정확히 1건 | 무제한 재시도      | Product |
| M2-07 | P1 / Next / M          | 공개 MVP 퍼널·신뢰 지표: 등록→추천 확인→claim→종료 | M1-08, M1-09        | 이벤트 schema test·opt-out 통과; raw 위치·note 수집 0         | 과도한 추적        | Product |

### 현재 진행 상황 — 2026-07-25

| ID    | 상태        | 완료한 범위·증거                                                           | 남은 완료 조건                    |
| ----- | ----------- | -------------------------------------------------------------------------- | --------------------------------- |
| M2-01 | In Progress | in-app notifications migration·me API·`/my/notifications` UI·계약 테스트   | staging delivery ≥95%·opt-out E2E |
| M2-02 | In Progress | owner mutation RPC·EditForm(traits/LocationPicker/idempotency)·audit queue | Storage orphan 0·mutation E2E     |
| M2-03 | In Progress | status history trigger·owner history API·상세 이력 UI                      | 금지 전이 E2E                     |
| M2-04 | In Progress | `/share/lost-posts`·OG image·cover·privacy smoke                           | Kakao/Slack crawler snapshot      |
| M2-05 | In Progress | `lang=ko`·skip link·focus-visible·aria busy/live 계약                      | axe critical/serious 0·키보드 E2E |
| M2-06 | In Progress | client key/intent 재사용·파일 hash 단위 4/4·EditForm lifecycle             | 20-way fault/concurrency staging  |
| M2-07 | In Progress | funnel schema·5이벤트 클라이언트 배선·analytics opt-out 설정 UI            | staging opt-out E2E               |

`M2-06`은 현재 In Progress다. 서버는 동일 idempotency key의 도메인 생성과
upload intent 소비를 DB 트랜잭션으로 직렬화한다. 클라이언트도 동일 payload의
모호한 실패에서는 key와 upload intent를 재사용하고, payload 또는 파일
SHA-256이 바뀌거나 성공했을 때만 회전한다. 20회 fault/concurrency staging
검증은 남아 있다.

`M2-03`도 In Progress다. lost-post 상태 trigger는 `searching → found/closed`,
`found → searching/closed`만 허용하고 `closed`를 terminal로 고정한다. 모든
변경은 actor/time과 함께 owner-only 이력에 남고 API는 actor ID를 반환하지
않는다. 빈 DB replay와 실제 owner/타인 역할 E2E는 남아 있다.

### 공개 MVP Goal 완료 조건

- Gate 0, Milestone 1, Milestone 2가 모두 종료 조건을 충족한다.
- 7일간 격리 스테이징 soak test에서 Critical/High 장애와 보안 finding이 0이다.
- 배포·rollback·복구·incident runbook을 다른 작업자가 재현한다.
- 감사 finding과 roadmap 상태가 실제 코드·CI·스테이징 증거로 갱신되어 있다.

## 6. Milestone 3 — 매칭 고도화

Milestone 3은 공개 MVP 운영 데이터와 명시적 사용자 동의를 확보한 뒤 별도 Goal로
진행한다. 현재 SDD의 가정만으로 production ranking을 변경하지 않는다.

| ID    | 우선순위 / 시점 / 크기 | 개발 과제와 사용자 가치                           | 선행 조건        | 완료 기준·지표                                                                  | 위험               | 근거    |
| ----- | ---------------------- | ------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | ------------------ | ------- |
| M3-01 | P2 / Later / L         | 익명화된 추천 평가셋과 baseline                   | M2-07, 동의 정책 | 합의된 label 500쌍 이상, 평가자 간 κ ≥0.7, precision/recall·NDCG baseline 고정  | 표본 편향          | Product |
| M3-02 | P2 / Later / L         | 이미지 임베딩 offline 실험과 text+image reranking | M3-01            | holdout NDCG@10 ≥5% 개선, rerank p95 ≤500ms, 추론비 ≤$0.01/request              | 얼굴·배경 편향     | Product |
| M3-03 | P2 / Later / M         | 추천 이유와 confidence 표현                       | M3-01            | 사용성 시험 참가자 ≥80%가 후보/확정 차이를 이해하고 확정 표현 0                 | 과신 유도          | Product |
| M3-04 | P2 / Later / L         | 후보 발생 알림과 feedback 학습 데이터 품질        | M2-01, M3-01     | feedback event 계약 정합률 ≥99%, opt-out 후 신규 학습 event 0                   | feedback loop 편향 | Product |
| M3-05 | P2 / Later / M         | 모델·prompt·가중치·비용·품질 experiment registry  | M3-01            | 실험 100%가 dataset/model/config/metric/cost/commit을 기록하고 30분 내 rollback | 실험 설정 drift    | Product |

## 7. 문서·현재 구현 정합성

- `PRODUCTION_READINESS.md`의 “Rate limit 없음”은 현재 코드와 다르다.
  구현은 존재하지만 [SEC-007](./SECURITY_AND_QUALITY_AUDIT.md#sec-007--우회경합-가능한-rate-limit)
  수준의 공개 운영 보완이 필요하다.
- `SDD.md`의 구현 설명은 기능의 현재 의도를 설명하는 자료로 유지한다. 보안
  완료 여부는 감사 finding과 이 로드맵 상태만을 기준으로 한다.
- `SIMILARITY_PIPELINE_AND_FORMULA.md`는 추천 실험의 기준 시점 자료다.
  `M3-*` 변경은 dataset, metric, experiment ID와 함께 새 기준 시점을 기록한다.
- 현재 package script의 release build는 Webpack으로 고정됐다. `G0-18`은
  새 checkout·CI의 연속 build 증거가 추가될 때까지 In Progress이며 Turbopack
  성공을 공개 MVP Gate의 근거로 요구하지 않는다.
- roadmap 항목이 Done으로 변경될 때 연결 finding, PR/commit, 검증 명령,
  스테이징 증거 링크를 같은 변경에서 갱신한다.
