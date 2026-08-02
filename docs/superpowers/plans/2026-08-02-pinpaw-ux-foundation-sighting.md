# PinPaw UX Foundation and Sighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Pin Green 정체성을 보존한 따뜻한 디자인 기반을 만들고, 비회원이 한 화면에서 10초 안에 목격 제보를 준비할 수 있는 흐름으로 개편한다.

**Architecture:** 전역 의미 토큰과 작은 UI primitive를 먼저 고정한 뒤 탭 탐색과 제보 화면이 같은 계약을 소비하게 한다. `SightingForm`의 네트워크·idempotency 수명주기는 유지하고, 시간/위치 표시 및 선택 입력 UI만 순수 helper와 작은 컴포넌트로 분리해 회귀 위험을 낮춘다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Node.js 22 test runner, Supabase client

## Global Constraints

- 기존 브랜드 초록 `#03C75A`는 `--brand-pin`으로 보존한다.
- 흰 글자의 주요 버튼은 `#087A3E`, hover/pressed는 `#066532`를 사용한다.
- 기본 배경은 `#FFF9F1`, 본문은 `#2B251F`, 경계선은 `#E7DCCF`를 사용한다.
- 외부 font, icon, component package를 추가하지 않는다.
- `/`는 로그인 없이 접근하며 한 화면·한 depth를 유지한다.
- 사진·위치·시각은 핵심 정보이고 위치와 시각은 자동 입력한다.
- 원시 위도·경도, emoji 탐색 icon, AI mascot, glass effect, 장식용 gradient를 노출하지 않는다.
- 모든 interactive target은 최소 `44px × 44px`, keyboard focus가 보이고 WCAG 2.2 AA를 만족해야 한다.
- 기존 upload intent와 idempotency key 재사용 수명주기를 변경하지 않는다.
- dependency 설치와 외부 registry 접근은 사용자 승인 전에는 실행하지 않는다.

---

## File Structure

- `src/app/globals.css`: light/dark 의미 토큰, typography, focus의 단일 출처.
- `src/shared/ui/Icon.tsx`: 네 개 탭과 공용 상태에 쓰는 24px outline SVG.
- `src/shared/ui/Text.tsx`: 실제 heading element를 선택할 수 있는 typography primitive.
- `src/shared/ui/Button.tsx`: primary/secondary/danger 상태와 44px hit area.
- `src/app/(tabs)/layout.tsx`: `제보/지도/확인/내 활동` 하단 탐색.
- `src/features/sightings/lib/sighting-form-presentation.ts`: 현지 시각과 좌표 비노출 상태 문구를 만드는 순수 함수.
- `src/features/sightings/components/SightingEssentials.tsx`: 사진·위치·시각 핵심 입력.
- `src/features/sightings/components/SightingOptionalDetails.tsx`: 같은 화면 안에서 펼치는 선택 특징.
- `src/features/sightings/components/SightingForm.tsx`: 기존 submission orchestration과 새 presentation 조립.
- `tests/unit/warm-ux-foundation.test.mjs`: 토큰, icon, navigation, heading 계약.
- `tests/unit/sighting-form-presentation.test.mjs`: 현지 시간과 위치 상태 함수 동작.
- `tests/unit/sighting-form-ux-contract.test.mjs`: 한 화면 흐름과 민감 좌표 비노출 계약.

### Task 1: Semantic tokens and accessible primitives

**Files:**

- Modify: `src/app/globals.css`
- Create: `src/shared/ui/Icon.tsx`
- Modify: `src/shared/ui/Text.tsx`
- Modify: `src/shared/ui/Button.tsx`
- Create: `tests/unit/warm-ux-foundation.test.mjs`

**Interfaces:**

- Consumes: 기존 `cn` class 결합 helper(`ClassValue[]` 입력, `string` 반환).
- Produces: `Icon({ name, size?, className? })`, `IconName = "report" | "map" | "check" | "activity" | "camera" | "location" | "clock" | "paw"`; `Text`의 `as?: "p" | "span" | "h1" | "h2" | "h3"`; CSS 의미 토큰.

- [ ] **Step 1: Write the failing contract test**

```js
// tests/unit/warm-ux-foundation.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("warm semantic tokens and dark overrides are defined", async () => {
  const css = await read("src/app/globals.css");
  for (const value of [
    "--brand-pin: #03c75a",
    "--action-primary: #087a3e",
    "--background-warm: #fff9f1",
    "--text-main: #2b251f",
    "--border-subtle: #e7dccf",
  ])
    assert.match(css.toLowerCase(), new RegExp(value));
  assert.match(css, /prefers-color-scheme:\s*dark/);
});

test("icons are local SVGs and Text supports real headings", async () => {
  const [icon, text] = await Promise.all([
    read("src/shared/ui/Icon.tsx"),
    read("src/shared/ui/Text.tsx"),
  ]);
  assert.match(icon, /export type IconName/);
  assert.match(icon, /<svg/);
  assert.doesNotMatch(icon, /🏠|🗺️|⭐|👤/u);
  assert.match(text, /as\?:\s*"p"\s*\|\s*"span"\s*\|\s*"h1"/);
});

test("buttons expose 44px target and primary action token", async () => {
  const button = await read("src/shared/ui/Button.tsx");
  assert.match(button, /min-h-11/);
  assert.match(button, /bg-action-primary/);
  assert.match(button, /focus-visible/);
});
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `node --test tests/unit/warm-ux-foundation.test.mjs`

Expected: FAIL because `Icon.tsx`, the new tokens, and the `Text.as` contract do not exist.

- [ ] **Step 3: Implement the token and primitive contracts**

Use this exact token set in `:root` and override the surface/text/action values inside the existing dark media query:

```css
:root {
  --brand-pin: #03c75a;
  --action-primary: #087a3e;
  --action-primary-hover: #066532;
  --action-on-primary: #ffffff;
  --background-warm: #fff9f1;
  --surface: #ffffff;
  --surface-soft: #f7f0e7;
  --text-main: #2b251f;
  --text-sub: #655b52;
  --text-caption: #74695f;
  --border-subtle: #e7dccf;
  --accent-warm: #f2a65a;
  --accent-warm-text: #9a4e11;
  --status-lost: #b85c1b;
  --status-shelter: #28736f;
  --status-danger: #b93c38;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background-warm: #171411;
    --surface: #211d19;
    --surface-soft: #2b2621;
    --text-main: #f7efe6;
    --text-sub: #cbbfb2;
    --text-caption: #b8aa9c;
    --border-subtle: #3a332d;
    --action-primary: #45db8a;
    --action-primary-hover: #63e49b;
    --action-on-primary: #171411;
  }
}
```

Implement `Icon` as a typed switch returning inline SVG paths with `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.8}`, `aria-hidden="true"`, and `focusable="false"`. Update `Text` to render `const Component = as` with default `p`. Update `Button` base classes to `min-h-11 rounded-xl px-4` and primary classes to `bg-action-primary text-action-on-primary hover:bg-action-primary-hover`.

- [ ] **Step 4: Run focused and existing primitive tests**

Run: `node --test tests/unit/warm-ux-foundation.test.mjs tests/unit/a11y-primitives.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the foundation**

```bash
git add src/app/globals.css src/shared/ui/Icon.tsx src/shared/ui/Text.tsx src/shared/ui/Button.tsx tests/unit/warm-ux-foundation.test.mjs
git commit -m "feat: add warm accessible ux foundation"
```

### Task 2: Consistent bottom navigation and home hierarchy

**Files:**

- Modify: `src/app/(tabs)/layout.tsx`
- Modify: `src/app/(tabs)/page.tsx`
- Modify: `tests/unit/warm-ux-foundation.test.mjs`

**Interfaces:**

- Consumes: `IconName` and `Icon` from Task 1; `Text.as` from Task 1.
- Produces: `tabs: ReadonlyArray<{ href: string; label: string; icon: IconName }>` with stable route labels.

- [ ] **Step 1: Extend the failing navigation test**

```js
test("bottom navigation uses product labels and outline icons", async () => {
  const layout = await read("src/app/(tabs)/layout.tsx");
  for (const label of ["제보", "지도", "확인", "내 활동"])
    assert.match(layout, new RegExp(`label: "${label}"`));
  assert.match(layout, /<Icon name=\{tab\.icon\}/);
  assert.match(layout, /aria-current=\{isActive \? "page"/);
  assert.doesNotMatch(layout, /🏠|🗺️|⭐|👤|text-blue/u);
});

test("home has a real h1 and secondary lost-registration link", async () => {
  const page = await read("src/app/(tabs)/page.tsx");
  assert.match(page, /<Text[^>]+as="h1"/);
  assert.match(page, /반려동물을 잃어버렸나요\?/);
  assert.match(page, /href="\/my\/lost-posts\/new"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/unit/warm-ux-foundation.test.mjs`

Expected: FAIL on the old `홈/추천/내정보`, emoji, blue active state, and paragraph title.

- [ ] **Step 3: Replace the navigation and home hierarchy**

Use this exact navigation model:

```ts
const tabs: ReadonlyArray<{
  href: string;
  label: string;
  icon: IconName;
}> = [
  { href: "/", label: "제보", icon: "report" },
  { href: "/map", label: "지도", icon: "map" },
  { href: "/recommend", label: "확인", icon: "check" },
  { href: "/my", label: "내 활동", icon: "activity" },
];
```

Render `<Icon name={tab.icon} size={24} />`, apply `min-h-14 min-w-14`, and replace blue states with `text-action-primary` and neutral `text-text-caption`. In the home header render `Text as="h1" variant="title"` with the copy `방금 본 동물을 알려주세요`. Add a secondary text link after `SightingForm`: `반려동물을 잃어버렸나요? 유실 등록하기` → `/my/lost-posts/new`.

- [ ] **Step 4: Run the navigation contract tests**

Run: `node --test tests/unit/warm-ux-foundation.test.mjs tests/unit/a11y-primitives.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit navigation**

```bash
git add 'src/app/(tabs)/layout.tsx' 'src/app/(tabs)/page.tsx' tests/unit/warm-ux-foundation.test.mjs
git commit -m "feat: align navigation with rescue workflow"
```

### Task 3: Pure presentation helpers for time and safe location status

**Files:**

- Create: `src/features/sightings/lib/sighting-form-presentation.ts`
- Create: `tests/unit/sighting-form-presentation.test.mjs`
- Modify: `tests/unit/form-submission-lifecycle.test.mjs`

**Interfaces:**

- Produces: `toLocalDateTimeInputValue(date: Date): string`; `formatSightingLocationStatus(status: "locating" | "ready" | "denied" | "error"): string`.
- Consumes: no browser global; both functions remain deterministic with supplied `Date` or enum.

- [ ] **Step 1: Write failing behavior tests**

```js
// tests/unit/sighting-form-presentation.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSightingLocationStatus,
  toLocalDateTimeInputValue,
} from "../../src/features/sightings/lib/sighting-form-presentation.ts";

test("formats datetime-local in the supplied Date local timezone", () => {
  const date = new Date(2026, 7, 2, 9, 5, 0);
  assert.equal(toLocalDateTimeInputValue(date), "2026-08-02T09:05");
});

test("location status never exposes coordinates", () => {
  assert.equal(
    formatSightingLocationStatus("locating"),
    "현재 위치를 확인하고 있어요"
  );
  assert.equal(
    formatSightingLocationStatus("ready"),
    "현재 위치가 입력되었어요"
  );
  assert.equal(
    formatSightingLocationStatus("denied"),
    "위치 권한을 허용하거나 지도에서 선택해 주세요"
  );
  assert.equal(
    formatSightingLocationStatus("error"),
    "위치를 확인하지 못했어요. 지도에서 선택해 주세요"
  );
});
```

- [ ] **Step 2: Run and verify module-not-found failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/sighting-form-presentation.test.mjs`

Expected: FAIL because `sighting-form-presentation.ts` does not exist.

- [ ] **Step 3: Implement both pure functions**

```ts
export type SightingLocationStatus = "locating" | "ready" | "denied" | "error";

const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalDateTimeInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatSightingLocationStatus(
  status: SightingLocationStatus
): string {
  return {
    locating: "현재 위치를 확인하고 있어요",
    ready: "현재 위치가 입력되었어요",
    denied: "위치 권한을 허용하거나 지도에서 선택해 주세요",
    error: "위치를 확인하지 못했어요. 지도에서 선택해 주세요",
  }[status];
}
```

Add a source assertion to `form-submission-lifecycle.test.mjs` that `SightingForm.tsx` no longer calls `new Date().toISOString().slice(0, 16)` after Task 4 integrates this helper.

- [ ] **Step 4: Run the helper tests**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/sighting-form-presentation.test.mjs`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit presentation helpers**

```bash
git add src/features/sightings/lib/sighting-form-presentation.ts tests/unit/sighting-form-presentation.test.mjs tests/unit/form-submission-lifecycle.test.mjs
git commit -m "test: define safe sighting presentation rules"
```

### Task 4: One-screen sighting form composition

**Files:**

- Create: `src/features/sightings/components/SightingEssentials.tsx`
- Create: `src/features/sightings/components/SightingOptionalDetails.tsx`
- Modify: `src/features/sightings/components/SightingForm.tsx`
- Create: `tests/unit/sighting-form-ux-contract.test.mjs`

**Interfaces:**

- Consumes: `Icon`; `toLocalDateTimeInputValue`; `formatSightingLocationStatus`; existing `LocationPicker`; existing form submission callbacks and upload intent refs.
- Produces: `SightingEssentialsProps` carrying photo preview, location state, occurred-at value and callbacks; `SightingOptionalDetailsProps` carrying trait values and callbacks.

- [ ] **Step 1: Write the failing sighting UX contract**

```js
// tests/unit/sighting-form-ux-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sighting form separates essentials from optional details", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  assert.match(form, /<SightingEssentials/);
  assert.match(form, /<SightingOptionalDetails/);
  assert.match(form, /toLocalDateTimeInputValue/);
  assert.doesNotMatch(form, /lat\.toFixed|lng\.toFixed|🐾/u);
});

test("photo control is semantic and optional section stays in-page", async () => {
  const [essentials, optional] = await Promise.all([
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);
  assert.match(essentials, /<label[^>]+htmlFor="sighting-photo"/);
  assert.match(essentials, /id="sighting-photo"/);
  assert.match(essentials, /aria-live="polite"/);
  assert.match(optional, /<details/);
  assert.match(optional, /특징을 더 알려주기 \(선택\)/);
});
```

- [ ] **Step 2: Run and verify the missing-component failure**

Run: `node --test tests/unit/sighting-form-ux-contract.test.mjs`

Expected: FAIL because both components are absent and raw coordinates/emoji remain.

- [ ] **Step 3: Extract presentation while preserving submission state**

Define the essential props exactly:

```ts
export interface SightingEssentialsProps {
  photoUrl: string | null;
  occurredAt: string;
  locationStatus: SightingLocationStatus;
  disabled: boolean;
  onPhotoChange(file: File | null): void;
  onOccurredAtChange(value: string): void;
  onOpenLocationPicker(): void;
}
```

`SightingEssentials` renders, in order: `사진 추가` semantic file input/label, location status with `aria-live="polite"`, `위치 수정` button, and `목격 시각` datetime-local input. `SightingOptionalDetails` uses native `<details>` with summary `특징을 더 알려주기 (선택)` and moves the existing species, size, color, breed, tag, and note controls without renaming submitted fields.

In `SightingForm`, derive status as `lat !== null && lng !== null ? "ready" : geolocationErrorKind`, initialize and reset time with `toLocalDateTimeInputValue(new Date())`, and keep these existing objects/functions in the parent unchanged: upload intent ref, request fingerprint ref, idempotency key ref, `handleSubmit`, and submit retry behavior. Replace coordinate text with `formatSightingLocationStatus(locationStatus)`.

- [ ] **Step 4: Run sighting regression tests**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/sighting-form-ux-contract.test.mjs tests/unit/sighting-form-presentation.test.mjs tests/unit/form-submission-lifecycle.test.mjs tests/unit/upload-intents.test.mjs`

Expected: all tests PASS and submission lifecycle assertions remain unchanged.

- [ ] **Step 5: Commit the form refactor**

```bash
git add src/features/sightings/components/SightingEssentials.tsx src/features/sightings/components/SightingOptionalDetails.tsx src/features/sightings/components/SightingForm.tsx tests/unit/sighting-form-ux-contract.test.mjs
git commit -m "feat: streamline anonymous sighting report"
```

### Task 5: Foundation verification checkpoint

**Files:**

- Modify: `docs/PROJECT_STATUS_KO.md`

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces: reproducible UX foundation evidence in the current project status.

- [ ] **Step 1: Add the verification checklist before running it**

Add this exact subsection under the current UX progress section:

```markdown
### 따뜻한 UX 기반 검증

- [ ] 의미 색상 토큰 및 dark mode
- [ ] emoji 없는 4개 하단 탐색
- [ ] 비회원 한 화면 제보와 원시 좌표 비노출
- [ ] 기존 upload intent/idempotency 회귀 없음
- [ ] typecheck, lint, unit test, production build 통과
```

- [ ] **Step 2: Run the complete local gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: all commands exit 0. If lint exposes the pre-existing `AuthFeedbackBanner` or `NaverMap` findings, stop this checkpoint and resolve them in the release plan; do not mark the checklist complete.

- [ ] **Step 3: Record actual evidence only**

For each successful item change `[ ]` to `[x]` and append the exact test count printed by `npm test` plus the build timestamp in Asia/Seoul. Leave any failing item unchecked and paste its command and first actionable error below the checklist.

- [ ] **Step 4: Re-run changed-file formatting and contracts**

Run: `npx prettier --check src/app/globals.css 'src/app/(tabs)/layout.tsx' 'src/app/(tabs)/page.tsx' src/shared/ui/Icon.tsx src/shared/ui/Text.tsx src/shared/ui/Button.tsx src/features/sightings tests/unit/warm-ux-foundation.test.mjs tests/unit/sighting-form-presentation.test.mjs tests/unit/sighting-form-ux-contract.test.mjs docs/PROJECT_STATUS_KO.md`

Expected: exit 0 without formatting the unrelated 91-file baseline.

- [ ] **Step 5: Commit verification evidence**

```bash
git add docs/PROJECT_STATUS_KO.md
git commit -m "docs: record sighting ux verification"
```
