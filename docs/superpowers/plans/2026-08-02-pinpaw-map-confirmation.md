# PinPaw Map and Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도에서 목격·보호소·내 유실 사건을 오인 없이 구분하고, 추천 화면을 불투명한 AI 점수 대신 거리·시간·특징 근거가 있는 `확인할 제보`로 바꾼다.

**Architecture:** 보호소 출처는 새 공개 column을 만들지 않고 권한이 잠긴 `shelter_animal_imports`를 지도 RPC 내부에서 조인해 `source_type`으로만 내보낸다. 추천 RPC는 판단 근거용 원시 값까지 반환하고 API가 이를 안정적인 우선순위 band와 한국어 근거로 변환하며, client에는 소수 similarity를 노출하지 않는다. 큰 `NaverMap`은 데이터 hook/renderer는 유지하고 controls, legend, detail sheet만 작은 컴포넌트로 분리한다.

**Tech Stack:** PostgreSQL/PostGIS/pgvector, Supabase RPC/RLS, Next.js 16 Route Handlers, React 19, TypeScript 5, Naver Maps adapter, Node.js 22 test runner

## Global Constraints

- 목격은 `#087A3E`, 유실은 `#B85C1B`, 보호소는 `#28736F`를 사용하며 icon과 text label을 함께 제공한다.
- 비회원 지도는 기존 마스킹 cluster 정책을 유지한다.
- 정밀 위치는 기존 인증·인가 RPC 경계를 통과한 사용자에게만 제공한다.
- 보호소 mapping table은 `service_role` 이외의 role에 계속 비공개다.
- 추천은 소수 similarity, `topK`, AI 확신 문구를 사용자에게 노출하지 않는다.
- 추천은 `거리`, `시간 차이`, `일치 특징`을 제공하고 불확실성을 명시한다.
- 차단 사용자 필터, 신고/차단 sheet, claim-first 정렬, 위치 마스킹을 유지한다.
- 지도 cache/ETag에는 새 `source_type` payload가 포함되어야 한다.
- dependency 설치와 외부 registry 접근은 사용자 승인 전에는 실행하지 않는다.

---

## File Structure

- `supabase/migrations/20260802010000_map_source_types.sql`: public/auth 지도 RPC에 안전한 `source_type` 추가.
- `tests/unit/map-source-type-contract.test.mjs`: 권한, clustering, payload 계약.
- `src/features/map/types/naver.ts`: `MapSourceType`과 marker payload type.
- `src/features/map/lib/map-marker-presentation.ts`: marker color/label을 결정하는 순수 함수.
- `src/features/map/lib/map-layer-renderer.ts`: source-aware marker HTML.
- `src/features/map/components/MapLegend.tsx`: 목격·보호소·유실 설명.
- `src/features/map/components/MapToolbar.tsx`: 보기 기준과 위치/list action.
- `src/features/map/components/MapDetailSheet.tsx`: 선택 항목 detail surface.
- `src/features/map/components/NaverMap.tsx`: 위 컴포넌트를 조립하는 controller.
- `supabase/migrations/20260802020000_recommendation_evidence.sql`: 추천 거리·시간·특징 payload.
- `tests/unit/recommendation-evidence-contract.test.mjs`: SQL/API/UI 비노출 및 근거 계약.
- `src/app/api/v1/recommendations/route.ts`: cache v2, band/evidence mapper.
- `src/features/recommendations/model/types.ts`: client-safe 추천 type.
- `src/features/recommendations/lib/recommendation-presentation.ts`: band와 근거 순수 변환.
- `src/features/recommendations/components/RecommendationCard.tsx`: 근거 중심 card.
- `src/app/(tabs)/recommend/page.tsx`: `확인할 제보` 화면과 접힌 탐색 범위.

### Task 1: Source-aware map RPC contract

**Files:**

- Create: `supabase/migrations/20260802010000_map_source_types.sql`
- Create: `tests/unit/map-source-type-contract.test.mjs`
- Modify: `tests/integration/db-permission-matrix.sql`

**Interfaces:**

- Consumes: `public.sightings.id`; locked `public.shelter_animal_imports.sighting_id`; current signatures of `get_sighting_clusters` and `get_block_filtered_sighting_markers`.
- Produces: every map payload object has `source_type: "sighting" | "shelter"`; cluster grouping never combines different source types.

- [ ] **Step 1: Write the failing migration contract**

```js
// tests/unit/map-source-type-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = "supabase/migrations/20260802010000_map_source_types.sql";

test("map RPCs derive source type without exposing shelter mapping table", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(
    sql,
    /create or replace function public\.get_sighting_clusters/i
  );
  assert.match(
    sql,
    /create or replace function public\.get_block_filtered_sighting_markers/i
  );
  assert.match(
    sql,
    /left join public\.shelter_animal_imports sai[\s\S]*sai\.sighting_id = s\.id/i
  );
  assert.match(
    sql,
    /case when sai\.sighting_id is null then 'sighting' else 'shelter' end as source_type/i
  );
  assert.match(sql, /group by[\s\S]*source_type/i);
  assert.match(sql, /'source_type',\s*(?:source_type|op\.source_type)/i);
  assert.match(
    sql,
    /revoke all on table public\.shelter_animal_imports[\s\S]*from public, anon, authenticated/i
  );
});
```

- [ ] **Step 2: Run and confirm the missing migration**

Run: `node --test tests/unit/map-source-type-contract.test.mjs`

Expected: FAIL with ENOENT for `20260802010000_map_source_types.sql`.

- [ ] **Step 3: Recreate both RPCs with source-separated clusters**

In each RPC's visible/filtered CTE, use this exact derivation:

```sql
select
  s.id,
  s.user_id,
  st_y(s.location::geometry) as lat,
  st_x(s.location::geometry) as lng,
  s.note,
  s.photo_keys,
  s.trait_color,
  s.trait_size,
  s.trait_species,
  s.occurred_at,
  s.author_type,
  case
    when sai.sighting_id is null then 'sighting'
    else 'shelter'
  end as source_type
from public.sightings s
left join public.shelter_animal_imports sai
  on sai.sighting_id = s.id
```

Add `source_type` to every grid `group by`, carry it through `with_details`/`payloads`, and add `'source_type', source_type` to point and cluster JSON. Preserve public zoom capping, coordinate masking, hidden/archive filters, owner precise pins, blocked-user filtering, `security definer` search paths, and the exact existing revoke/grant signatures. End the migration with:

```sql
alter table public.shelter_animal_imports enable row level security;
revoke all on table public.shelter_animal_imports
  from public, anon, authenticated;
grant select, insert, update, delete on table public.shelter_animal_imports
  to service_role;
```

- [ ] **Step 4: Run SQL contract and permission tests**

Run: `node --test tests/unit/map-source-type-contract.test.mjs tests/unit/shelter-animal-import-contract.test.mjs tests/unit/data-plane-permissions.test.mjs tests/unit/migration-order.test.mjs`

Expected: all tests PASS. Do not run `npm run db:start` because Docker is not installed on this laptop.

- [ ] **Step 5: Commit the data contract**

```bash
git add supabase/migrations/20260802010000_map_source_types.sql tests/unit/map-source-type-contract.test.mjs tests/integration/db-permission-matrix.sql
git commit -m "feat: distinguish shelter markers on maps"
```

### Task 2: Typed marker presentation and renderer

**Files:**

- Modify: `src/features/map/types/naver.ts`
- Create: `src/features/map/lib/map-marker-presentation.ts`
- Modify: `src/features/map/lib/map-layer-renderer.ts`
- Modify: `tests/unit/map-layer-renderer.test.mjs`
- Create: `tests/unit/map-marker-presentation.test.mjs`

**Interfaces:**

- Produces: `MapSourceType = "sighting" | "shelter"`; `getMapMarkerPresentation(sourceType, kind): { label: string; color: string; shape: "pin" | "rounded-square" | "cluster" }`.
- Consumes: `ClusterPoint.source_type`, `ClusterData.source_type` supplied by Task 1.

- [ ] **Step 1: Write failing marker presentation tests**

```js
// tests/unit/map-marker-presentation.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { getMapMarkerPresentation } from "../../src/features/map/lib/map-marker-presentation.ts";

test("uses stable labels, colors, and shapes", () => {
  assert.deepEqual(getMapMarkerPresentation("sighting", "point"), {
    label: "목격",
    color: "#087A3E",
    shape: "pin",
  });
  assert.deepEqual(getMapMarkerPresentation("shelter", "point"), {
    label: "보호소",
    color: "#28736F",
    shape: "rounded-square",
  });
  assert.deepEqual(getMapMarkerPresentation("shelter", "cluster"), {
    label: "보호소 묶음",
    color: "#28736F",
    shape: "cluster",
  });
});
```

- [ ] **Step 2: Run and confirm module-not-found failure**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/map-marker-presentation.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement typed presentation and consume it in renderer**

```ts
export type MapMarkerKind = "point" | "cluster";

export function getMapMarkerPresentation(
  sourceType: MapSourceType,
  kind: MapMarkerKind
) {
  const shelter = sourceType === "shelter";
  return {
    label: shelter
      ? kind === "cluster"
        ? "보호소 묶음"
        : "보호소"
      : kind === "cluster"
        ? "목격 묶음"
        : "목격",
    color: shelter ? "#28736F" : "#087A3E",
    shape: kind === "cluster" ? "cluster" : shelter ? "rounded-square" : "pin",
  } as const;
}
```

Make `source_type: MapSourceType` required on `ClusterPoint` and `ClusterData`. In renderer, replace hard-coded green/red marker borders with `presentation.color`; shelter point markup uses `border-radius: 12px`, sighting point retains pin geometry, and every marker root includes `role="img" aria-label="${presentation.label}"`. Preserve feedback border emphasis by adding an inner 3px status ring instead of replacing the source color.

- [ ] **Step 4: Run renderer and map domain tests**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/map-marker-presentation.test.mjs tests/unit/map-layer-renderer.test.mjs tests/unit/map-domain.test.mjs tests/unit/map-data-state.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit source-aware markers**

```bash
git add src/features/map/types/naver.ts src/features/map/lib/map-marker-presentation.ts src/features/map/lib/map-layer-renderer.ts tests/unit/map-layer-renderer.test.mjs tests/unit/map-marker-presentation.test.mjs
git commit -m "feat: render source-aware map markers"
```

### Task 3: Map legend, toolbar, and detail sheet decomposition

**Files:**

- Create: `src/features/map/components/MapLegend.tsx`
- Create: `src/features/map/components/MapToolbar.tsx`
- Create: `src/features/map/components/MapDetailSheet.tsx`
- Modify: `src/features/map/components/NaverMap.tsx`
- Create: `tests/unit/map-warm-ux-contract.test.mjs`

**Interfaces:**

- Consumes: existing `MapLayer = "default" | "unseen" | "bookmark"`; `MapItem`; `LostPostMapItem`; existing callbacks from `NaverMap`.
- Produces: labelled legend and one visible bottom sheet; toolbar labels existing view filters as `전체/새 목격/저장한 흔적` without changing fetch semantics.

- [ ] **Step 1: Write the failing composition contract**

```js
// tests/unit/map-warm-ux-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("map controller delegates warm surfaces", async () => {
  const map = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );
  for (const component of ["MapLegend", "MapToolbar", "MapDetailSheet"])
    assert.match(map, new RegExp(`<${component}`));
  assert.doesNotMatch(map, /linear-gradient|backdrop-blur|rounded-\[28px\]/);
});

test("legend explains all rendered sources with text", async () => {
  const legend = await readFile(
    "src/features/map/components/MapLegend.tsx",
    "utf8"
  );
  for (const label of ["목격", "유실", "보호소"])
    assert.match(legend, new RegExp(label));
  assert.match(legend, /aria-label="지도 표시 종류"/);
});
```

- [ ] **Step 2: Run and confirm missing components**

Run: `node --test tests/unit/map-warm-ux-contract.test.mjs`

Expected: FAIL because the components do not exist and old gradient/oversized radius markup remains.

- [ ] **Step 3: Extract surfaces without moving state ownership**

`MapLegend` renders a compact `<section aria-label="지도 표시 종류">` with three text entries and source colors. `MapToolbar` accepts `layer`, `authenticated`, `listOpen`, `onLayerChange`, `onLocate`, `onToggleList`; it renders 44px buttons and calls the existing callbacks. `MapDetailSheet` accepts one of `{ kind: "sighting"; item: MapItem }`, `{ kind: "lost"; item: LostPostMapItem }`, or `null`, plus close/report/bookmark callbacks, and renders `<aside aria-label="선택한 지도 정보">` with a visible close button.

Keep all fetching, refs, effects, selection state, report/block state, and Naver adapter lifecycle in `NaverMap`. Replace only the inline toolbar, legend, selected sighting sheet, and selected lost-post sheet. Use `bg-surface`, `border-border-subtle`, `rounded-2xl`, and at most `shadow-sm`.

- [ ] **Step 4: Run map tests and typecheck**

Run: `node --test tests/unit/map-warm-ux-contract.test.mjs tests/unit/map-path-and-detail-ui.test.mjs tests/unit/map-marker-layer-contract.test.mjs tests/unit/map-remount-contract.test.mjs && npm run typecheck`

Expected: all tests and typecheck PASS.

- [ ] **Step 5: Commit map surfaces**

```bash
git add src/features/map/components/MapLegend.tsx src/features/map/components/MapToolbar.tsx src/features/map/components/MapDetailSheet.tsx src/features/map/components/NaverMap.tsx tests/unit/map-warm-ux-contract.test.mjs
git commit -m "feat: simplify map exploration surfaces"
```

### Task 4: Recommendation evidence RPC

**Files:**

- Create: `supabase/migrations/20260802020000_recommendation_evidence.sql`
- Create: `tests/unit/recommendation-evidence-contract.test.mjs`
- Modify: `tests/unit/data-plane-permissions.test.mjs`

**Interfaces:**

- Consumes: current `get_recommendations_for_lost_post(uuid,float,float,int)` scoring and permissions.
- Produces per result: `similarity: number`, `distanceKm: number`, `timeDeltaHours: number`, `matchedTraits: string[]`, plus existing photo/time/location fields.

- [ ] **Step 1: Write the failing SQL payload contract**

```js
// tests/unit/recommendation-evidence-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recommendation RPC returns explainable evidence inputs", async () => {
  const sql = await readFile(
    "supabase/migrations/20260802020000_recommendation_evidence.sql",
    "utf8"
  );
  assert.match(
    sql,
    /st_distance\(s\.location::geography, v_lost_location\) \/ 1000\.0 as distance_km/i
  );
  assert.match(
    sql,
    /extract\(epoch from \(s\.occurred_at - v_lost_at\)\) \/ 3600\.0 as time_delta_hours/i
  );
  assert.match(sql, /'distanceKm',\s*round\(distance_km::numeric, 1\)/i);
  assert.match(
    sql,
    /'timeDeltaHours',\s*round\(time_delta_hours::numeric, 1\)/i
  );
  assert.match(sql, /'matchedTraits',\s*matched_traits/i);
});
```

- [ ] **Step 2: Run and confirm the missing migration**

Run: `node --test tests/unit/recommendation-evidence-contract.test.mjs`

Expected: FAIL with ENOENT.

- [ ] **Step 3: Extend the current function without changing ranking**

Add these candidate columns:

```sql
st_distance(s.location::geography, v_lost_location) / 1000.0 as distance_km,
extract(epoch from (s.occurred_at - v_lost_at)) / 3600.0 as time_delta_hours,
array_remove(array[
  case when v_species = s.trait_species and v_species is not null and v_species <> 'unknown' then 'species' end,
  case when v_size = s.trait_size and v_size is not null and v_size <> 'unknown' then 'size' end,
  case when exists (
    select 1 from unnest(v_color_tokens) token
    where token = any(coalesce(s.color_tokens, array[]::text[]))
  ) then 'color' end,
  case when exists (
    select 1 from unnest(v_trait_tags) tag
    where tag = any(coalesce(s.trait_tags, array[]::text[]))
  ) then 'distinctive_trait' end
], null) as matched_traits
```

Carry all three columns through `with_sims`, `with_weights`, `scored`, and `ranked`. Add the following keys to `jsonb_build_object` while retaining the existing ranking formula and privacy-sensitive coordinates for server-side masking:

```sql
'distanceKm', round(distance_km::numeric, 1),
'timeDeltaHours', round(time_delta_hours::numeric, 1),
'matchedTraits', matched_traits
```

Preserve `security definer`, the current parameter signature/defaults, the archive filter, top-k cap, function revoke, and authenticated grant.

- [ ] **Step 4: Run recommendation and permission contracts**

Run: `node --test tests/unit/recommendation-evidence-contract.test.mjs tests/unit/data-plane-permissions.test.mjs tests/unit/privacy-location.test.mjs tests/unit/migration-order.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit recommendation evidence SQL**

```bash
git add supabase/migrations/20260802020000_recommendation_evidence.sql tests/unit/recommendation-evidence-contract.test.mjs tests/unit/data-plane-permissions.test.mjs
git commit -m "feat: add recommendation evidence inputs"
```

### Task 5: Server-side priority and evidence mapping

**Files:**

- Create: `src/features/recommendations/lib/recommendation-presentation.ts`
- Modify: `src/app/api/v1/recommendations/route.ts`
- Modify: `src/features/recommendations/model/types.ts`
- Create: `tests/unit/recommendation-presentation.test.mjs`
- Modify: `tests/unit/recommendation-evidence-contract.test.mjs`

**Interfaces:**

- Produces: `RecommendationPriority = "high" | "medium" | "within-range"`; `toRecommendationPresentation(raw): { priority, distanceKm, timeDeltaHours, evidence }`.
- Client `RecommendationItem` excludes `similarity` and includes `priority`, `distanceKm`, `timeDeltaHours`, `evidence: string[]`.

- [ ] **Step 1: Write failing mapper tests**

```js
// tests/unit/recommendation-presentation.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { toRecommendationPresentation } from "../../src/features/recommendations/lib/recommendation-presentation.ts";

test("maps score bands and evidence without exposing the score", () => {
  const result = toRecommendationPresentation({
    similarity: 0.76,
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    matchedTraits: ["color", "distinctive_trait"],
  });
  assert.deepEqual(result, {
    priority: "high",
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    evidence: ["1.4km 거리", "약 5시간 뒤 목격", "색상 일치", "특이사항 일치"],
  });
  assert.equal("similarity" in result, false);
});
```

- [ ] **Step 2: Run and confirm the missing helper**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/recommendation-presentation.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement mapper and version the cache**

Use thresholds `similarity >= 0.72 → high`, `>= 0.45 → medium`, otherwise `within-range`. Map trait keys exactly as `species → 종`, `size → 체형`, `color → 색상`, `distinctive_trait → 특이사항`, each suffixed with ` 일치`. Round hours for copy with `Math.round`; hours below 1 become `1시간 이내 목격`.

Change API cache key to:

```ts
function buildCacheKey(radiusKm: number, days: number, topK: number): string {
  return `evidence-v2_${radiusKm}_${days}_${topK}`;
}
```

Keep the raw server type with `similarity`, apply block filtering and claim-first ordering, call `protectRecommendationLocations`, then map each item through `toRecommendationPresentation` before passing `{ status, items, calculatedAt }` to `ok`. The client model must be:

```ts
export type RecommendationPriority = "high" | "medium" | "within-range";

export interface RecommendationItem {
  sightingId: string;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
  locationPrecision: "approximate";
  claimedAsMyDog?: boolean;
  priority: RecommendationPriority;
  distanceKm: number;
  timeDeltaHours: number;
  evidence: string[];
}
```

- [ ] **Step 4: Run API privacy and mapper tests**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/unit/recommendation-presentation.test.mjs tests/unit/recommendation-evidence-contract.test.mjs tests/unit/privacy-location.test.mjs tests/unit/api-input.test.mjs`

Expected: all tests PASS and protected coordinates remain approximate.

- [ ] **Step 5: Commit server presentation mapping**

```bash
git add src/features/recommendations/lib/recommendation-presentation.ts src/app/api/v1/recommendations/route.ts src/features/recommendations/model/types.ts tests/unit/recommendation-presentation.test.mjs tests/unit/recommendation-evidence-contract.test.mjs
git commit -m "feat: explain recommendation priority"
```

### Task 6: Evidence-first confirmation screen

**Files:**

- Modify: `src/features/recommendations/components/RecommendationCard.tsx`
- Modify: `src/app/(tabs)/recommend/page.tsx`
- Modify: `src/features/recommendations/hooks/useRecommendations.ts`
- Create: `tests/unit/recommendation-warm-ux-contract.test.mjs`

**Interfaces:**

- Consumes: client-safe `RecommendationItem` from Task 5; API keeps `topK=10` internally.
- Produces: `확인할 제보` screen with priority labels and evidence chips; advanced range disclosure controls only radius and days.

- [x] **Step 1: Write the failing UI contract**

```js
// tests/unit/recommendation-warm-ux-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("confirmation UI shows evidence and hides model controls", async () => {
  const [page, card] = await Promise.all([
    readFile("src/app/(tabs)/recommend/page.tsx", "utf8"),
    readFile(
      "src/features/recommendations/components/RecommendationCard.tsx",
      "utf8"
    ),
  ]);
  assert.match(page, /확인할 제보/);
  assert.match(page, /탐색 범위/);
  assert.doesNotMatch(page, /setTopK|추천 조건:|개수/);
  assert.match(card, /먼저 확인|함께 확인|범위 안 제보/);
  assert.match(card, /item\.evidence/);
  assert.doesNotMatch(card, /similarity|유사도|toFixed\(1\)/i);
});
```

- [x] **Step 2: Run and confirm old similarity UI fails**

Run: `node --test tests/unit/recommendation-warm-ux-contract.test.mjs`

Expected: FAIL because the current page exposes topK and decimal similarity.

- [x] **Step 3: Replace score UI with evidence hierarchy**

Render priority labels with this exact mapping:

```ts
const PRIORITY_LABEL = {
  high: "먼저 확인",
  medium: "함께 확인",
  "within-range": "범위 안 제보",
} satisfies Record<RecommendationPriority, string>;
```

Under each photo render occurred time, `item.evidence` as a `<ul aria-label="확인 근거">`, and the sentence `근거는 확인 순서를 돕기 위한 정보이며 동일한 동물임을 보장하지 않습니다.` Keep claim, report, block, and map actions. On the page remove `topK` state/input/copy; pass the hook's default 10 implicitly. Put radius and days inside `<details><summary>탐색 범위</summary>` and rename heading to real `h1` text `확인할 제보`.

Also: draft/applied range interaction, request-owner abort guard, and shared dialog focus lifecycle for detail/report modals (`recommendation-interaction-behavior` + `dialog-focus-behavior` contracts).

- [x] **Step 4: Run recommendation and type gates**

Run: `node --test tests/unit/recommendation-warm-ux-contract.test.mjs tests/unit/privacy-location.test.mjs tests/unit/sighting-claim-map-contract.test.mjs && npm run typecheck`

Expected: tests and typecheck PASS; no unused `session` warning remains in the page.

Verified locally (2026-08-02): interaction/dialog RED 8/8, related recommendation/map UX 40/40, full `npm test` 320/320, `tsc --noEmit` pass. Commit still pending.

- [ ] **Step 5: Commit confirmation UX**

```bash
git add src/features/recommendations/components/RecommendationCard.tsx 'src/app/(tabs)/recommend/page.tsx' src/features/recommendations/hooks/useRecommendations.ts tests/unit/recommendation-warm-ux-contract.test.mjs
git commit -m "feat: replace ai scores with review evidence"
```
