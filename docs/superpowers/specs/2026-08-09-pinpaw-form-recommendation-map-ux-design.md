# PinPaw Form, Recommendation, and Map UX Design

## Goal

Make report entry states, recommendation explanations, map detail fields, and recommendation deep links predictable without changing recommendation-model behavior or location privacy boundaries.

## Scope

### Form UX

- Replace the sighting memo label with the natural label `메모`; keep it detail-only and out of recommendation scoring.
- Track the source of a populated location independently from coordinates: `geolocation` or `selected`.
- Derive copy from that source: automatic geolocation says `현재 위치가 입력되었어요.`, and LocationPicker selection says `선택한 위치가 입력되었어요.`
- Reuse a shared location-input presentation helper in sighting and lost-post creation forms.
- Replace LostPostForm's direct white/light-only input styles with the existing `bg-surface text-text-main` input token pattern used by SightingEssentials and SightingOptionalDetails.

### Recommendation Presentation

- Preserve the RPC payload shape and five raw `scoreBreakdown` contributions.
- Group them only in presentation: `locationTime = movement`, `appearance = species + size + color`, and `distinctive = distinctiveTrait`.
- Render one three-segment bar plus an unfilled remainder. Tooltip/focus detail exposes the three appearance sub-scores and explains that movement radius is a possible range, not a score.
- Keep raw similarity private and ranking unchanged. Add `displayMatchPercent = clamp(round(110 * similarity + 12), 0, 100)` as a stable, monotonic display-only score. It matches the requested relative spread, does not depend on the candidate set, and handles a single candidate without a special normalization branch.
- Rename the user-facing score to `후보 적합도` to avoid claiming model certainty.

### Map Detail and Deep Link

- Return `trait_tags` from the authenticated block-filtered sighting-detail RPC and carry it through the focused map item.
- Render a compact label-value detail list in a fixed order: 종, 크기, 색상·무늬, 특이사항, 메모. Normalize `unknown`, null, and blank values to `정보 없음` or `없음`.
- Reduce only the visible source-info affordance to about 80%, while its button remains at least 44 by 44 px.
- Keep the direct authenticated detail fetch for a recommendation deep link. When the detail resolves before the map is initialized, retain the requested center and consume it in map initialization; do not mark auto-focus complete until the map has accepted the pan.

## Non-Goals and Safety Constraints

- Do not modify recommendation SQL weighting, embedding prompts, vector generation, raw similarity, candidate selection, or review ordering.
- Do not use masked recommendation coordinates to bypass precise-location rules. Continue using the authenticated, block-filtered detail endpoint.
- Do not use timer-based deep-link retries.
- Keep existing request ownership, abort behavior, and map privacy contracts.

## Test Strategy

- Unit-test location copy, display percentage monotonicity and sanitization, score grouping, and normalized detail fields.
- Update UI contracts for the new three-group score bar, memo label, and accessible source-info control.
- Add a deep-link regression contract that proves a resolved detail center remains pending until map initialization.
- Run the existing test suite, typecheck, lint, and production build after implementation.
