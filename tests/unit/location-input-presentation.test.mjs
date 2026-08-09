import assert from "node:assert/strict";
import test from "node:test";
import { formatLocationInputStatus } from "../../src/shared/lib/location-input-presentation.ts";

test("location input copy distinguishes automatic and manually selected coordinates", () => {
  assert.equal(
    formatLocationInputStatus("geolocation"),
    "현재 위치가 입력되었어요."
  );
  assert.equal(
    formatLocationInputStatus("selected"),
    "선택한 위치가 입력되었어요."
  );
});
