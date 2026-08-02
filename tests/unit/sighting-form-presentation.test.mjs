import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSightingLocationStatus,
  toLocalDateTimeInputValue,
} from "../../src/features/sightings/lib/sighting-form-presentation.ts";

test("formats datetime-local in the supplied Date local timezone", () => {
  const date = new Date(2026, 7, 2, 9, 5, 0);
  assert.equal(toLocalDateTimeInputValue(date), "2026-08-02T09:05");
});

test("location status never exposes coordinates", () => {
  assert.equal(
    formatSightingLocationStatus("locating"),
    "현재 위치를 확인하고 있어요"
  );
  assert.equal(
    formatSightingLocationStatus("ready"),
    "현재 위치가 입력되었어요"
  );
  assert.equal(
    formatSightingLocationStatus("denied"),
    "위치 권한을 허용하거나 지도에서 선택해 주세요"
  );
  assert.equal(
    formatSightingLocationStatus("error"),
    "위치를 확인하지 못했어요. 지도에서 선택해 주세요"
  );
});
