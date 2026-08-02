import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home report entry is a single SightingForm screen without intermediate routes", async () => {
  const page = await readFile("src/app/(tabs)/page.tsx", "utf8");
  assert.match(page, /<SightingForm\s*\/>/);
  assert.doesNotMatch(page, /step|wizard|Stepper/i);
  assert.match(page, /반려동물을 잃어버렸나요\?/);
  assert.doesNotMatch(page, /유실글 올리기/);
  assert.match(page, /href="\/my\/lost-posts\/new"/);
});

test("sighting form stays one essential screen with optional details collapsed", async () => {
  const [form, optional] = await Promise.all([
    readFile("src/features/sightings/components/SightingForm.tsx", "utf8"),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);
  assert.match(form, /<SightingEssentials/);
  assert.match(form, /<SightingOptionalDetails/);
  assert.match(optional, /<details/);
  assert.match(form, /소중한 제보가 전송되었습니다/);
  assert.match(form, /확인했어요/);
  assert.match(form, /h-\[80vh\]/);
  assert.match(form, /optimisticSent/);
  assert.doesNotMatch(form, /이어서 제보하기|지도로 보러가기|setTimeout/);
});

test("lost post create entry skips list hop and collapses optional traits", async () => {
  const [page, form] = await Promise.all([
    readFile("src/app/(tabs)/my/lost-posts/new/page.tsx", "utf8"),
    readFile("src/features/lost-posts/components/LostPostForm.tsx", "utf8"),
  ]);
  assert.match(page, /href="\/my"/);
  assert.doesNotMatch(page, /href="\/my\/lost-posts"/);
  assert.match(form, /<details/);
  assert.match(form, /추가 정보 입력하기 \(선택\)/);
  assert.doesNotMatch(form, /특징을 더 알려주기/);
  assert.doesNotMatch(form, /toFixed\(6\)/);
});
