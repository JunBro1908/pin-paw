import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sighting edit form shares create surface rhythm and limits photos to one", async () => {
  const [editForm, page, essentials] = await Promise.all([
    readFile(
      "src/features/sightings/components/SightingEditForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(tabs)/my/sightings/[sightingId]/edit/page.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
  ]);

  assert.match(editForm, /<SightingEssentials/);
  assert.match(editForm, /<SightingOptionalDetails/);
  assert.match(editForm, /photoLabel="사진 \(1장\)"/);
  assert.match(editForm, /MAX_EDIT_PHOTOS = 1/);
  assert.match(editForm, /photo_keys\.slice\(0, MAX_EDIT_PHOTOS\)/);
  assert.match(editForm, /photos\.length !== MAX_EDIT_PHOTOS/);
  assert.doesNotMatch(editForm, /사진 \(1~3장\)/);
  assert.doesNotMatch(editForm, /lat\.toFixed|lng\.toFixed/);
  assert.doesNotMatch(editForm, /multiple/);
  assert.doesNotMatch(editForm, /\+ 추가/);

  assert.match(essentials, /photoLabel/);
  assert.match(essentials, /위치 수정/);
  assert.match(essentials, /formatSightingLocationStatus/);

  assert.match(page, /<BackLink href="\/my"/);
  assert.match(editForm, /variant="primary"/);
  assert.match(editForm, /수정 저장/);
  assert.match(editForm, />\s*취소\s*</);
  assert.match(
    editForm,
    /sticky bottom-\[calc\(var\(--bottom-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.75rem\)\]/
  );
});
