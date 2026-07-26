# PinPaw 운영 Runbook

이 문서는 격리 staging에서 배포·rollback·DB/Storage 복구·incident 대응을
다른 작업자가 재현하기 위한 절차다. 실제 비밀값, 사용자 데이터, access token은
증거 문서나 터미널 출력에 기록하지 않는다.

## 1. 공통 원칙

- production 작업 전 staging에서 같은 절차를 성공시킨다.
- 격리 검증 프로젝트: `pin-paw-ops-verify` (`lxqygnjgtehvynohjgtx`,
  ap-northeast-2). 프로덕션 `ivwzvwuqhxqphyqaanry`와 migration history가
  어긋나 있으므로 **production에 `db push`하지 않는다**.
- 로컬 `.env.local`은 `KEY=value` 형식(등호 좌우 공백 금지)으로 맞춘다.
  필수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN=http://localhost:3000`,
  `NEXT_PUBLIC_NAVER_CLIENT_ID`.
- Kakao: Dashboard → Authentication → Providers → Kakao 활성화 +
  Redirect URL `http://localhost:3000/auth/callback`. Auth 로그에
  `provider is not enabled`면 provider가 꺼진 상태다.
- Naver Maps: `NEXT_PUBLIC_NAVER_CLIENT_ID`(Maps ncpKeyId)와
  `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`(검색 OpenAPI)는 별개다.
  CSP는 `oapi.map.naver.com`, `*.map.naver.net`, `*.naver.net`,
  `*.pstatic.net`을 허용해야 한다. 지도 탭 이탈 후 복귀 시 맵이 안
  뜨면 Script 캐시·`initMap` remount 계약을 확인한다.
- 변경 전 배포 ID, migration version, DB backup 시각, Storage object 수와
  checksum manifest를 기록한다.
- migration history가 저장소와 다르면 `db push`를 중단한다.
- 복구 중에는 쓰기 트래픽과 Cron을 차단하고, 완료 후 readiness와 역할별
  권한 matrix를 통과하기 전까지 다시 열지 않는다.
- 목표는 DB·Storage `RPO ≤ 24시간`, 전체 서비스 `RTO ≤ 4시간`이다.

## 2. 배포 전 Gate

1. 대상 commit과 staging 배포 ID를 기록한다.
2. GitHub Release Gate의 `verify`, `database-replay`가 모두 성공했는지
   확인한다.
3. `npm audit --omit=dev --audit-level=low` 결과가 0인지 확인한다.
4. staging `/api/v1/health`가 200, `/api/v1/readiness`가 200인지 확인한다.
5. migration statement diff와 역할별 RLS·RPC·Storage matrix 결과를 첨부한다.
6. OAuth, 업로드, 추천, 지도, claim, 수정·삭제 핵심 E2E를 실행한다.

하나라도 실패하면 배포를 진행하지 않는다.

## 3. Rollback

### 애플리케이션만 문제인 경우

1. Vercel에서 직전 검증 완료 deployment를 선택한다.
2. production alias를 직전 deployment로 되돌린다.
3. health/readiness와 핵심 읽기·쓰기 smoke test를 실행한다.
4. 실패 deployment의 Cron이 더 이상 호출되지 않는지 확인한다.

### DB migration이 포함된 경우

DB migration은 down migration을 즉시 실행하지 않는다.

1. 쓰기 트래픽과 embedding/upload cleanup Cron을 중지한다.
2. 영향받은 migration 이후의 쓰기 여부를 확인한다.
3. 호환 가능한 이전 앱으로 되돌릴 수 있으면 앱만 rollback한다.
4. 데이터 변환이 비가역적이거나 손상되었으면 아래 복구 절차로 전환한다.
5. 원인과 선택한 복구 지점을 incident 기록에 남긴다.

## 4. DB·Storage 백업

### DB

1. Supabase PITR 또는 일일 backup의 최근 성공 시각을 확인한다.
2. `auth`, `public`, `storage` schema가 backup 범위에 포함되는지 확인한다.
3. 별도 격리 프로젝트에 복구할 수 있는 backup identifier를 기록한다.

### Storage

1. `lost`, `sightings` bucket의 object key, size, content type, checksum
   manifest를 생성한다.
2. DB의 참조 object와 manifest의 차이를 기록한다.
3. manifest와 object 사본은 production 프로젝트와 다른 접근 경계에 보관한다.

자유 서술, 좌표, token, signed URL은 manifest에 포함하지 않는다.

## 5. 복구 Rehearsal

1. 합성 사용자 2명, 유실글 2건, 제보 3건, claim 1건과 이미지 object를 만든다.
2. 시작 시각과 backup 시각을 기록한다.
3. 새 격리 Supabase 프로젝트에 DB backup을 복구한다.
4. Storage object와 manifest를 복구한다.
5. 저장소 migration version과 복구 DB의 version을 대조한다.
6. 아래 검증을 실행한다.
   - DB permission matrix
   - anon/member/owner/service-role CRUD·RPC matrix
   - Storage list/upload/replace/delete matrix
   - 합성 row 수와 object checksum
   - 앱 health/readiness와 핵심 E2E
7. 마지막 정상 데이터 시각과 서비스 복구 시각으로 RPO/RTO를 계산한다.
8. 격리 복구 프로젝트와 합성 데이터를 삭제한다.

RPO가 24시간, RTO가 4시간을 넘거나 checksum이 하나라도 다르면 rehearsal은
실패다.

## 6. Incident 대응

1. 탐지 시각, request ID, 영향 route, 오류율, queue depth를 기록한다.
2. 위치·note·token·cookie·authorization 원문은 기록하지 않는다.
3. 다음 순서로 범위를 줄인다.
   - health와 readiness 분리 확인
   - 최근 application deployment
   - 최근 migration과 권한 변경
   - Supabase DB/Storage 상태
   - embedding queue와 외부 API 상태
4. 보안·개인정보 노출 가능성이 있으면 즉시 공개 트래픽과 관련 Cron을 차단한다.
5. rollback 또는 복구 후 동일 request ID 흐름과 핵심 E2E를 확인한다.
6. 종료 시 원인, 사용자 영향, 탐지·완화 시간, 재발 방지 과제를 기록한다.

## 7. Rehearsal 증거 양식

- 실행자 / 검토자:
- staging project / application deployment:
- 기준 commit:
- backup identifier / backup 시각:
- 시작 / 종료 시각:
- 측정 RPO / RTO:
- DB row count·checksum 결과:
- Storage object count·checksum 결과:
- permission matrix 결과:
- 핵심 E2E 결과:
- rollback 결과:
- 민감정보 원문 0건 확인:
- 미해결 finding:

다른 작업자가 이 문서만으로 rehearsal을 재현하고 동일 결과를 얻어야 M1-03과
최종 runbook 조건을 `VERIFIED`로 변경한다.
