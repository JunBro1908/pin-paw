import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  traitTags: "src/shared/constants/traitTags.ts",
  optionalDetails: "src/features/sightings/components/SightingOptionalDetails.tsx",
  lostCreate: "src/features/lost-posts/components/LostPostForm.tsx",
  lostEdit: "src/features/lost-posts/components/LostPostEditForm.tsx",
  apiInput: "src/shared/lib/api-input.ts",
  lostCreateRoute: "src/app/api/v1/lost-posts/route.ts",
  lostEditRoute: "src/app/api/v1/lost-posts/[lostPostId]/route.ts",
};

test("lost-post and sighting forms share the five-tag and readable memo contract", async () => {
  const source = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, path]) => [
        key,
        await readFile(path, "utf8"),
      ])
    )
  );

  assert.match(source.traitTags, /export const TRAIT_TAGS_MAX = 5;/);
  assert.match(source.optionalDetails, /특이사항/);
  assert.match(source.optionalDetails, />\s*최대 \{maxTags\}개\s*</);
  assert.doesNotMatch(source.optionalDetails, /선택, 최대/);

  for (const form of [source.lostCreate, source.lostEdit]) {
    assert.match(form, /TRAIT_TAGS_MAX/);
    assert.doesNotMatch(form, /MAX_(?:TAG_SELECT_LOST_POST|EDIT_TAGS) = 8/);
  }

  assert.match(source.lostCreate, /bg-surface/);
  assert.match(source.lostCreate, /text-text-main/);
  assert.match(source.lostCreate, /placeholder:text-text-caption/);
  assert.doesNotMatch(source.lostCreate, /textarea[\s\S]{0,500}bg-white/);

  assert.match(source.apiInput, /tags\(input\.traitTags, TRAIT_TAGS_MAX\)/);
  assert.match(source.lostCreateRoute, /slice\(0, TRAIT_TAGS_MAX\)/);
  assert.match(source.lostEditRoute, /slice\(0, TRAIT_TAGS_MAX\)/);
});
