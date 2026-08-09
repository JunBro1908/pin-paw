# PinPaw UX Polish Implementation Plan

> Status: Completed on 2026-08-09. Tasks 1-3 were committed independently; Task 4 verification is recorded with the final publish commit.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make form, recommendation-card, detail-sheet, and map deep-link UX clearer without changing recommendation, privacy, authentication, or rate-limit behavior.

**Architecture:** Consolidate presentation-only rules around existing token classes and shared trait-tag constants. Keep API response codes and database logic unchanged, and make map focus depend on explicit detail, map-ready, and center-applied conditions rather than timing.

**Tech Stack:** Next.js, React, TypeScript, Tailwind design tokens, Supabase API routes, Node unit tests.

## Global Constraints

- Do not change recommendation SQL/RPCs, raw similarity, score groups, or result ordering.
- Do not weaken auth, RLS, privacy masking, embedding processing, or rate-limit enforcement.
- Keep the 15-second cooldown strategy and HTTP/error-code behavior; change only the user-facing copy.
- Use existing design tokens and shared UI components; introduce no raw hex values for these changes.
- Preserve 44px minimum touch targets even when a visual icon becomes smaller.
- No DB migration is required.

---

### Task 1: Form readability, trait-tag limit, and cooldown copy

**Files:**
- Modify: `src/shared/constants/traitTags.ts`
- Modify: `src/features/sightings/components/SightingOptionalDetails.tsx`
- Modify: `src/features/sightings/components/SightingForm.tsx`
- Modify: `src/features/sightings/components/SightingEditForm.tsx`
- Modify: `src/features/lost-posts/components/LostPostForm.tsx`
- Modify: `src/features/lost-posts/components/LostPostEditForm.tsx`
- Modify: `src/shared/lib/api-input.ts`
- Modify: `src/app/api/v1/lost-posts/route.ts`
- Modify: `src/app/api/v1/lost-posts/[lostPostId]/route.ts`
- Modify: `src/app/api/v1/sightings/route.ts`
- Modify: `src/app/api/v1/auth/sightings/[sightingId]/route.ts`
- Modify: `src/shared/lib/rate-limit.ts`
- Modify: `tests/unit/sighting-form-ux-contract.test.mjs`
- Modify: `tests/unit/sighting-edit-form-ux-contract.test.mjs`
- Modify: `tests/unit/sighting-form-validator.test.mjs`
- Modify: `tests/unit/rate-limit-cooldown-contract.test.mjs`
- Create: `tests/unit/lost-post-form-ux-contract.test.mjs`

**Interfaces:**
- Consumes: `TRAIT_TAG_IDS` and current create/update parsers.
- Produces: exported `TRAIT_TAGS_MAX` constant equal to `5`, used by every form and API normalizer.

- [ ] **Step 1: Write failing contracts for the shared tag maximum and memo presentation.**

```js
assert.match(source, /export const TRAIT_TAGS_MAX = 5/);
assert.match(lostPostSource, /bg-surface/);
assert.match(lostPostSource, /text-text-main/);
assert.doesNotMatch(lostPostSource, /bg-white/);
assert.match(optionalDetailsSource, /최대 \{maxTags\}개/);
assert.doesNotMatch(optionalDetailsSource, /선택, 최대/);
```

- [ ] **Step 2: Run the focused contracts and verify the old UI fails.**

Run: `node --test tests/unit/lost-post-form-ux-contract.test.mjs tests/unit/sighting-form-ux-contract.test.mjs tests/unit/sighting-edit-form-ux-contract.test.mjs`

Expected: failure because lost-post uses `bg-white` and its tag limit is eight.

- [ ] **Step 3: Introduce one trait-tag maximum and apply it at every boundary.**

```ts
export const TRAIT_TAGS_MAX = 5;

const normalizedTags = traitTags
  .filter((id) => TRAIT_TAG_IDS.includes(id))
  .slice(0, TRAIT_TAGS_MAX);
```

Use the constant for lost-post and sighting form chip disabling, create parsers,
and update handlers. Render `특이사항` as the field label and `최대 5개` as a
smaller token-colored helper. Reuse the `bg-surface text-text-main` textarea
token class and provide token-based placeholder/autofill styles.

- [ ] **Step 4: Replace only cooldown copy.**

```ts
message: "제보를 연속으로 등록할 수 없어요. 잠시 후 다시 시도해 주세요.",
strategy: "cooldown",
windowMs: 15 * 1000,
```

- [ ] **Step 5: Run focused tests and verify API behavior remains unchanged.**

Run: `node --test tests/unit/lost-post-form-ux-contract.test.mjs tests/unit/sighting-form-ux-contract.test.mjs tests/unit/sighting-edit-form-ux-contract.test.mjs tests/unit/sighting-form-validator.test.mjs tests/unit/rate-limit-cooldown-contract.test.mjs`

Expected: PASS; tests still assert the 15-second cooldown strategy and rate-limit error code.

- [ ] **Step 6: Commit the independent form unit.**

```bash
git add src/shared/constants/traitTags.ts src/features/sightings/components/SightingOptionalDetails.tsx src/features/sightings/components/SightingForm.tsx src/features/sightings/components/SightingEditForm.tsx src/features/lost-posts/components/LostPostForm.tsx src/features/lost-posts/components/LostPostEditForm.tsx src/shared/lib/api-input.ts src/app/api/v1/lost-posts/route.ts src/app/api/v1/lost-posts/[lostPostId]/route.ts src/app/api/v1/sightings/route.ts src/app/api/v1/auth/sightings/[sightingId]/route.ts src/shared/lib/rate-limit.ts tests/unit/lost-post-form-ux-contract.test.mjs tests/unit/sighting-form-ux-contract.test.mjs tests/unit/sighting-edit-form-ux-contract.test.mjs tests/unit/sighting-form-validator.test.mjs tests/unit/rate-limit-cooldown-contract.test.mjs
git commit -m "fix: improve form trait and cooldown UX"
```

### Task 2: Simplify recommendation-card presentation

**Files:**
- Modify: `src/features/recommendations/components/RecommendationCard.tsx`
- Modify: `tests/unit/recommendation-display-presentation.test.mjs`
- Modify: `tests/unit/recommendation-interaction-behavior.test.mjs`
- Modify: `tests/unit/recommendation-evidence-contract.test.mjs`

**Interfaces:**
- Consumes: unchanged `RecommendationItem.displayMatchPercent` and `scoreGroups`.
- Produces: a presentation-only, non-interactive `ScoreBreakdownBar`.

- [ ] **Step 1: Write failing UI contracts for the simplified score and legend.**

```js
assert.match(source, /추천 점수/);
assert.match(source, /\{item\.displayMatchPercent\}점/);
assert.doesNotMatch(source, /후보 적합도/);
assert.doesNotMatch(source, /movementRadiusKm|현재 이동 가능 반경/);
assert.doesNotMatch(scoreBarSource, /aria-expanded|setExpanded|type="button"/);
```

- [ ] **Step 2: Run focused recommendation tests and verify the former contract fails.**

Run: `node --test tests/unit/recommendation-display-presentation.test.mjs tests/unit/recommendation-interaction-behavior.test.mjs tests/unit/recommendation-evidence-contract.test.mjs`

Expected: failure because score legends are buttons and movement radius is rendered.

- [ ] **Step 3: Render two-line score and static legend without changing data.**

```tsx
<Text variant="caption" className="text-text-sub block text-xs font-medium">
  추천 점수
</Text>
<Text className="text-action-primary block text-lg font-bold">
  {item.displayMatchPercent}점
</Text>
```

Keep the progressbar and each color segment. Change legend items from buttons to
`li`/`span` content, remove expanded explanations and radius UI, and use
balanced `grid` or flex wrapping so a third legend item does not hang alone.

- [ ] **Step 4: Run focused recommendation tests.**

Run: `node --test tests/unit/recommendation-display-presentation.test.mjs tests/unit/recommendation-interaction-behavior.test.mjs tests/unit/recommendation-evidence-contract.test.mjs`

Expected: PASS with existing recommendation evidence and interaction semantics preserved.

- [ ] **Step 5: Commit the independent recommendation unit.**

```bash
git add src/features/recommendations/components/RecommendationCard.tsx tests/unit/recommendation-display-presentation.test.mjs tests/unit/recommendation-interaction-behavior.test.mjs tests/unit/recommendation-evidence-contract.test.mjs
git commit -m "fix: simplify recommendation card UX"
```

### Task 3: Detail hierarchy and deterministic map deep-link focus

**Files:**
- Modify: `src/features/sightings/components/SightingDetailCard.tsx`
- Modify: `src/features/map/components/NaverMap.tsx`
- Modify: `src/features/map/lib/map-deep-link-focus.ts`
- Modify: `tests/unit/sighting-detail-presentation.test.mjs`
- Modify: `tests/unit/map-deep-link-focus.test.mjs`
- Modify: `tests/unit/map-path-and-detail-ui.test.mjs`
- Modify: `tests/unit/map-warm-ux-contract.test.mjs`

**Interfaces:**
- Consumes: `resolveDeepLinkCenter`, `buildFocusedSightingFromDetail`, existing Naver map refs, and privacy-authorized detail API response.
- Produces: `applyDeepLinkFocusWhenReady(target, mapReady)` behavior that sets center/zoom exactly once and prevents user-location warm-up from overriding it.

- [ ] **Step 1: Write failing detail and map-focus regression tests.**

```js
assert.match(detailCardSource, /border-t border-border-subtle/);
assert.match(detailCardSource, /min-h-11 min-w-11/);
assert.match(detailCardSource, /h-4 w-4/);
assert.match(mapSource, /pendingDeepLinkCenterRef/);
assert.match(mapSource, /hasCenteredSightingRef\.current = true/);
assert.doesNotMatch(mapSource, /setTimeout\([^)]*deep.*focus/i);
```

Include pure map-focus tests for: target outside viewport, detail before map ready,
invalid ID, invalid coordinates, and no geolocation override once focus is
pending or complete.

- [ ] **Step 2: Run focused detail/map tests and verify current sequencing fails.**

Run: `node --test tests/unit/sighting-detail-presentation.test.mjs tests/unit/map-deep-link-focus.test.mjs tests/unit/map-path-and-detail-ui.test.mjs tests/unit/map-warm-ux-contract.test.mjs`

Expected: failure because the existing focus completion does not explicitly bind map-ready application to selected-detail state.

- [ ] **Step 3: Add the divider and reduce visual info glyph only.**

```tsx
<div className="border-border-subtle border-t pt-4">
  <dl className="border-border-subtle divide-border-subtle divide-y rounded-xl border">
```

Keep the source-info button at `min-h-11 min-w-11`; reduce the visual circle to
`h-4 w-4`, reduce the icon glyph, and use a tighter header gap.

- [ ] **Step 4: Make deep-link application explicitly map-ready.**

```ts
const applyDeepLinkFocus = (target: FocusTarget) => {
  pendingDeepLinkCenterRef.current = target.center;
  if (!mapInstanceRef.current || !window.naver?.maps) return false;
  mapInstanceRef.current.panTo(new window.naver.maps.LatLng(target.center.lat, target.center.lng));
  mapInstanceRef.current.setZoom(DEEP_LINK_FOCUS_ZOOM);
  hasCenteredSightingRef.current = true;
  return true;
};
```

Retain the pending target after detail resolution, run application from map
initialization readiness, set selected sighting from the resolved detail, and
gate silent geolocation when a focus ID is present, pending, or completed.

- [ ] **Step 5: Run focused detail/map tests.**

Run: `node --test tests/unit/sighting-detail-presentation.test.mjs tests/unit/map-deep-link-focus.test.mjs tests/unit/map-path-and-detail-ui.test.mjs tests/unit/map-warm-ux-contract.test.mjs`

Expected: PASS for all deep-link race and privacy-safe fallback contracts.

- [ ] **Step 6: Commit the independent map/detail unit.**

```bash
git add src/features/sightings/components/SightingDetailCard.tsx src/features/map/components/NaverMap.tsx src/features/map/lib/map-deep-link-focus.ts tests/unit/sighting-detail-presentation.test.mjs tests/unit/map-deep-link-focus.test.mjs tests/unit/map-path-and-detail-ui.test.mjs tests/unit/map-warm-ux-contract.test.mjs
git commit -m "fix: focus deep-linked sightings on map"
```

### Task 4: Full regression verification and publish

**Files:**
- Modify only if a failed test exposes a direct regression from Tasks 1-3.

- [ ] **Step 1: Check formatting and repository state.**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended files before the final commit.

- [ ] **Step 2: Run required verification suite.**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Expected: all commands pass.

- [ ] **Step 3: Push the documented design and three feature commits.**

```bash
git push origin main
git status --short
git log --oneline -4
```

Expected: clean worktree and all commits available on `origin/main`.
