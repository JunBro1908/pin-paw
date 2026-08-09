import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFocusedSightingFromDetail,
  DEEP_LINK_FOCUS_ZOOM,
  findFocusedPointInItems,
  resolveDeepLinkCenter,
} from "../../src/features/map/lib/map-deep-link-focus.ts";
import { maskCoordinate } from "../../src/shared/lib/privacy-location.ts";

test("resolveDeepLinkCenter prefers precise detail over approximate URL grid", () => {
  const precise = { lat: 37.501234, lng: 127.012345 };
  const approximate = {
    lat: maskCoordinate(precise.lat),
    lng: maskCoordinate(precise.lng),
  };

  assert.deepEqual(
    resolveDeepLinkCenter(
      { id: "s1", lat: precise.lat, lng: precise.lng },
      approximate
    ),
    precise
  );
  assert.notDeepEqual(approximate, precise);
  assert.deepEqual(resolveDeepLinkCenter(null, approximate), approximate);
  assert.equal(resolveDeepLinkCenter(null, null), null);
});

test("buildFocusedSightingFromDetail builds a point for the detail sheet", () => {
  const center = { lat: 37.5, lng: 127.0 };
  const focused = buildFocusedSightingFromDetail(
    {
      id: "11111111-1111-4111-8111-111111111111",
      lat: 37.501,
      lng: 127.001,
      source_type: "shelter",
      photo_keys: ["a.jpg", 1],
      occurred_at: "2026-08-02T00:00:00Z",
      author_type: "user",
      trait_color: "brown",
      trait_tags: ["collar", 1],
      note: "near park",
    },
    center
  );

  assert.ok(focused);
  assert.equal(focused.type, "point");
  assert.equal(focused.lat, center.lat);
  assert.equal(focused.lng, center.lng);
  assert.equal(focused.source_type, "shelter");
  assert.deepEqual(focused.photo_keys, ["a.jpg"]);
  assert.deepEqual(focused.trait_tags, ["collar"]);
  assert.equal(focused.author_type, "user");
  assert.equal(DEEP_LINK_FOCUS_ZOOM, 16);
});

test("findFocusedPointInItems matches normalized sighting ids", () => {
  const id = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  const items = [
    {
      id: "cluster-1",
      lat: 1,
      lng: 2,
      count: 3,
      type: "cluster",
      source_type: "sighting",
    },
    {
      id: id.toLowerCase(),
      lat: 37.5,
      lng: 127.0,
      type: "point",
      source_type: "sighting",
    },
  ];

  const found = findFocusedPointInItems(items, id);
  assert.ok(found);
  assert.equal(found.type, "point");
  assert.equal(found.id, id.toLowerCase());
  assert.equal(findFocusedPointInItems(items, "missing"), null);
});
