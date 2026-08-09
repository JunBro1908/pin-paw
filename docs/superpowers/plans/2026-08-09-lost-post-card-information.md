# Lost Post Card Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful owner-card time, region, and trait labels without changing database, privacy, or existing actions.

**Architecture:** Shared date and size formatters provide one display vocabulary. The authenticated list route derives an `approximate_region` string with the existing server helper; the active card consumes it in a compact metadata block.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Tailwind, Node tests.

## Global Constraints

- No migration or new schema field.
- No client reverse geocoding, precise address, or newly exposed coordinate field.
- Reuse `resolveApproxRegionLabel`, `formatKoreanRegionLabel`, and `SEOUL_TZ`.
- Preserve all map, edit, delete, share, and touch-target behavior.
- Prefer `lost_at`; size labels are `소형견`, `중형견`, `대형견`, or hidden.

---

### Task 1: Shared display formatters

**Files:**
- Modify: `src/shared/lib/date.ts`
- Modify: `src/shared/constants/traitSizes.ts`
- Modify: `src/features/lost-posts/lib/lost-post-cover.ts`
- Modify: `src/shared/lib/share-preview.ts`
- Modify: `src/features/sightings/lib/sighting-detail-presentation.ts`
- Create: `tests/unit/lost-post-presentation.test.mjs`
- Modify: `tests/unit/share-preview.test.mjs`

**Interfaces:** `formatSeoulLostDateTime(value, now?) => string | null`; `formatDogSizeLabel(value) => string | null`.

- [ ] **Step 1: Write failing helper tests.** Assert current-year Seoul time `2026-08-09T07:26:00.000Z` is `8월 9일 오후 4:26`; assert small/중/large map to full labels; assert null, unknown, and invalid values return null.
- [ ] **Step 2: Run `node --test tests/unit/lost-post-presentation.test.mjs`.** Expected: missing helper exports fail.
- [ ] **Step 3: Implement pure helpers.** Use `Intl.DateTimeFormat` and `SEOUL_TZ`, include the year only outside the current Seoul year, and normalize size before returning a full dog-size label.
- [ ] **Step 4: Replace visible duplicate size/time conversions.** `formatLostCaseDateTime`, share traits, and sighting detail presentation call shared helpers; form input labels and stored values remain unchanged.
- [ ] **Step 5: Run `node --test tests/unit/lost-post-presentation.test.mjs tests/unit/share-preview.test.mjs tests/unit/sighting-detail-presentation.test.mjs`.** Expected: pass.
- [ ] **Step 6: Commit `feat: unify lost post presentation labels`.** Stage the Task 1 source and tests only.

### Task 2: Authenticated approximate-region payload

**Files:**
- Modify: `src/app/api/v1/lost-posts/route.ts`
- Modify: `src/features/lost-posts/model/types.ts`
- Create: `tests/unit/lost-post-list-region-contract.test.mjs`

**Interfaces:** `LostPostItem.approximate_region?: string | null` contains only a city/district string.

- [ ] **Step 1: Write a failing route contract.** Assert the route uses `resolveApproxRegionLabel`, maps `approximate_region`, and has no road/building/address-name or new latitude/longitude output mapping; assert the model field type is optional nullable string.
- [ ] **Step 2: Run `node --test tests/unit/lost-post-list-region-contract.test.mjs`.** Expected: current route lacks the field.
- [ ] **Step 3: Parse existing owner location only on the authenticated server route, derive the label with the existing helper, and return null for invalid coordinates or lookup failure.** Do not change selected schema fields, public preview, or map APIs.
- [ ] **Step 4: Run `node --test tests/unit/lost-post-list-region-contract.test.mjs tests/unit/public-api-guard.test.mjs`.** Expected: pass.
- [ ] **Step 5: Commit `feat: add approximate region to lost post cards`.** Stage the Task 2 source and test only.

### Task 3: Card hierarchy and unified visible labels

**Files:**
- Modify: `src/features/lost-posts/components/ActiveLostCaseCard.tsx`
- Modify: `src/features/lost-posts/components/LostPostCard.tsx`
- Modify: `src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx`
- Modify: `src/features/map/components/MapDetailSheet.tsx`
- Modify: `tests/unit/my-activity-ux-contract.test.mjs`
- Create: `tests/unit/lost-post-card-information-contract.test.mjs`

**Interfaces:** Active card reads `lost_at`, `approximate_region`, and Task 1 helpers to render a compact metadata stack.

- [ ] **Step 1: Write failing contracts.** Assert `lost_at` formatter, `잃어버린 시간`, `잃어버린 지역`, `approximate_region`, `min-w-0`, and `truncate`; reject `created_at` and `lost_location` card rendering. Preserve existing detail/recommend/share route assertions and assert visible size consumers use `formatDogSizeLabel`.
- [ ] **Step 2: Run `node --test tests/unit/my-activity-ux-contract.test.mjs tests/unit/lost-post-card-information-contract.test.mjs`.** Expected: no region stack and raw labels fail.
- [ ] **Step 3: Add a two-line metadata `dl` after the name.** Render user-friendly time and region labels, use `시간 정보 없음`/`지역 정보 없음` only for missing values, retain cover-first layout and action positions, and use `min-w-0`, truncation, tight gaps, and wrapping chips to protect mobile layout.
- [ ] **Step 4: Update `LostPostCard`, owner detail, and map lost-post sheet to use `formatDogSizeLabel`.** Do not modify map CTA, edit/delete controls, input controls, or enum persistence.
- [ ] **Step 5: Run `node --test tests/unit/my-activity-ux-contract.test.mjs tests/unit/lost-post-card-information-contract.test.mjs tests/unit/map-path-and-detail-ui.test.mjs tests/unit/share-preview.test.mjs`.** Expected: pass.
- [ ] **Step 6: Commit `feat: enrich lost post card information`.** Stage the Task 3 source and tests only.

### Task 4: Regression verification and publish

- [ ] **Step 1: Run `git diff --check` and `git status --short`.** Expected: no whitespace errors and only intended files.
- [ ] **Step 2: Run separately: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.** Expected: all commands pass.
- [ ] **Step 3: Push with `git push origin main`, then verify `git status --short` and `git log origin/main..HEAD --oneline`.** Expected: clean tree and no unpushed commits.
