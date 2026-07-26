# PinPaw AI Goal·바이브 코딩 플레이북

> 목적: AI가 빠르게 코드를 생성하는 것보다, 공개 MVP를 안전하게 출고할 수 있는
> 작은 변경을 반복적으로 설계·검증·통합한다.

## 1. 장기 Goal

아래 objective를 그대로 사용한다. 별도 token budget은 지정하지 않는다.

> PinPaw를 공개 MVP로 안전하게 운영할 수 있도록 감사 백로그와 제품 로드맵을
> 순서대로 구현하고, 모든 출시 게이트와 검증 기준을 충족한다.

Goal의 근거 문서는 다음 두 개다.

- [보안·품질 감사](./SECURITY_AND_QUALITY_AUDIT.md): 위험, 증거, 검증 방법
- [공개 MVP 로드맵](./PUBLIC_MVP_ROADMAP.md): 순서, 완료 기준, 제품 범위

### Goal 상태 규칙

- **Active**: Gate 0부터 Milestone 2까지 하나 이상의 과제가 미완료다.
- **Complete**: 로드맵의 “공개 MVP Goal 완료 조건”이 실제 CI·스테이징
  증거로 모두 충족됐다.
- **Blocked**: 동일한 외부 의존성·권한·사용자 결정 부족으로 3회 연속 의미 있는
  진행을 하지 못했을 때만 사용한다.
- 토큰 부족, 어려운 문제, 한 과제 완료, 한 milestone 완료는 Complete 또는
  Blocked 사유가 아니다.
- Milestone 3은 이 Goal 범위에 포함하지 않는다. 공개 MVP 완료 후 운영 데이터를
  근거로 별도 Goal을 만든다.

## 2. 작업 선택 규칙

1. roadmap에서 선행 조건이 충족된 가장 낮은 번호의 미완료 P0를 선택한다.
2. 남은 P0가 P1 선행 과제에 막히면 해당 P1을 현재 P0보다 먼저 승격한다.
3. 두 번째 슬롯에는 P0를 지연시키지 않고 경계가 겹치지 않는 현재 milestone의
   P0 또는 P1을 선택할 수 있다.
4. P0가 없으면 현재 milestone의 P1을 선행 조건 순으로 선택한다.
5. 활성 과제는 최대 2개다.
6. 같은 파일, API 계약, DB table/function, migration 순서, 환경변수를 건드리는
   과제는 병렬화하지 않는다.
7. 보안 finding이 없는 기능 과제라도 인증·데이터·외부 호출 경계를 바꾸면 감사
   문서에 새 finding 또는 검토 기록을 먼저 추가한다.
8. 관련 없는 리팩터링, 패키지 일괄 업그레이드, 자동 `--force` 수정은 별도
   과제로 분리한다.

### 병렬화 가능 예

- `G0-02` 의존성 업그레이드 조사와 `G0-06` redirect 단위 테스트·수정
- `M1-01` 로그 스키마 설계와 `M1-03` 백업 runbook 초안
- `M2-04` 공유 metadata와 `M2-05` 접근성 검사

### 병렬화 금지 예

- `G0-03` RLS와 `G0-04` RPC 권한
- `G0-05` 업로드 intent와 `G0-07` rate limit
- 둘 이상의 migration 작성
- 같은 route 또는 같은 UI 상태를 수정하는 두 작업

## 3. 과제 생명주기

모든 과제는 아래 순서를 지킨다.

### 3.1 조사

- 현재 코드, 최근 diff, 관련 migration, 기존 문서를 읽는다.
- 오류·취약점을 재현하는 명령 또는 요청을 기록한다.
- 추정과 확인된 사실을 구분한다.
- 외부 문서가 필요하면 공식 문서와 advisory만 근거로 사용한다.

### 3.2 설계 승인

- 사용자 가치, 변경 범위, 공개 인터페이스, 데이터 흐름, 실패 모드, rollback을
  1페이지 이내로 제시한다.
- 2개 이상의 합리적 접근이 있으면 trade-off와 추천안을 제시한다.
- 인증, DB, storage, 공개 API는 설계 승인 전 구현하지 않는다.

### 3.3 Red

- 원래 실패를 잡는 가장 작은 자동 테스트를 먼저 작성한다.
- 테스트가 예상 이유로 실패하는 것을 확인한다.
- DB 변경은 역할별 실패 테스트와 migration replay 실패를 포함한다.

### 3.4 Green

- 테스트를 통과하는 최소 변경만 구현한다.
- 환경변수 미설정, 인증 실패, 외부 장애는 fail-closed 또는 명시적 degraded
  response로 처리한다.
- Service Role 사용 route는 인증·소유권·입력 검증이 끝난 뒤에만 admin
  client를 생성한다.

### 3.5 검증

- 변경 대상 테스트와 전체 회귀 검사를 실행한다.
- 명령, exit code, 실패·경고 수를 작업 기록에 남긴다.
- 캐시된 과거 결과나 “동작할 것”이라는 추정으로 완료 처리하지 않는다.

### 3.6 보안 리뷰

- 인증/인가, 입력, 출력 데이터 최소화, secret, log, rate limit, replay,
  동시성, 비용, rollback을 다시 확인한다.
- DB·storage는 anon/member/owner/admin 역할별 matrix를 실행한다.
- 새로운 위험은 감사 문서에 finding ID를 추가한다.

### 3.7 문서·커밋

- roadmap task 상태와 연결 finding 상태를 같은 변경에서 갱신한다.
- 커밋에는 한 과제와 그 테스트·문서만 포함한다.
- 기존 사용자 변경을 덮어쓰거나 광범위한 formatter를 실행하지 않는다.

## 4. Worktree와 병렬 작업 계약

### 4.1 시작

- `git rev-parse --git-dir`, `git rev-parse --git-common-dir`,
  `git branch --show-current`, `git status --short`로 현재 상태를 확인한다.
- 기준 branch가 dirty면 사용자의 기존 변경을 임의로 이동·삭제하지 않는다.
  현재 감사 기준에 포함된 변경을 사용자가 검토·commit해 깨끗한 기준 commit을
  만들기 전에는 Goal 구현용 worktree를 생성하지 않는다.
- 독립 과제마다 별도 worktree를 사용한다. branch 이름은
  `task/{소문자-roadmap-id}-{kebab-case-과제명}` 규칙으로 만든다. 첫 과제의
  예시는 `task/g0-01-worker-auth`다.
- worktree 생성 전 로컬 worktree 디렉터리가 `.gitignore`에 포함됐는지
  확인한다.

### 4.2 소유권

각 과제의 컨텍스트 패킷에 다음을 고정한다.

- 수정 허용 파일과 생성 파일
- 수정 금지 파일
- 사용하는 table, RPC, API route, 환경변수
- 다른 활성 과제가 생산하는 인터페이스
- migration 순번 소유자

두 과제가 같은 항목을 소유하면 병렬 실행을 중단하고 순차 작업으로 바꾼다.

### 4.3 통합

1. 각 branch에서 대상 테스트와 전체 필수 검사를 통과시킨다.
2. 첫 branch를 통합한다.
3. 두 번째 branch를 최신 통합 branch에 rebase한다.
4. 충돌 해결 후 전체 검사를 새로 실행한다.
5. DB 변경이 하나라도 있으면 빈 DB migration replay와 역할별 권한 검사를
   다시 실행한다.

## 5. 컨텍스트 패킷 템플릿

과제를 시작할 때 아래를 복사해 모든 항목을 채운다. 값이 없는 항목은 `없음`으로
명시한다. `{{ROADMAP_ID}}`와 `{{TASK_NAME}}`은 미완성 문구가 아니라 템플릿의
필수 입력 변수다. 실행용 Context Packet과 프롬프트를 저장하기 전 반드시 실제
값으로 치환하며, 치환되지 않은 `{{...}}`가 있으면 작업을 시작하지 않는다.

```markdown
# Context Packet — {{ROADMAP_ID}} {{TASK_NAME}}

## Outcome

- 사용자 가치:
- 연결 finding:
- 완료 기준:

## Scope

- 수정 허용:
- 생성:
- 수정 금지:
- 선행 과제/commit:

## Contracts

- API request/response:
- DB table/RPC:
- 환경변수:
- 다른 과제와 공유하는 interface:

## Failure & Security

- 인증/인가:
- 입력 경계:
- 외부 장애:
- 동시성/replay/rate limit:
- 민감 데이터/log:

## Verification

- Red 명령과 예상 실패:
- 대상 테스트:
- 전체 회귀:
- 스테이징 검증:

## Rollback

- 코드 rollback:
- migration forward-fix 또는 rollback:
- 데이터 복구:
```

## 6. 구현 요청 프롬프트

```text
Goal objective와 docs/SECURITY_AND_QUALITY_AUDIT.md,
docs/PUBLIC_MVP_ROADMAP.md를 기준으로 {{ROADMAP_ID}}만 구현해.

먼저 Context Packet을 작성하고 관련 코드·migration·최근 diff를 조사해.
구현 전 설계를 제시하고 승인을 받아. 승인 후 원래 문제를 재현하는 실패
테스트를 먼저 실행하고, 그 테스트를 통과하는 최소 변경만 적용해.

수정 허용 범위 밖의 파일, 관련 없는 리팩터링, 강제 의존성 업그레이드는
금지해. 검증 후 보안 리뷰를 수행하고 finding과 roadmap 상태를 실제 증거로
갱신해. 완료 보고에는 변경 파일, 검증 명령과 exit code, 남은 위험,
rollback 방법을 포함해.
```

## 7. 보안 리뷰 프롬프트

```text
{{ROADMAP_ID}} 변경을 공격자 관점에서 검토해.

1. 인증 없이 가능한 동작
2. 일반 회원이 다른 사용자 데이터에 수행 가능한 동작
3. Service Role까지 도달하는 입력 경로
4. request body/query/header 조작
5. IDOR, replay, race, rate-limit 우회
6. secret·token·위치·사진·note의 응답/로그 노출
7. 외부 API 장애와 비용 증폭
8. migration/RLS/RPC/storage 권한
9. rollback과 데이터 복구

각 지적은 severity, 근거 파일/라인, 재현 절차, 영향, 최소 수정,
회귀 테스트를 포함해. 근거가 없으면 취약점으로 단정하지 말고 검증 필요로
분류해.
```

## 8. 코드 리뷰 프롬프트

```text
{{ROADMAP_ID}} diff가 Context Packet과 완료 기준을 충족하는지 리뷰해.

우선순위는 보안·데이터 손실·동시성·계약 위반·테스트 누락 순서야.
finding은 파일과 라인을 명시하고, 실제 재현 가능한 문제만 보고해.
스타일 선호는 차단 finding으로 만들지 마. 테스트가 구현 세부가 아니라
사용자/보안 동작을 검증하는지 확인하고, migration은 빈 DB와 기존 DB
두 경로를 검토해.
```

## 9. DB migration 프롬프트

```text
{{ROADMAP_ID}} DB 변경을 migration 단일 진실 공급원 원칙으로 설계해.

빈 DB와 기존 데이터가 있는 DB 모두에서 적용 가능해야 하고, lock 시간,
backfill, constraint 검증, index 생성, RLS, grant/revoke, security definer
search_path와 execute 권한을 명시해. destructive rollback 대신 안전한
forward-fix와 backup/restore 절차를 제공해.

먼저 실패하는 schema/RLS 테스트를 만들고 migration 적용 후 역할별
anon/member/owner/service_role matrix와 schema diff를 실행해.
```

## 10. 완료 보고 템플릿

```markdown
# Completion — {{ROADMAP_ID}}

## Outcome

- 완료 기준별 결과:
- 사용자에게 달라진 동작:

## Changes

- 코드:
- API/DB/config:
- 감사·로드맵 문서:

## Evidence

| 명령/시나리오 | 결과 | exit code |
| ------------- | ---- | --------- |

## Security Review

- 닫힌 finding:
- 새 finding:
- 역할별 권한 검증:
- 민감 데이터/log 검증:

## Rollback

- 코드:
- DB/data:

## Remaining Risk

- 다음 과제로 넘긴 위험:
- 다음 roadmap ID:
```

## 11. 과제별 필수 검증

### 공통

```bash
npx next build --webpack
npx tsc --noEmit
npm run lint
npm audit --omit=dev
```

`G0-18` 완료 전 공개 MVP의 build 근거는 Webpack 명령만 사용한다. `G0-18`
완료 후에는 Webpack을 명시한 `npm run build`를 같은 검증에 사용한다.

테스트 인프라가 추가된 뒤에는 `npm test`와 핵심 E2E 명령을 CI의 필수
검사로 포함한다. audit advisory 예외가 필요하면 advisory ID, 적용 가능성,
완화책, 만료일과 승인자를 감사 문서에 기록한다.

### API·인증

- 무인증, 만료 token, 정상 사용자, 다른 사용자, malformed body를 검증한다.
- 401과 403/404, 400, upstream 502/503을 구분한다.
- Service Role query 전에 사용자와 리소스 관계가 검증됐는지 확인한다.

### DB·RLS·RPC

- 빈 DB migration replay와 기존 snapshot upgrade를 모두 실행한다.
- anon, authenticated, owner, 다른 사용자, service_role의 CRUD/RPC matrix를
  실행한다.
- `security definer`의 `search_path`와 EXECUTE grant를 확인한다.

### 업로드

- 정상 JPEG/PNG, 선언/실제 MIME 불일치, 0/음수/초과 크기, 만료·중복·타
  사용자 key, orphan cleanup을 검증한다.

### UI

- 로그인/로그아웃, 지도 로드, 유실글 등록, 제보 등록, 추천 확인, claim,
  마감의 공개 MVP 핵심 흐름을 검증한다.
- keyboard, focus, screen reader label, 모바일 viewport와 네트워크 실패를
  포함한다.

## 12. 중단·에스컬레이션 규칙

- 동일한 수정 가설이 3회 실패하면 추가 patch를 중단하고 설계·아키텍처를
  재검토한다.
- 운영 secret, 운영 데이터, destructive migration이 필요하면 사용자 승인을
  받기 전 실행하지 않는다.
- 침투·악용·부하 테스트 트래픽은 승인 여부와 무관하게 운영 URL에 보내지 않는다.
  운영과 분리된 Supabase·Vercel project, 합성 계정과 별도 key를 사용하는
  격리 스테이징이 없으면 테스트를 실행하지 않고 `NOT RUN`으로 유지한다.
- CI가 실패한 상태로 finding이나 roadmap task를 CLOSED/Done으로 바꾸지 않는다.
- Goal은 token 사용량이나 경과 시간 때문에 완료 처리하지 않는다.
