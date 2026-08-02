# PinPaw 따뜻한 UX 브라우저 검증 증거

검증 환경: Node 22.23.1, Next.js 16.2.11, Asia/Seoul  
검증일: 2026-08-02  
브랜치: `feat/warm-field-ux-final` (worktree `pinpaw-warm-ux-final`)

## 판정 요약

| Gate                        | 결과     | 근거                                                                                                                                    |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 소스/UX 계약                | PASS     | warm-ux / sighting / map / recommend / my-activity 계약 33/33 포함, 전체 unit 330/330                                                   |
| format / typecheck / lint   | PASS     | `format:check`, `tsc --noEmit`, `eslint .` exit 0                                                                                       |
| production build            | PASS     | `npm run build` (부모 `.env.local` 로드) route 생성 완료                                                                                |
| HTTP boundary               | PASS     | `npm run test:integration` 8/8                                                                                                          |
| 브라우저 viewport/keyboard  | NOT RUN  | 로컬 `next start`가 sandbox `uv_interface_addresses` 오류로 중단, 이후 env 로드 서버 기동이 승인 게이트에 차단됨. Browser MCP 탭도 없음 |
| axe-core 4.11.0 페이지 스캔 | NOT RUN  | 패키지는 `node_modules`에 존재하나 실행 중 페이지 DOM에 주입할 브라우저 세션 없음. 신규 a11y runner 설치 금지                           |
| 비회원 10초 제보 중앙값     | NOT RUN  | 실제 폼 조작·사진/위치 준비 환경 없음                                                                                                   |
| `/terms`, `/privacy`        | PASS     | App Router 페이지·LoginPrompt 링크·legal-pages 계약 추가. 배포 재확인 권장                                                              |

## 시나리오 표

| 시나리오         | 390×844 | 768×1024 | 1440×900 | 키보드 | 결과                                                                             |
| ---------------- | ------- | -------- | -------- | ------ | -------------------------------------------------------------------------------- |
| 비회원 목격 제보 | —       | —        | —        | —      | 소스 계약만 (`sighting-form-ux-contract`, `warm-ux-foundation`). 브라우저 미실행 |
| 지도 탐색        | —       | —        | —        | —      | 소스 계약만 (`map-path-and-detail-ui`, `map-remount-contract`). 브라우저 미실행  |
| 확인할 제보      | —       | —        | —        | —      | 소스 계약만 (`recommendation-warm-ux-contract`). 로그인 필요 시나리오 미실행     |
| 내 활동          | —       | —        | —        | —      | 소스 계약만 (`my-activity-ux-contract`). AuthGuard/로그인 경계 브라우저 미실행   |

## 접근성

- heading/landmark 순서: 소스 계약에서 `/`·`/my` 실 `h1`, 로그인 prompt `h1` 확인. 브라우저 landmark 순회는 미실행
- focus 이동 및 focus visible: `dialog-focus-behavior` 단위 테스트 PASS. 실 viewport focus ring 미실행
- 200% zoom/320 CSS px reflow: NOT RUN
- prefers-reduced-motion: NOT RUN
- axe-core 4.11.0 critical/serious 위반 수: NOT MEASURED (페이지 스캔 불가)

## 비회원 제보 능동 입력 시간

| 회차 | 사진 준비 | 위치 준비 | 시작→제출 활성 | 비고               |
| ---: | --------- | --------- | -------------: | ------------------ |
|    1 | —         | —         |              — | 브라우저 세션 없음 |
|    2 | —         | —         |              — |                    |
|    3 | —         | —         |              — |                    |
|    4 | —         | —         |              — |                    |
|    5 | —         | —         |              — |                    |

중앙값: 미측정

## 대체 증거 (계약·정적)

실행 (worktree):

```bash
npm run format:check && npm run typecheck && npm run lint && npm test
# → format PASS, typecheck PASS, lint 0 errors, tests 330/330

npm run build   # 부모 .env.local 필요
npm run test:integration
# → HTTP boundary 8/8
```

핵심 계약 묶음(33/33): `warm-ux-foundation`, `sighting-form-ux-contract`, `map-path-and-detail-ui`, `map-remount-contract`, `recommendation-warm-ux-contract`, `my-activity-ux-contract`.

## 남은 브라우저/운영 승인 항목

1. 배포 URL 또는 승인된 env로 `npm run start` 기동 후 Browser viewport·keyboard·axe 스캔
2. 비회원 제보 5회 타이밍(10초 중앙값)
3. Docker/`psql` 환경에서 migration reset·permission matrix (사용자 승인 후)
4. UX 피드백 배포 확인: 확인 탭 paw, 제보 검증/옵티미스틱, 지도 필터·상세 출처, `/my` 프로필 우선
