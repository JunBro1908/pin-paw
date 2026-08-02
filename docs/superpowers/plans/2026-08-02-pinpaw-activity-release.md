# PinPaw Activity and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `내 활동`을 활성 유실 사건 중심의 작업 공간으로 바꾸고, 접근성·정적 검사·브라우저 시나리오·운영 문서까지 통과한 상태에서 UX Goal을 종료한다.

**Architecture:** 기존 `useMyLostPosts` cache를 재사용해 새 API 없이 활성 사건과 다음 행동을 도출하고 계정 기능은 보조 영역으로 내린다. 기능 작업 후 기존 lint/format 부채를 별도 기계적 commit으로 정리하고, 로컬·브라우저·운영 증거를 문서에 기록한 다음에만 Goal을 complete 처리한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, ESLint 9, Prettier 3, Node.js 22 test runner, production build, in-app Browser/Chrome accessibility inspection

## Global Constraints

- `내 활동` 첫 화면은 계정 정보보다 `searching` 상태의 최신 유실 사건과 다음 행동을 먼저 보여준다.
- 기존 `/my/lost-posts`, `/my/sightings`, `/my/notifications`, `/my/settings` route를 유지한다.
- 로그인 동의는 이용약관·개인정보 처리방침 링크와 명시적 안내로 표현하고 묵시적 동의 문구를 사용하지 않는다.
- loading 중 기존 cache가 있으면 화면을 비우지 않고 `업데이트 중`을 표시한다.
- error 발생 시 retry action과 기존 데이터를 유지한다.
- WCAG 2.2 AA, 44px hit target, 실제 heading, live/status/alert semantics를 적용한다.
- 새 runtime dependency는 추가하지 않는다.
- npm registry 접근, audit, package 설치는 사용자 승인 없이는 실행하지 않는다.
- Goal은 typecheck, lint, format, unit test, production build, 핵심 브라우저 시나리오가 모두 통과해야 complete로 변경한다.

---

## File Structure

- `src/features/lost-posts/lib/active-lost-case.ts`: 최신 활성 사건을 고르는 순수 함수.
- `src/features/lost-posts/components/ActiveLostCaseCard.tsx`: 사건 상태, 최신성, 핵심 action.
- `src/features/lost-posts/components/LostCaseNextActions.tsx`: 확인·지도·알림·상태 관리 action.
- `src/app/(tabs)/my/page.tsx`: 사건 우선 dashboard composition.
- `src/features/auth/components/LoginPrompt.tsx`: 명시적 로그인/정책 안내.
- `src/features/auth/components/AuthFeedbackBanner.tsx`: effect 내부 setState 제거.
- `src/features/map/components/NaverMap.tsx`: render 중 ref mutation 제거.
- `tests/unit/my-activity-ux-contract.test.mjs`: dashboard/copy contract.
- `tests/unit/active-lost-case.test.mjs`: 활성 사건 선택 규칙.
- `tests/unit/react-lint-regressions.test.mjs`: effect/ref regression contract.
- `docs/UX_REDESIGN_EXECUTION_GUIDE_KO.md`: Goal checkpoint와 실행 순서.
- `docs/PROJECT_STATUS_KO.md`: 실제 검증 증거.

### Task 1: Active lost-case selector and dashboard

**Files:**

- Create: `src/features/lost-posts/lib/active-lost-case.ts`
- Create: `src/features/lost-posts/components/ActiveLostCaseCard.tsx`
- Create: `src/features/lost-posts/components/LostCaseNextActions.tsx`
- Modify: `src/app/(tabs)/my/page.tsx`
- Create: `tests/unit/active-lost-case.test.mjs`
- Create: `tests/unit/my-activity-ux-contract.test.mjs`

**Interfaces:**

- Produces: `selectActiveLostCase(items: LostPostItem[]): LostPostItem | null`, ordered by newest `updated_at` among `status === "searching"`.
- Consumes: existing `useMyLostPosts()` cache and routes; no new API call.

- [ ] **Step 1: Write failing selection and composition tests**

```js
// tests/unit/active-lost-case.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { selectActiveLostCase } from "../../src/features/lost-posts/lib/active-lost-case.ts";

const item = (id, status, updated_at) => ({
  id,
  status,
  updated_at,
  created_at: updated_at,
  lost_at: updated_at,
  pet_name: id,
  cover_photo_key:
    "sighting_photo/20260802/00000000-0000-4000-8000-000000000000.jpg",
  trait_color: null,
  trait_size: null,
  trait_species: null,
  trait_tags: null,
  note: null,
  embedding_status: "ready",
});

test("selects the most recently updated searching case", () => {
  const result = selectActiveLostCase([
    item("closed", "closed", "2026-08-02T12:00:00Z"),
    item("older", "searching", "2026-08-01T12:00:00Z"),
    item("newer", "searching", "2026-08-02T10:00:00Z"),
  ]);
  assert.equal(result?.id, "newer");
});
```

```js
// tests/unit/my-activity-ux-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my activity leads with an active case and next actions", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<ActiveLostCaseCard/);
  assert.match(page, /<LostCaseNextActions/);
  assert.ok(page.indexOf("<ActiveLostCaseCard") < page.indexOf("displayEmail"));
  assert.match(page, /내 활동/);
});
```

- [ ] **Step 2: Run and confirm missing modules/components**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/active-lost-case.test.mjs tests/unit/my-activity-ux-contract.test.mjs`

Expected: FAIL because the selector and components do not exist.

- [ ] **Step 3: Implement event-first dashboard**

```ts
import type { LostPostItem } from "../model/types";

export function selectActiveLostCase(
  items: LostPostItem[]
): LostPostItem | null {
  return (
    items
      .filter((item) => item.status === "searching")
      .toSorted(
        (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
      )[0] ?? null
  );
}
```

`ActiveLostCaseCard` receives `{ item, refreshing }`, renders `찾는 중`, pet name, lost time, `마지막 확인` based on `updated_at`, and primary link `/recommend?lostPostId=${item.id}` labelled `확인할 제보 보기`. `LostCaseNextActions` receives `lostPostId` and renders links to `` `/map?lostPostId=${lostPostId}` ``, `/my/notifications`, and `` `/my/lost-posts/${lostPostId}` `` with labels `지도에서 흔적 보기`, `알림 확인`, `사건 정보 관리`.

In `MyPageContent`, call `useMyLostPosts()` once, select the active case, and render states in this order: real `h1` `내 활동`; cached active case plus `업데이트 중`; error with `다시 시도` calling `reload`; empty state with `/my/lost-posts/new`; account/notification/settings surface; collapsed past lost posts and sightings. Pass loaded items into a new optional `items` prop on `LostPostList` to avoid a second hook subscription.

- [ ] **Step 4: Run dashboard, cache, and type tests**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/active-lost-case.test.mjs tests/unit/my-activity-ux-contract.test.mjs tests/unit/client-resource-cache.test.mjs && npm run typecheck`

Expected: tests and typecheck PASS.

- [ ] **Step 5: Commit activity dashboard**

```bash
git add src/features/lost-posts/lib/active-lost-case.ts src/features/lost-posts/components/ActiveLostCaseCard.tsx src/features/lost-posts/components/LostCaseNextActions.tsx src/features/lost-posts/components/LostPostList.tsx 'src/app/(tabs)/my/page.tsx' tests/unit/active-lost-case.test.mjs tests/unit/my-activity-ux-contract.test.mjs
git commit -m "feat: make my activity incident-first"
```

### Task 2: Explicit login and policy copy

**Files:**

- Modify: `src/features/auth/components/LoginPrompt.tsx`
- Modify: `tests/unit/my-activity-ux-contract.test.mjs`

**Interfaces:**

- Consumes: current Kakao sign-in callback; existing `/terms` and `/privacy` public routes.
- Produces: action-specific prompt and explicit policy links.

- [ ] **Step 1: Add the failing copy contract**

```js
test("login prompt states the purpose and links policies", async () => {
  const prompt = await readFile(
    "src/features/auth/components/LoginPrompt.tsx",
    "utf8"
  );
  assert.match(prompt, /유실 사건을 이어서 관리하려면 로그인해 주세요/);
  assert.match(prompt, /href="\/terms"/);
  assert.match(prompt, /href="\/privacy"/);
  assert.doesNotMatch(prompt, /동의하는 것으로 간주됩니다/);
});
```

- [ ] **Step 2: Run and verify the implicit-consent failure**

Run: `node --test tests/unit/my-activity-ux-contract.test.mjs`

Expected: FAIL because the old generic and implicit consent copy remains.

- [ ] **Step 3: Replace the prompt copy and semantics**

Use real `h1` copy `유실 사건을 이어서 관리하려면 로그인해 주세요`. Supporting copy is `내 유실 사건, 확인할 제보, 저장한 흔적을 안전하게 연결합니다.` Keep the official Kakao image and busy guard. Below it render: `로그인 전에 이용약관과 개인정보 처리방침을 확인해 주세요.` with separate links to `/terms` and `/privacy`; do not claim that button activation itself constitutes policy consent.

- [ ] **Step 4: Run auth and copy tests**

Run: `node --test tests/unit/my-activity-ux-contract.test.mjs tests/unit/oauth-return-path.test.mjs tests/unit/site-copy-og-contract.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit login copy**

```bash
git add src/features/auth/components/LoginPrompt.tsx tests/unit/my-activity-ux-contract.test.mjs
git commit -m "fix: clarify login and policy consent"
```

### Task 3: React lint regressions

**Files:**

- Modify: `src/features/auth/components/AuthFeedbackBanner.tsx`
- Modify: `src/features/map/components/NaverMap.tsx`
- Create: `tests/unit/react-lint-regressions.test.mjs`

**Interfaces:**

- Produces: render-pure refs/state while preserving URL cleanup and one-time map bootstrap.
- Consumes: `authFeedbackMessage(code)` and the existing `initMapRef` retry loop.

- [ ] **Step 1: Write failing source regressions**

```js
// tests/unit/react-lint-regressions.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth banner does not set display state inside an effect", async () => {
  const source = await readFile(
    "src/features/auth/components/AuthFeedbackBanner.tsx",
    "utf8"
  );
  assert.doesNotMatch(source, /useEffect\([\s\S]*setMessage\(/);
  assert.match(source, /dismissedCode/);
});

test("map updates init ref in an effect, not during render", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /const initMapRef = useRef\(initMap\);\s*initMapRef\.current = initMap/
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*initMapRef\.current = initMap;/
  );
});
```

- [ ] **Step 2: Run source tests and lint to reproduce**

Run: `node --test tests/unit/react-lint-regressions.test.mjs && npm run lint`

Expected: source tests FAIL first; lint reports effect-state and render-ref findings.

- [ ] **Step 3: Make render state derivable and ref updates effectful**

In `AuthFeedbackBanner`, derive `code = searchParams.get("auth")` and `nextMessage = authFeedbackMessage(code)` during render. Replace `message` state with `dismissedCode: string | null`; display only when `code && code !== dismissedCode`. The effect only removes `auth` from the URL through `router.replace`, and the close button calls `setDismissedCode(code)`.

In `NaverMap`, replace the render assignment with:

```ts
const initMapRef = useRef(initMap);
useEffect(() => {
  initMapRef.current = initMap;
}, [initMap]);
```

Do not add `initMap` to the bootstrap effect dependencies; the ref remains the stable handoff to the latest callback.

- [ ] **Step 4: Run lint and remount regressions**

Run: `node --test tests/unit/react-lint-regressions.test.mjs tests/unit/map-remount-contract.test.mjs tests/unit/oauth-return-path.test.mjs && npm run lint`

Expected: tests PASS and lint exits 0.

- [ ] **Step 5: Commit lint fixes**

```bash
git add src/features/auth/components/AuthFeedbackBanner.tsx src/features/map/components/NaverMap.tsx tests/unit/react-lint-regressions.test.mjs
git commit -m "fix: preserve render purity in auth and map"
```

### Task 4: Repository formatting baseline

**Files:**

- Modify: files selected by `npm run format`, excluding `.prettierignore` entries.
- Test: `package.json` `format:check` command.

**Interfaces:**

- Consumes: Prettier `3.7.4` and `prettier-plugin-tailwindcss 0.7.2` already installed.
- Produces: full `npm run format:check` exit 0; no behavior change.

- [ ] **Step 1: Capture the existing red gate**

Run: `npm run format:check`

Expected: non-zero with the current formatting debt; save the reported file count in `docs/PROJECT_STATUS_KO.md`.

- [ ] **Step 2: Apply the repository formatter**

Run: `npm run format`

Expected: Prettier rewrites only tracked project source/docs/config files and skips dependencies, build output, secrets, locks, and local environments via `.prettierignore`.

- [ ] **Step 3: Review that changes are mechanical**

Run: `git diff --stat && git diff --check`

Expected: no whitespace errors; diff contains formatting only. If a semantic token, string literal, SQL identifier, or test assertion changed value, restore that specific hunk with `apply_patch` and rerun Prettier on the file.

- [ ] **Step 4: Run full static and unit gates**

Run: `npm run format:check && npm run typecheck && npm run lint && npm test`

Expected: all commands exit 0.

- [ ] **Step 5: Commit formatting separately**

```bash
git add -u
git commit -m "style: normalize repository formatting"
```

### Task 5: Browser acceptance and 10-second field protocol

**Files:**

- Create: `docs/verification/2026-08-02-warm-ux-browser-evidence.md`
- Modify: `docs/PROJECT_STATUS_KO.md`

**Interfaces:**

- Consumes: completed foundation, map/confirmation, and activity plans; local development server.
- Produces: route-by-route viewport, keyboard, accessibility, timing, failure-state evidence with no sensitive sample data.

- [ ] **Step 1: Create the evidence template before testing**

```markdown
# PinPaw 따뜻한 UX 브라우저 검증 증거

검증 환경: Node 22, Next.js development server, Chrome, Asia/Seoul

| 시나리오         | 390×844 | 768×1024 | 1440×900 | 키보드 | 결과 |
| ---------------- | ------- | -------- | -------- | ------ | ---- |
| 비회원 목격 제보 |         |          |          |        |      |
| 지도 탐색        |         |          |          |        |      |
| 확인할 제보      |         |          |          |        |      |
| 내 활동          |         |          |          |        |      |

## 접근성

- heading/landmark 순서:
- focus 이동 및 focus visible:
- 200% zoom/320 CSS px reflow:
- prefers-reduced-motion:
- axe-core 4.11.0 critical/serious 위반 수:

## 비회원 제보 능동 입력 시간

| 회차 | 사진 준비 | 위치 준비 | 시작→제출 활성 | 비고 |
| ---: | --------- | --------- | -------------: | ---- |
|    1 | 준비      | 준비      |                |      |
|    2 | 준비      | 준비      |                |      |
|    3 | 준비      | 준비      |                |      |
|    4 | 준비      | 준비      |                |      |
|    5 | 준비      | 준비      |                |      |

중앙값:
```

- [ ] **Step 2: Start the app without installing packages**

Run: `npm run dev`

Expected: server becomes ready and `/`, `/map`, `/recommend`, `/my`, `/api/health` respond. Keep the process in a PTY session so failures remain visible.

- [ ] **Step 3: Execute responsive and keyboard scenarios**

Use the in-app Browser or Chrome skill at `390×844`, `768×1024`, and `1440×900`. For each route record screenshot names, tab order, visible focus, scroll/reflow, loading, empty, error/retry, authenticated/guest boundaries, map pin legend, and single-sheet behavior. Use non-sensitive fixture imagery and do not submit a real public sighting.

- [ ] **Step 4: Execute accessibility and timing gates**

Run axe-core `4.11.0` from the existing local dependency tree through the browser evaluation surface on all four routes; record zero `critical` and zero `serious` violations. With photo and geolocation prepared, perform five anonymous form runs from first interaction until submit becomes enabled and require median `≤ 10.0s`. If the local browser cannot evaluate the existing axe bundle, stop and request approval before adding a direct accessibility testing dependency; do not download one implicitly.

- [ ] **Step 5: Record outcomes and commit evidence**

Update `docs/PROJECT_STATUS_KO.md` with links to the evidence file and checked results only. Then:

```bash
git add docs/verification/2026-08-02-warm-ux-browser-evidence.md docs/PROJECT_STATUS_KO.md
git commit -m "docs: record warm ux browser acceptance"
```

### Task 6: Production and Goal completion gate

**Files:**

- Modify: `docs/UX_REDESIGN_EXECUTION_GUIDE_KO.md`
- Modify: `docs/PROJECT_STATUS_KO.md`
- Modify: `docs/PUBLIC_MVP_ROADMAP.md`

**Interfaces:**

- Consumes: all tasks in the three approved implementation plans.
- Produces: deployable build evidence and completed Goal only when every acceptance condition is true.

- [ ] **Step 1: Run the final reproducible gate**

Run: `npm run format:check && npm run typecheck && npm run lint && npm test && npm run build`

Expected: every command exits 0 and Next.js production build completes without route or type errors.

- [ ] **Step 2: Run local HTTP boundaries**

With `npm run start` serving the production build, run: `npm run test:integration`

Expected: configured HTTP boundary tests PASS; `/`, `/map`, and `/api/health` return expected successful responses without sensitive values in logs.

- [ ] **Step 3: Record unresolved environment-only gates accurately**

Docker and `psql` are not currently installed, so do not claim local Supabase migration execution. Record SQL contract tests as complete and local DB reset/concurrency as pending environment validation. Do not install Docker, PostgreSQL, Supabase services, or any package without explicit user approval.

- [ ] **Step 4: Close documentation milestones**

In all three docs, mark UX-0 through UX-6 complete only for verified checkpoints, link the three plan files and browser evidence, list the exact final unit test count, and retain any non-passing deployment prerequisite as an open release blocker.

- [ ] **Step 5: Complete the Goal only after all required checks pass**

Call the Goal status tool with `status: "complete"` only when no required implementation or browser gate remains. If a required gate cannot run because the same external blocker repeats for three resumed Goal turns, use `status: "blocked"` and name the exact dependency/authority needed. Then commit docs:

```bash
git add docs/UX_REDESIGN_EXECUTION_GUIDE_KO.md docs/PROJECT_STATUS_KO.md docs/PUBLIC_MVP_ROADMAP.md
git commit -m "docs: close warm ux implementation goal"
```
