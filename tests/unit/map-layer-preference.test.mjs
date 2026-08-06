import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth markers always emit owner pins separately from other clusters", async () => {
  const [legacy, next] = await Promise.all([
    readFile(
      "supabase/migrations/20260726040000_auth_map_always_include_owner_pins.sql",
      "utf8"
    ),
    readFile(
      "supabase/migrations/20260802020000_auth_map_privileged_pins_out_of_clusters.sql",
      "utf8"
    ),
  ]);

  assert.match(legacy, /owner_points as/);
  assert.match(legacy, /other_points as/);
  assert.match(legacy, /where user_id = v_user_id/);
  assert.match(legacy, /user_id is distinct from v_user_id/);
  assert.match(legacy, /'location_precision',\s*'precise'/);

  assert.match(next, /privileged_points as/);
  assert.match(next, /claimed_ids as/);
  assert.match(next, /lost_post_sighting_claims/);
  assert.match(next, /p_zoom_level >= 15/);
  assert.match(next, /v_grid_size := 0\.001/);
  assert.match(
    next,
    /Owner pins \+ bookmark endpoints stay out of ordinary clusters/
  );
});

test("NaverMap restores and writes map layer preference", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(source, /readStoredMapLayer/);
  assert.match(source, /writeStoredMapLayer/);
  assert.match(source, /resolveMapLayerForSession/);
  assert.match(source, /readStoredMapLayer\(\)/);
  assert.match(
    source,
    /if \(initialFocusSightingId\) \{\s*writeStoredMapLayer\("default"\);\s*return "default";/
  );
});

test("recommend map deep link forces default layer before focus", async () => {
  const [map, page, card, focusLib] = await Promise.all([
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
    readFile("src/app/(tabs)/map/page.tsx", "utf8"),
    readFile(
      "src/features/recommendations/components/RecommendationCard.tsx",
      "utf8"
    ),
    readFile("src/features/map/lib/map-deep-link-focus.ts", "utf8"),
  ]);

  assert.match(page, /initialFocusSightingId=\{initialFocusSightingId\}/);
  assert.match(page, /initialCenter=\{initialCenter/);
  assert.match(
    page,
    /key=\{\s*initialFocusSightingId\s*\?\s*`focus:\$\{initialFocusSightingId\}`\s*:\s*"map"\s*\}/
  );

  // 추천 카드에서는 마스킹된 lat/lng를 URL 중심점으로 사용하지 않는다.
  // sightingId만 전달하고 인증 상세 API의 정확한 좌표로 포커스한다.
  assert.match(
    card,
    /import \{ buildRecommendationMapHref \} from "@\/features\/map\/lib\/map-deep-link-focus";/
  );
  assert.match(
    card,
    /const mapHref = buildRecommendationMapHref\(item\.sightingId,\s*lostPostId\);/
  );
  assert.match(card, /router\.push\(mapHref\)/);
  assert.doesNotMatch(
    card,
    /\/map\?lat=\$\{item\.lat\}&lng=\$\{item\.lng\}/
  );

  assert.match(
    map,
    /if \(initialFocusSightingId\) \{\s*writeStoredMapLayer\("default"\);\s*return "default";/
  );
  assert.match(map, /resolveDeepLinkCenter/);
  assert.match(map, /buildFocusedSightingFromDetail/);
  assert.match(map, /findFocusedPointInItems/);
  assert.match(map, /panMapToDeepLinkCenter/);
  assert.match(
    map,
    /\/api\/v1\/auth\/sightings\/\$\{encodeURIComponent\(focusId\)\}/
  );

  // Success-gated lock: do not set hasAutoFocused before detail resolves.
  assert.match(
    map,
    /hasAutoFocusedRef\.current = true;\s*setSelectedSighting\(focused\);\s*panMapToDeepLinkCenter\(center\);/
  );

  // Viewport fallback must still run when URL center is present.
  assert.doesNotMatch(
    map,
    /itemsInView\.length === 0 \|\|\s*initialCenter/
  );

  assert.match(focusLib, /Prefer precise coords from auth detail RPC/);
  assert.match(focusLib, /DEEP_LINK_FOCUS_ZOOM = 16/);
  assert.match(
    focusLib,
    /const params = new URLSearchParams\(\{\s*sightingId:/
  );
  assert.doesNotMatch(
    focusLib,
    /params\.(?:set|append)\(["'](?:lat|lng)["']/
  );
});

test("NaverMap refetches bookmark layer after claim mutations succeed", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(
    source,
    /Refetch after mutation succeeds so paths\/markers match DB/
  );
  assert.match(
    source,
    /Always refetch after success — layer switch effect can race before POST/
  );
  assert.doesNotMatch(
    source,
    /setToast\(\{[\s\S]*북마크를 해제했습니다\.[\s\S]*if \(mapLayer === "bookmark"\) \{\s*void fetchBookmarkLayerData\(\);\s*\}\s*try \{/
  );
});