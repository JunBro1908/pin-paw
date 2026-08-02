import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sighting form separates essentials from optional details", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  assert.match(form, /<SightingEssentials/);
  assert.match(form, /<SightingOptionalDetails/);
  assert.match(form, /toLocalDateTimeInputValue/);
  assert.doesNotMatch(form, /lat\.toFixed|lng\.toFixed|🐾/u);
});

test("photo control is semantic and optional section stays in-page", async () => {
  const [essentials, optional] = await Promise.all([
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);
  assert.match(essentials, /<label[^>]+htmlFor="sighting-photo"/);
  assert.match(essentials, /id="sighting-photo"/);
  assert.match(essentials, /aria-live="polite"/);
  assert.match(optional, /<details/);
  assert.match(optional, /특징을 더 알려주기 \(선택\)/);
});
