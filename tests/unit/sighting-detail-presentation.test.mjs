import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getSightingDetailFields } from "../../src/features/sightings/lib/sighting-detail-presentation.ts";

test("formats sighting detail fields in a fixed order with explicit empty states", () => {
  assert.deepEqual(
    getSightingDetailFields({
      trait_species: "unknown",
      trait_size: "medium",
      trait_color: "검정 바탕에 흰 점",
      trait_tags: ["collar", "scar", "unknown-tag"],
      note: "공원 입구 쪽에서 봤어요",
    }),
    [
      { label: "종", value: "모름" },
      { label: "크기", value: "중형견" },
      { label: "색/무늬", value: "검정 바탕에 흰 점" },
      { label: "특이사항", value: "목줄 있음, 흉터" },
      { label: "메모", value: "공원 입구 쪽에서 봤어요" },
    ]
  );

  assert.deepEqual(getSightingDetailFields({}), [
    { label: "종", value: "정보 없음" },
    { label: "크기", value: "정보 없음" },
    { label: "색/무늬", value: "정보 없음" },
    { label: "특이사항", value: "없음" },
    { label: "메모", value: "없음" },
  ]);
});

test("sighting detail separates the header and keeps the info target larger than its glyph", async () => {
  const source = await readFile(
    "src/features/sightings/components/SightingDetailCard.tsx",
    "utf8"
  );

  assert.match(source, /min-h-11 min-w-11/);
  assert.match(source, /h-4 w-4/);
  assert.match(source, /<Icon name="info" size=\{10\}/);
  assert.match(source, /border-t border-border-subtle/);
});
