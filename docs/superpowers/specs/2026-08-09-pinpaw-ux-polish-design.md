# PinPaw UX Polish Design

## Scope

Apply five related UX improvements without changing recommendation ranking,
similarity calculation, privacy rules, authentication, RLS, rate limiting
behavior, or embedding workflows.

The work is grouped into three independently deployable commits:

1. Form readability, trait-tag limit, and cooldown copy (A-C)
2. Recommendation-card presentation simplification (D)
3. Sighting detail hierarchy and deterministic map deep-link focus (E)

## A. Form UX

### Current cause

`LostPostForm` owns a bespoke memo textarea with `bg-white` and no explicit
tokenized text/placeholder styling. `SightingOptionalDetails` already uses the
token-based shared input style (`bg-surface`, `text-text-main`, focus tokens).
The divergent lost-post field loses contrast in dark mode.

### Design

Extract or reuse a token-only textarea class so lost-post create/edit and
sighting create/edit use the same background, text, placeholder, focus,
disabled, and autofill behavior. No new raw hex colors are introduced.

Trait-tag maximum becomes one shared domain constant with value `5`. Client
selection disables unselected chips at the limit, client request parsing
rejects/normalizes consistently, and API handlers retain their allow-list plus
maximum enforcement. The visual structure is a field label, then a lower-
contrast helper line: `최대 5개`.

## C. Cooldown copy

### Current cause

The cooldown preset exposes `잠시 후 다시 시도해주세요. (15초 쿨다운)` directly
through API error responses, making an internal policy detail visible.

### Design

Keep the existing cooldown strategy, dimensions, RPC, HTTP status, error code,
and internal retry metadata. Replace only the user-facing preset copy with:

`제보를 연속으로 등록할 수 없어요. 잠시 후 다시 시도해 주세요.`

Both lost-post and sighting creation use the same preset.

## D. Recommendation card

### Design

Preserve `displayMatchPercent`, `scoreGroups`, RPC response fields, and all
ranking behavior. Render the score as a two-line label/value pair:

```
추천 점수
56점
```

The score-composition bar remains a progressbar, with non-interactive legend
items. Remove expanded state, click handlers, button semantics, explanatory
copy, and the movement-radius sentence. Legend items wrap in balanced columns
on narrow screens and retain compact spacing before the map action.

## E. Detail and map focus

### Detail hierarchy

Use the existing `border-border-subtle` token to add a restrained divider
between the sighting source/date header and detail list. Preserve the 44px
minimum interactive target of the source info button while reducing only the
visual info-circle glyph and header gap.

### Deep-link flow

Model deep-link completion as a sequence rather than treating detail fetch as
success:

1. Read `sightingId` from the URL.
2. Resolve the authenticated sighting detail directly.
3. Validate the privacy-authorized latitude/longitude.
4. Store the target until the Naver map instance is ready.
5. Apply center and zoom once the SDK and map instance exist.
6. Add the focused point to selected state and render its detail sheet.
7. Mark focus complete only after the map-center command is applied.
8. Prevent the geolocation warm-up path from moving the map while deep-link
   focus is pending or complete.

The existing detail endpoint and coordinate validation stay authoritative. A
bad ID or invalid coordinates leaves the map in its normal default state.
No timer is used to synchronize focus; SDK readiness and target resolution are
explicit state conditions.

## Tests

Update existing unit contracts and add regression coverage for:

- shared form textarea token usage and five-tag UI/validation limit
- the cooldown user copy while retaining the cooldown strategy
- non-interactive recommendation legends and removed movement-radius copy
- detail divider and small visual info glyph with retained button target
- deep-link focus outside a loaded viewport, resolve-before-map-ready,
  geolocation non-override, invalid target, and invalid coordinates

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` after
the three commits.

## Non-goals

- Database migrations
- Recommendation-score formulas, raw similarities, result ordering, or RPCs
- Auth, role permissions, privacy masking, RLS, rate-limit enforcement, and
  embedding worker behavior
