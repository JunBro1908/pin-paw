# PinPaw 따뜻한 현장 구조 도구 UX 설계

> 설계 기준일: 2026-08-02  
> 적용 대상: PinPaw 모바일 우선 웹 플랫폼  
> 제품 방향: **현장 구조 도구 70% + 따뜻한 동네 네트워크 30%**  
> 활성 Goal: 기존 초록색 정체성과 기능 일관성을 보존하면서 따뜻하고
> 강아지다운 UX로 개편하고, 비회원 10초 목격 제보·지도 탐색·확인할 제보·사건
> 중심 내정보 흐름의 완성도를 검증 가능한 수준으로 높인다.

## 1. 제품 핵심

PinPaw는 목격된 유실 동물의 발자국에 핀을 꽂아 보호자와의 재회를 돕는
플랫폼이다. 화면에서 가장 중요한 것은 AI 기술의 존재감이 아니라 다음 행동의
속도와 정보에 대한 신뢰다.

```text
목격자: 봤다 → 바로 남긴다
보호자: 등록한다 → 흔적을 확인한다 → 이동 흐름을 좁힌다
시스템: 수집한다 → 보호한다 → 관련 근거를 정리한다
```

### 반드시 보존할 제품 가치

1. `/`에 진입하면 로그인이나 유형 선택 없이 목격 제보를 바로 시작한다.
2. 목격 제보는 한 화면, 한 depth를 유지한다.
3. 사진·위치·시각을 핵심 데이터로 사용하고 위치와 시각은 자동 입력한다.
4. 유실 등록, 정밀 탐색, 핀 저장, 경로 관리는 인증 사용자에게 제공한다.
5. 지도는 `목격`, `유실`, `보호소`를 겹치지 않게 구분한다.
6. 추천은 모델 점수가 아니라 보호자가 판단할 수 있는 근거를 제공한다.
7. 오래된 목격은 기본 탐색에서 약화하거나 archive하지만 보호소 정보는 별도
   생명주기로 유지한다.

## 2. 설계 원칙

### 2.1 빠르게

- 초기 화면에서 사진 선택과 제출 준비 상태를 가장 먼저 렌더링한다.
- 위치와 시각은 백그라운드에서 채우고 현재 상태를 짧은 문장으로 표시한다.
- 선택 입력은 접어 두되 사용자가 필요하면 같은 화면에서 펼칠 수 있어야 한다.
- 제출 중 버튼과 request lifecycle을 고정해 중복 요청을 막고, 실패 시 명시적
  재시도 버튼을 제공한다.

### 2.2 불안하지 않게

- 캐시된 정보를 즉시 유지하고 갱신 상태는 작은 status line으로 알린다.
- `마지막 확인 2분 전`처럼 최신성을 명확하게 표시한다.
- 오류가 발생해도 입력값과 현재 지도 핀을 지우지 않는다.
- 보호자 화면은 계정 정보보다 현재 진행 중인 유실 사건과 다음 행동을 먼저
  보여준다.

### 2.3 안전하게

- 비회원에게는 마스킹된 위치와 필요한 최소 정보만 제공한다.
- 정밀 위치는 검증된 인증·인가 경계를 통과한 관계에만 제공한다.
- 사진, 위치, 자유 서술을 불필요하게 로그나 분석 이벤트에 포함하지 않는다.
- 강한 확신을 암시하는 AI 표현과 오탐을 사실처럼 보이게 하는 점수는 사용하지
  않는다.

### 2.4 따뜻하지만 장난스럽지 않게

- 따뜻함은 cream 배경, 실제 동물 사진, 부드러운 문장과 발자국 디테일로 만든다.
- emoji, 과장된 mascot, 반짝이는 gradient, glass card를 브랜드 수단으로 쓰지
  않는다.
- 긴급 상황을 가볍게 만들 수 있는 귀여운 말투나 축하 animation을 사용하지
  않는다.
- 강아지 느낌은 발자국, 산책 경로, 목줄 tag 같은 실제 경험의 은유로 제한한다.

## 3. 사용자와 핵심 흐름

### 3.1 목격자

전제: 로그인하지 않은 모바일 사용자가 길에서 동물을 본 직후 접속한다.

```text
/ 진입
  → 사진 촬영 또는 앨범 선택
  → 자동 위치·현재 시각 확인
  → 필요한 경우 위치 수정
  → 선택 특징 tag
  → 제보 등록
  → 지도 반영 안내
```

완료 목표:

- 위치 권한 허용·사진 준비 상태에서 능동 입력 시간 중앙값 10초 이하
- 일반 4G 조건에서 제출 응답 포함 p75 15초 이하
- 로그인, 회원가입, 별도 완료 페이지를 필수 흐름에 넣지 않음

### 3.2 보호자

```text
로그인
  → 유실 동물 등록
  → 사건 홈에서 최신 상태 확인
  → 지도에서 목격·보호소 탐색
  → 확인할 제보에서 근거 검토
  → 관련 핀 저장
  → 시간순 이동 흔적 확인
  → 찾음/마감과 후속 처리
```

### 3.3 정보 노출 단계

| 사용자           | 지도                  | 상세                         | 행동              |
| ---------------- | --------------------- | ---------------------------- | ----------------- |
| 비회원           | 마스킹 cluster와 유형 | 최소 사진·대략 시간          | 목격 제보         |
| 일반 회원        | 정책상 허용된 pin     | 비차단 공개 범위             | 확인·신고·차단    |
| 유실 사건 보호자 | 사건 관련 정밀 흔적   | 추천 근거와 허용된 정밀 정보 | 핀 저장·경로 관리 |
| 관리자           | 업무에 필요한 범위    | moderation 정보와 audit      | 숨김·복구·처리    |

## 4. 정보 구조

현재 route는 유지하고 탐색 label과 정보 우선순위만 정리한다.

| Route        | 탭 label  | 사용자의 질문                        | 첫 화면의 답                     |
| ------------ | --------- | ------------------------------------ | -------------------------------- |
| `/`          | `제보`    | 방금 본 동물을 어떻게 알리지?        | 사진 선택과 자동 위치·시각       |
| `/map`       | `지도`    | 주변에 어떤 흔적이 있지?             | 현재 viewport의 목격·유실·보호소 |
| `/recommend` | `확인`    | 내 반려동물과 관련 있을 만한 제보는? | 근거가 있는 우선 확인 목록       |
| `/my`        | `내 활동` | 지금 진행 중인 사건과 다음 행동은?   | 활성 유실 사건과 최신 변화       |

`/` 상단이나 제출 영역 아래에 `반려동물을 잃어버렸나요? 유실 등록하기`를
보조 링크로 제공한다. 이 링크가 사진 선택보다 시각적으로 강해져서는 안 된다.

## 5. 색상 체계

### 5.1 원칙

- 기존 `#03C75A` 초록 정체성을 `Pin Green`으로 보존한다.
- 흰 글자가 필요한 주요 버튼은 접근 가능한 짙은 `Action Green`을 사용한다.
- 따뜻함은 cream·sand·apricot에서 만들고, 상태의 의미를 초록 하나로 표현하지
  않는다.
- 색만으로 `목격`, `유실`, `보호소`, 성공·오류를 구분하지 않고 icon과 text
  label을 함께 쓴다.

### 5.2 Light tokens

| Token                    | 값        | 용도                                |
| ------------------------ | --------- | ----------------------------------- |
| `--brand-pin`            | `#03C75A` | logo, 발자국, 지도 pin accent       |
| `--action-primary`       | `#087A3E` | 주요 버튼, active navigation, focus |
| `--action-primary-hover` | `#066532` | 주요 버튼 hover/pressed             |
| `--background-warm`      | `#FFF9F1` | 앱 기본 배경                        |
| `--surface`              | `#FFFFFF` | form, sheet, 핵심 content surface   |
| `--surface-soft`         | `#F7F0E7` | 선택 영역, 보조 그룹                |
| `--text-main`            | `#2B251F` | 제목과 본문                         |
| `--text-sub`             | `#655B52` | 보조 설명                           |
| `--text-caption`         | `#74695F` | 시간·최신성·caption                 |
| `--border-subtle`        | `#E7DCCF` | divider와 input border              |
| `--accent-warm`          | `#F2A65A` | 발자국 highlight, 따뜻한 주의 강조  |
| `--accent-warm-text`     | `#9A4E11` | cream 위 warm label text            |
| `--status-lost`          | `#B85C1B` | 유실 label과 pin                    |
| `--status-shelter`       | `#28736F` | 보호소 label과 pin                  |
| `--status-danger`        | `#B93C38` | 오류, 위험, 삭제                    |

검증한 주요 조합:

- 흰색 / `Action Green`: 5.44:1
- `Text Main` / `Background Warm`: 14.47:1
- `Text Sub` / `Background Warm`: 6.33:1
- 흰색 / `Lost`: 4.58:1
- 흰색 / `Shelter`: 5.57:1
- 흰색 / `Danger`: 5.58:1

### 5.3 Dark tokens

| Token                 | 값        | 용도                   |
| --------------------- | --------- | ---------------------- |
| `--background-warm`   | `#171411` | 앱 배경                |
| `--surface`           | `#211D19` | card와 sheet           |
| `--surface-soft`      | `#2B2621` | 보조 그룹              |
| `--text-main`         | `#F7EFE6` | 제목과 본문            |
| `--text-sub`          | `#CBBFB2` | 보조 설명              |
| `--border-subtle`     | `#3A332D` | divider와 input border |
| `--action-primary`    | `#45DB8A` | 주요 action surface    |
| `--action-on-primary` | `#171411` | primary 위 text/icon   |

dark mode도 cream 계열의 따뜻함을 유지하며 순수 검정과 순수 흰색 대비를 피한다.

## 6. Typography와 형태

### 6.1 Font

첫 구현에서는 외부 다운로드가 없는 다음 system stack을 사용한다.

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR",
  "Malgun Gothic", sans-serif;
```

| 역할         | 크기/행간 |    굵기 |
| ------------ | --------- | ------: |
| 화면 제목    | 24/32px   |     700 |
| section 제목 | 20/28px   |     700 |
| 강조 본문    | 17/26px   |     600 |
| 본문         | 16/24px   |     400 |
| 보조         | 14/20px   | 400~600 |
| metadata     | 13/18px   |     500 |

12px 이하는 좁은 지도 badge에만 허용한다. `Text`의 title variant도 실제 heading
element를 선택할 수 있어야 한다.

### 6.2 Spacing·radius·shadow

- spacing: `4, 8, 12, 16, 24, 32, 48px`
- input/button radius: `10px`
- content card radius: `12px`
- bottom sheet radius: 상단 `20px`
- pill: status와 filter chip에만 사용
- shadow: floating map control, modal, bottom sheet에만 사용
- 일반 list item은 border 또는 divider를 사용하고 shadow를 사용하지 않음

## 7. Icon과 이미지

- 탭 emoji는 24px outline SVG icon으로 교체한다.
- stroke는 1.75px, round cap/join을 공통으로 사용한다.
- `제보=카메라+pin`, `지도=접힌 지도`, `확인=발자국`, `내 활동=목줄 tag`
  모티프를 사용한다.
- 실제 동물 사진을 정보의 중심에 두며 AI 생성 강아지 이미지나 3D mascot을
  UI 장식으로 사용하지 않는다.
- 빈 사진은 emoji 대신 중립적인 camera/paw placeholder icon을 사용한다.
- 발자국은 loading step, 이동 경로, 작은 section divider처럼 의미가 있는 곳에만
  사용한다.

## 8. 화면 설계

### 8.1 `/` — 10초 목격 제보

화면 순서:

1. 작은 PinPaw wordmark와 `방금 보셨나요? 사진 한 장이면 충분해요.`
2. camera-first 사진 선택 surface
3. 자동 정보 status row
   - `현재 위치 확인됨 · 서울시 …`
   - `방금`
   - 위치 수정 action
4. `특징을 더 알려주기` disclosure
   - 색상, 크기, 종, 핵심 tag, 추가 설명
5. sticky `이 위치로 제보하기`
6. 보조 link `반려동물을 잃어버렸나요? 유실 등록하기`

세부 규칙:

- raw 위·경도 숫자를 기본 UI에 표시하지 않는다.
- 사진 영역은 전체 화면을 차지하는 정사각형 대신 camera action을 먼저 보여주는
  4:3 또는 높이 제한 surface로 사용한다.
- 파일 선택 영역은 native label/input 관계와 키보드 동작을 제공한다.
- 위치 권한 거절 시 `지도에서 위치 고르기`를 같은 자리의 회복 action으로 준다.
- 선택 특징 때문에 제출이 차단되지 않는다.
- 제출 완료 후 짧은 확인 메시지와 `지도에서 확인` action을 제공하되 별도 완료
  페이지를 필수로 거치지 않는다.

### 8.2 `/map` — 흔적 지도

지도 위계:

1. 상단: 장소/주소 검색과 마지막 갱신 시간
2. 그 아래: `목격`, `유실`, `보호소` filter chip
3. 지도: zoom별 cluster → pin → detail
4. 하단: 선택한 항목 하나만 표시하는 bottom sheet
5. 우측 하단: 현재 위치와 목록 보기만 유지

유형 표현:

| 유형   | 색           | 모양          | 생명주기                   |
| ------ | ------------ | ------------- | -------------------------- |
| 목격   | Pin Green    | 발자국 pin    | 최신성에 따라 약화·archive |
| 유실   | Lost Orange  | 목줄 tag pin  | 사건 상태가 종료될 때까지  |
| 보호소 | Shelter Teal | 집/보호소 pin | 보호 상태가 유효한 동안    |

현재의 설명용 glass card는 제거하고, 지도 사용법은 첫 진입 1회 또는 빈 상태에서만
보여준다. layer selector의 기능은 filter chip과 사건 context로 나눠 노출한다.

### 8.3 `/recommend` — 확인할 제보

화면 용어:

- 탭: `추천` → `확인`
- 제목: `추천 제보` → `확인할 제보`
- `유사도 92.3%` → `우선 확인`, `확인 필요`

카드 정보 순서:

1. 사진
2. `3시간 전 · 마지막 위치에서 1.2km`
3. 근거 chip: `갈색 털`, `중형`, `빨간 목줄`
4. 차이 또는 불확실성: `견종 정보 없음`
5. `지도에서 보기`, `이동 흔적에 추가`, `관련 없음`

반경·기간은 `탐색 범위` disclosure로 이동한다. 결과 개수 `topK`는 UI에서
제거하고 pagination/더 보기로 처리한다. 추천 계산 상세는 필요 시 `왜 이 제보가
보이나요?`에서 짧게 설명한다.

### 8.4 `/my` — 사건 중심 내 활동

첫 화면 순서:

1. 활성 유실 사건 card
   - 사진, 이름, 상태, 경과 시간, 마지막 새 제보
2. 다음 행동
   - `새 제보 3건 확인`
   - `지도에서 이동 흔적 보기`
   - `찾음으로 상태 변경`
3. 내 목격 제보
4. 알림과 계정 설정

일반 profile card와 빈 avatar는 첫 화면에서 제거하거나 하단 설정으로 이동한다.
여러 사건이 있으면 사건 switcher를 제공하고, 선택한 사건 context를 지도와 확인
탭까지 유지한다.

### 8.5 로그인

- 로그인 자체보다 로그인 후 얻는 행동을 제목으로 설명한다.
- 예: `유실 동물을 등록하고 제보를 계속 확인하세요.`
- `동의하는 것으로 간주됩니다` 문구는 제거한다.
- 이용약관·개인정보 처리방침 link와 실제 동의 정책을 명시한다.
- 비회원 목격 제보에는 로그인 prompt를 삽입하지 않는다.

## 9. 상태와 문장

### 9.1 Tone of voice

- 짧고 구체적이며 사용자를 탓하지 않는다.
- 긴급 상황에서도 느낌표를 반복하지 않는다.
- `성공적으로 처리되었습니다`보다 다음 행동을 알려준다.

| 상황          | 문장                                                          |
| ------------- | ------------------------------------------------------------- |
| 위치 확인     | `현재 위치를 확인했어요.`                                     |
| 위치 실패     | `위치를 확인하지 못했어요. 지도에서 직접 골라주세요.`         |
| 제출 중       | `사진과 위치를 안전하게 등록하고 있어요.`                     |
| 제출 완료     | `제보가 지도에 등록됐어요.`                                   |
| cached data   | `2분 전 정보 · 최신 내용 확인 중`                             |
| empty match   | `아직 확인할 제보가 없어요. 새 제보가 들어오면 알려드릴게요.` |
| 보호소 데이터 | `보호소에서 제공한 정보예요.`                                 |

### 9.2 AI 표현 원칙

- `AI`, `모델`, `정확도`, 소수점 score를 기본 화면에서 사용하지 않는다.
- `일치`라고 단정하지 않고 `관련 가능성`, `확인 근거`를 사용한다.
- 근거가 부족하면 부족한 필드를 그대로 알린다.
- 사용자가 `관련 없음`을 선택해도 잘못 판단했다고 비난하지 않는다.
- 결과의 최종 판단은 보호자에게 있음을 상세 설명에 명시한다.

## 10. Loading·오류·offline

- 지도와 목록은 stale data를 유지한 채 상단 status만 `업데이트 중`으로 바꾼다.
- 새 요청이 실패하면 기존 data를 지우지 않고 `다시 확인` action을 제공한다.
- 제보 draft는 사진을 제외한 입력을 현재 session 동안 복구할 수 있어야 한다.
- upload 실패와 domain 저장 실패를 구분해 안전한 재시도 경로를 제공한다.
- 같은 요청은 기존 idempotency key와 upload intent를 재사용한다.
- 네트워크가 offline이면 제출을 반복하지 않고 연결 복귀 후 사용자가 재시도한다.

## 11. 접근성과 mobile 기준

- WCAG 2.2 AA를 출시 기준으로 사용한다.
- 모든 화면에는 실제 `h1` 하나와 논리적인 heading 순서가 있어야 한다.
- icon-only button은 접근 가능한 이름과 44×44px 이상 touch target을 갖는다.
- 모든 form control은 visible label 또는 동등한 programmatic label을 갖는다.
- bottom sheet/modal은 focus trap, Escape, focus return, `aria-modal`을 제공한다.
- 일반 loading·submission 진행 상태는 `role="status"`와 `aria-live="polite"`,
  즉시 조치가 필요한 실패 toast는 `role="alert"`로 전달한다.
- 지도만으로 제공되는 정보는 목록으로도 접근할 수 있어야 한다.
- 검증 viewport는 360×800, 390×844, 430×932와 768px 이상 desktop이다.

## 12. 기술 경계

기존 route와 API 계약은 유지하고 표현 계층을 점진적으로 교체한다.

### Design foundation

- `src/app/globals.css`: light/dark semantic tokens와 system font
- `src/shared/ui/Text.tsx`: semantic element 선택과 typography scale
- `src/shared/ui/Button.tsx`: primary/secondary/quiet/danger 상태
- `src/shared/ui/Icon.tsx`: 공통 SVG icon contract
- `src/shared/ui/Surface.tsx`: card 남용을 막는 제한된 surface variant
- `src/app/(tabs)/layout.tsx`: 새 label과 icon navigation

### Flow units

- `SightingForm`: photo action, auto-info status, optional disclosure, submission
- `NaverMap`: search/filter/status/UI shell
- map data hook·adapter·renderer: 기존 분리 경계를 유지
- `RecommendationCard`: 근거, 최신성, 거리, 불확실성, action
- `/my`: 사건 summary와 next-action composition

1,627줄의 `NaverMap.tsx`에 새 표현 로직을 계속 추가하지 않는다. 기존 domain,
data hook, adapter, renderer에 이어 search bar, filter bar, status line, selected item
sheet도 독립된 UI unit으로 분리한다.

## 13. 측정과 검증

### 사용자 목표

| 지표                               |                 목표 |
| ---------------------------------- | -------------------: |
| 목격 제보 능동 입력 시간 중앙값    |            10초 이하 |
| 일반 4G 제출 완료 p75              |            15초 이하 |
| 제보 필수 흐름 depth               |                    1 |
| 비회원 제보 중 로그인 요구         |                  0회 |
| 보호자가 추천 근거를 이해하는 비율 | 사용성 평가 80% 이상 |
| raw 위·경도 기본 노출              |                  0곳 |

### 품질 목표

- lint error/warning 0, format check 통과
- unit·contract test와 typecheck·production build 통과
- axe critical/serious 0
- 핵심 흐름 keyboard-only 완료
- 360px viewport에서 가로 overflow 0
- map pan/zoom 장시간 검증에서 overlay와 cache가 계속 증가하지 않음
- API/Storage 장애 주입 후 draft와 기존 지도 data가 유지됨
- production build에 remote font 다운로드 없음

## 14. 범위

### 포함

- semantic color·typography·spacing·radius·icon 체계
- 4개 주요 탭의 정보 구조와 copy
- 비회원 한 화면 목격 제보
- 지도 filter·상태·detail 위계
- 설명 가능한 확인할 제보
- 사건 중심 내 활동
- loading/error/offline/accessibility
- 브라우저·사용성·성능 검증 기준

### 제외

- 추천 수식과 embedding model 자체 변경
- 새로운 native app 개발
- 사람 실종 도메인으로의 확장
- mascot·3D illustration·AI 생성 이미지 제작
- route/API의 전면 재설계

## 15. Goal 실행 구조

현재 활성 Goal은 아래 milestone을 순서대로 완료한다. 각 milestone은 별도 검증
증거 없이 완료 처리하지 않는다.

| Milestone        | 결과                               | 종료 증거                                   |
| ---------------- | ---------------------------------- | ------------------------------------------- |
| UX-0 기준선      | 현재 화면·copy·접근성·시간 기준선  | screenshot, flow time, 문제 목록            |
| UX-1 Foundation  | token, typography, icon, primitive | Story/fixture viewport, contrast, unit test |
| UX-2 10초 제보   | `/`의 한 화면 비회원 제보          | mobile E2E, 시간 측정, 장애 재시도          |
| UX-3 흔적 지도   | 유형 filter와 단일 detail 위계     | Naver SDK browser regression, memory check  |
| UX-4 확인할 제보 | 근거·거리·최신성 중심 결과         | comprehension test, API/UI contract         |
| UX-5 내 활동     | 사건 중심 dashboard                | 로그인·사건 전환 E2E                        |
| UX-6 출시 검증   | 접근성·성능·회귀·문서              | 전체 release gate와 사용자 승인             |

### 전체 완료 조건

1. UX-0~UX-6의 종료 증거가 모두 저장돼 있다.
2. 비회원 10초 제보 원칙과 위치 privacy 경계가 회귀하지 않는다.
3. 네 주요 화면에서 emoji navigation, 소수점 유사도, raw 좌표, 과도한 card
   shadow가 제거된다.
4. light/dark와 상태 색상이 semantic token만 사용한다.
5. lint, format, typecheck, test, build와 핵심 모바일 브라우저 검증이 통과한다.
6. 최종 화면을 사용자가 검토하고 승인한다.
