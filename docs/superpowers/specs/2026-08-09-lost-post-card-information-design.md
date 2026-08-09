# Lost Post Card Information Design

**Goal:** Help owners distinguish their lost-pet cases from the card without changing map actions, storage, or privacy policies.

**Architecture:** Extend only the authenticated lost-post list presentation with a coarse `approximateRegion` label generated server-side from the existing location value through `resolveApproxRegionLabel`. Consolidate Seoul lost-time formatting and dog-size labels into shared presentation helpers, then consume them from the owner card, detail, map detail, and share surfaces. Existing map, edit, and delete routes remain unchanged.

**Constraints:**

- Do not add a database column or migration.
- Do not add client-side reverse geocoding or expose a precise address, coordinate, or location payload through a new field.
- Return only a city/district-level label for the authenticated owner list; failures produce no raw fallback.
- Keep existing `lostPostId` map links, edit paths, and delete behavior unchanged.
- Prefer `lost_at` over `created_at` and format in `Asia/Seoul` as `8월 9일 오후 4:26`; include the year only outside the current Seoul year.
- Convert `small`/`소`, `medium`/`중`, and `large`/`대` to `소형견`, `중형견`, and `대형견`; unknown or invalid values return `null`.

## Card Layout

The active lost-case card keeps its cover-first design. Its content block shows the status and name, then a compact metadata stack: `잃어버린 시간` and `잃어버린 지역` in a two-line, truncation-safe layout, followed by up to three core chips (size, color/pattern, species). The optional note remains secondary and is not used as a substitute for metadata. Existing actions are left where they currently live: card primary CTA and share action remain intact, while edit/delete remain on the detail page.

## Data Flow And Privacy

`GET /api/v1/lost-posts` already authenticates the owner before reading their cases. The route derives `approximateRegion` on the server using the existing city/district-only formatter and returns only that string alongside current list fields. It does not alter `lost_location`, public previews, map APIs, or the reverse-geocoding provider contract. A lookup failure becomes `null`, and the card renders `지역 정보 없음` without adding a more precise fallback.

## Shared Presentation

- `formatSeoulLostDateTime` centralizes current-year-aware lost time labels and safely returns `null` for missing/invalid dates.
- `formatDogSizeLabel` normalizes legacy and API size values before producing the single visible terminology.
- Existing `resolveApproxRegionLabel` and `formatKoreanRegionLabel` remain the sole region-label implementation.

## Tests

Contract and unit tests cover `lost_at` precedence, Seoul formatting, coarse region output without address/coordinate fields, all size mappings, unknown suppression, retained card actions, mobile-safe layout classes, and unchanged `lostPostId` map focus behavior.
