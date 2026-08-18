import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("photo count hints stay concise and move file restrictions to Toast", async () => {
  const [sighting, lost, validation] = await Promise.all([
    readFile("src/features/sightings/components/SightingForm.tsx", "utf8"),
    readFile("src/features/lost-posts/components/LostPostForm.tsx", "utf8"),
    readFile("src/shared/lib/photo-validation.ts", "utf8"),
  ]);

  assert.match(sighting, /회원 제보는 최대 5장/);
  assert.match(sighting, /비회원 제보는 최대 1장/);
  assert.match(lost, /유실글은 최대 3장/);
  assert.doesNotMatch(sighting, /photoHint[\s\S]{0,180}JPEG\/PNG/);
  assert.doesNotMatch(lost, /최대 3장 · JPEG\/PNG · 장당 10MB/);
  assert.match(sighting, /photoValidationMessage/);
  assert.match(lost, /photoValidationMessage/);
  assert.match(sighting, /rememberUploadIntents/);
  assert.match(sighting, /markUploadIntentCompleted/);
  assert.match(lost, /rememberUploadIntents/);
  assert.match(lost, /markUploadIntentCompleted/);
  assert.match(validation, /JPEG\/PNG/);
  assert.match(validation, /10MB/);
});
