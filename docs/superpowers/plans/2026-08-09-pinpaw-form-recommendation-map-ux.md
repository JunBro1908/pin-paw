# PinPaw Form, Recommendation, and Map UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve form feedback, recommendation explanation, map detail consistency, and focused map navigation without changing the recommendation model.

**Architecture:** Shared presentation helpers own user-facing location and recommendation display rules. Form components consume location-source state, recommendation UI consumes grouped contributions from the presentation layer, and map deep links retain a pending center until a map instance exists. A narrow SQL migration only expands the authenticated detail payload with existing `trait_tags` data.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase/Postgres, Node test runner.

## Global Constraints

- Keep recommendation SQL, embeddings, raw similarity, and ranking unchanged.
- Keep `scoreBreakdown` raw values unchanged; only group them for display.
- Preserve authenticated block-filtered precise-detail access and location masking boundaries.
- Maintain at least 44px touch targets.
- Do not introduce timer-based deep-link retry behavior.

---

### Task 1: Form location source and theme consistency

**Files:**

- Modify: `src/features/sightings/lib/sighting-form-presentation.ts`
- Modify: `src/features/sightings/components/SightingForm.tsx`
- Modify: `src/features/sightings/components/SightingEssentials.tsx`
- Modify: `src/features/lost-posts/components/LostPostForm.tsx`
- Test: `tests/unit/sighting-form-presentation.test.mjs`
- Test: `tests/unit/sighting-form-ux-contract.test.mjs`

- [ ] Add failing tests for automatic versus manually selected location copy and for token-based LostPostForm inputs.
- [ ] Run the focused tests and confirm they fail because source-specific copy and shared token classes are absent.
- [ ] Add a location source type and formatter; set `geolocation` only in geolocation success callbacks and `selected` only in LocationPicker callbacks.
- [ ] Update sighting and lost-post labels to derive from the source, simplify the sighting memo label, and replace LostPostForm light-only input classes with shared surface/text classes.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Stable recommendation presentation

**Files:**

- Modify: `src/features/recommendations/model/types.ts`
- Modify: `src/features/recommendations/lib/recommendation-presentation.ts`
- Modify: `src/features/recommendations/components/RecommendationCard.tsx`
- Test: `tests/unit/recommendation-evidence-contract.test.mjs`
- Test: `tests/unit/recommendation-warm-ux-contract.test.mjs`

- [ ] Add failing tests for `displayMatchPercent`, invalid input handling, and three grouped contributions.
- [ ] Run focused tests and confirm the current five segment card and raw-percent output fail the new contract.
- [ ] Implement stable affine display scaling, group score contributions, and render the three segment bar with tooltip/focus detail while preserving the raw bar widths.
- [ ] Rename score copy to `후보 적합도` and make aria labels describe the three groups and movement-radius meaning.
- [ ] Run focused tests and confirm they pass.

### Task 3: Consistent map sighting detail

**Files:**

- Create: `supabase/migrations/20260809010000_map_sighting_detail_trait_tags.sql`
- Modify: `src/features/map/lib/map-deep-link-focus.ts`
- Modify: `src/features/map/types/naver.ts`
- Modify: `src/features/sightings/components/SightingDetailCard.tsx`
- Test: `tests/unit/map-deep-link-focus.test.mjs`
- Test: `tests/unit/map-warm-ux-contract.test.mjs`

- [ ] Add failing tests for carrying trait tags and rendering fixed-order fallback fields.
- [ ] Run focused tests and confirm they fail because the RPC payload and card do not expose trait tags or fixed field rows.
- [ ] Extend the block-filtered detail RPC JSON with `trait_tags`, map it to `ClusterPoint`, and render normalized label-value rows.
- [ ] Shrink the visible source info circle/glyph while making its interactive control at least 44px square.
- [ ] Run focused tests and confirm they pass.

### Task 4: Deterministic recommendation deep link

**Files:**

- Modify: `src/features/map/components/NaverMap.tsx`
- Test: `tests/unit/map-deep-link-focus.test.mjs`
- Test: `tests/unit/map-layer-preference.test.mjs`

- [ ] Add a failing regression contract for detail resolution before map initialization.
- [ ] Run focused tests and confirm the existing success flag can be set before the map accepts a pan.
- [ ] Retain the detail-derived center as pending, consume it during map initialization, and mark focus completed only after a map instance is available.
- [ ] Run focused tests and confirm they pass without changing request ownership or privacy behavior.

### Task 5: Full regression verification

**Files:**

- Modify any affected UX contract tests only where requirements intentionally supersede old presentation assertions.

- [ ] Review changes against global constraints and confirm no recommendation scoring source changed.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
