import assert from "node:assert/strict";
import test from "node:test";

import { validateSightingForm } from "../../src/features/sightings/lib/validators.ts";

const validForm = {
  photo: {},
  photoUrl: "blob:photo",
  lat: 37.5665,
  lng: 126.978,
  time: "2026-08-02T09:05",
  traitColor: "",
  traitSize: "unknown",
  traitSpecies: "unknown",
  traitTags: [],
  description: "",
};

const now = new Date("2026-08-02T01:00:00.000Z"); // 10:00 Asia/Seoul


test("blank sighting time is rejected with localized feedback", () => {
  assert.deepEqual(validateSightingForm({ ...validForm, time: "" }, now), {
    time: "목격 시각을 입력해주세요.",
  });
});

test("malformed and impossible sighting times are rejected", () => {
  for (const time of ["not-a-date", "2026-02-30T12:00", "2026-08-02T25:00"]) {
    assert.equal(
      validateSightingForm({ ...validForm, time }, now).time,
      "올바른 목격 시각을 입력해주세요."
    );
  }
});

test("a future sighting time is rejected against the supplied clock", () => {
  assert.deepEqual(
    validateSightingForm({ ...validForm, time: "2026-08-02T10:01" }, now),
    { time: "미래 시각은 입력할 수 없습니다." }
  );
});

test("a valid datetime-local sighting time passes validation", () => {
  assert.deepEqual(validateSightingForm(validForm, now), {});
});
