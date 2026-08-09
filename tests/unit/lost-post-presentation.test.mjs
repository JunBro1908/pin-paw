import assert from "node:assert/strict";
import test from "node:test";

import * as traitSizes from "../../src/shared/constants/traitSizes.ts";
import * as date from "../../src/shared/lib/date.ts";

test("formats lost time in Seoul and includes the year only when needed", () => {
  const lostAt = "2026-08-09T07:26:00.000Z";

  assert.equal(
    date.formatSeoulLostDateTime(
      lostAt,
      new Date("2026-01-01T00:00:00.000Z")
    ),
    "8월 9일 오후 4:26"
  );
  assert.equal(
    date.formatSeoulLostDateTime(
      lostAt,
      new Date("2027-01-01T00:00:00.000Z")
    ),
    "2026년 8월 9일 오후 4:26"
  );
  assert.equal(date.formatSeoulLostDateTime(null), null);
  assert.equal(date.formatSeoulLostDateTime("not-a-date"), null);
});

test("formats dog size labels without exposing stored enum values", () => {
  assert.equal(traitSizes.formatDogSizeLabel("small"), "소형견");
  assert.equal(traitSizes.formatDogSizeLabel("소"), "소형견");
  assert.equal(traitSizes.formatDogSizeLabel("medium"), "중형견");
  assert.equal(traitSizes.formatDogSizeLabel("중"), "중형견");
  assert.equal(traitSizes.formatDogSizeLabel("large"), "대형견");
  assert.equal(traitSizes.formatDogSizeLabel("대"), "대형견");
  assert.equal(traitSizes.formatDogSizeLabel("unknown"), null);
  assert.equal(traitSizes.formatDogSizeLabel(null), null);
  assert.equal(traitSizes.formatDogSizeLabel("invalid"), null);
});
