import assert from "node:assert/strict";
import test from "node:test";

import {
  getMapMarkerPresentation,
  getSightingPinStatusColor,
  MAP_PIN_STATUS_COLORS,
  normalizeMapSourceType,
} from "../../src/features/map/lib/map-marker-presentation.ts";

test("uses stable labels, colors, and shapes for sighting and shelter markers", () => {
  assert.deepEqual(getMapMarkerPresentation("sighting", "point"), {
    label: "목격",
    color: MAP_PIN_STATUS_COLORS.unseen,
    shape: "pin",
  });
  assert.deepEqual(getMapMarkerPresentation("shelter", "point"), {
    label: "보호소",
    color: "#28736F",
    shape: "rounded-square",
  });
  assert.deepEqual(getMapMarkerPresentation("sighting", "cluster"), {
    label: "목격 묶음",
    color: MAP_PIN_STATUS_COLORS.unseen,
    shape: "cluster",
  });
  assert.deepEqual(getMapMarkerPresentation("shelter", "cluster"), {
    label: "보호소 묶음",
    color: "#28736F",
    shape: "cluster",
  });
});

test("maps sighting feedback to blue, gray, and yellow without red", () => {
  assert.equal(getSightingPinStatusColor(null), "#3B82F6");
  assert.equal(getSightingPinStatusColor({ seen: false, claimed: false }), "#3B82F6");
  assert.equal(getSightingPinStatusColor({ seen: true, claimed: false }), "#9CA3AF");
  assert.equal(getSightingPinStatusColor({ seen: true, claimed: true }), "#EAB308");
  assert.equal(MAP_PIN_STATUS_COLORS.unseen, "#3B82F6");
  assert.equal(MAP_PIN_STATUS_COLORS.seen, "#9CA3AF");
  assert.equal(MAP_PIN_STATUS_COLORS.claimed, "#EAB308");
});

test("accepts only the shelter detail source and falls back safely", () => {
  assert.equal(normalizeMapSourceType("shelter"), "shelter");
  assert.equal(normalizeMapSourceType("sighting"), "sighting");
  assert.equal(normalizeMapSourceType("unknown"), "sighting");
  assert.equal(normalizeMapSourceType(null), "sighting");
});
