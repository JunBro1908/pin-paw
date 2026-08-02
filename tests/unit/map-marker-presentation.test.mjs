import assert from "node:assert/strict";
import test from "node:test";

import { getMapMarkerPresentation } from "../../src/features/map/lib/map-marker-presentation.ts";

test("uses stable labels, colors, and shapes for sighting and shelter markers", () => {
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
  assert.deepEqual(getMapMarkerPresentation("sighting", "cluster"), {
    label: "목격 묶음",
    color: "#087A3E",
    shape: "cluster",
  });
  assert.deepEqual(getMapMarkerPresentation("shelter", "cluster"), {
    label: "보호소 묶음",
    color: "#28736F",
    shape: "cluster",
  });
});
