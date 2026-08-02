import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichRecommendationEvidence,
  haversineKm,
  needsRecommendationEvidenceEnrichment,
} from "../../src/features/recommendations/lib/recommendation-evidence-enrich.ts";

test("detects sparse RPC payloads missing evidence fields", () => {
  assert.equal(
    needsRecommendationEvidenceEnrichment([
      {
        sightingId: "a",
        similarity: 0.5,
        photoKeys: [],
        occurredAt: "2026-08-02T00:00:00Z",
        lat: 37.5,
        lng: 127.0,
      },
    ]),
    true
  );
  assert.equal(
    needsRecommendationEvidenceEnrichment([
      {
        sightingId: "a",
        similarity: 0.5,
        photoKeys: [],
        occurredAt: "2026-08-02T00:00:00Z",
        lat: 37.5,
        lng: 127.0,
        distanceKm: 1.2,
        timeDeltaHours: 3,
        matchedTraits: ["color"],
      },
    ]),
    false
  );
});

test("enriches distance and time from lost-post anchor", () => {
  const [item] = enrichRecommendationEvidence(
    [
      {
        sightingId: "s1",
        similarity: 0.6,
        photoKeys: ["k"],
        occurredAt: "2026-08-02T03:00:00Z",
        lat: 37.57,
        lng: 126.98,
      },
    ],
    {
      lostAt: "2026-08-02T00:00:00Z",
      lat: 37.5665,
      lng: 126.978,
    }
  );
  assert.ok(item.distanceKm > 0);
  assert.equal(item.timeDeltaHours, 3);
  assert.deepEqual(item.matchedTraits, []);
});

test("haversine returns roughly zero for identical points", () => {
  assert.ok(haversineKm(37.5, 127, 37.5, 127) < 0.001);
});

test("recommendations route keeps results when block filter RPC is missing", async () => {
  const route = await import("node:fs/promises").then((fs) =>
    fs.readFile("src/app/api/v1/recommendations/route.ts", "utf8")
  );
  assert.match(route, /block_filter_unavailable/);
  assert.match(route, /enrichRecommendationEvidence/);
  assert.match(route, /triggerEmbeddingsProcess/);
  assert.match(route, /let visibleItems = rawItems/);
  assert.ok(
    !/if \(visibilityError\) \{\s*logger\.error[\s\S]*?return \[\];/.test(
      route
    ),
    "visibility errors must not empty the recommendation list"
  );
});
