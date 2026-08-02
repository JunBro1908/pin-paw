import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my activity leads with an active case and next actions", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<ActiveLostCaseCard/);
  assert.match(page, /<LostCaseNextActions/);
  assert.ok(page.indexOf("<ActiveLostCaseCard") < page.indexOf("displayEmail"));
  assert.match(page, /내 활동/);
});

test("active case card prioritizes confirmation and freshness", async () => {
  const card = await readFile(
    "src/features/lost-posts/components/ActiveLostCaseCard.tsx",
    "utf8"
  );
  assert.match(card, /찾는 중/);
  assert.match(card, /마지막 확인/);
  assert.match(card, /확인할 제보 보기/);
  assert.match(card, /\/recommend\?lostPostId=\$\{item\.id\}/);
  assert.match(card, /업데이트 중/);
});

test("next actions cover map, notifications, and case management", async () => {
  const actions = await readFile(
    "src/features/lost-posts/components/LostCaseNextActions.tsx",
    "utf8"
  );
  assert.match(actions, /지도에서 흔적 보기/);
  assert.match(actions, /알림 확인/);
  assert.match(actions, /사건 정보 관리/);
  assert.match(actions, /\/map\?lostPostId=\$\{lostPostId\}/);
  assert.match(actions, /\/my\/notifications/);
  assert.match(actions, /\/my\/lost-posts\/\$\{lostPostId\}/);
});

test("lost post list accepts parent-provided items without a second fetch", async () => {
  const list = await readFile(
    "src/features/lost-posts/components/LostPostList.tsx",
    "utf8"
  );
  assert.match(list, /items\?:/);
  assert.match(list, /enabled:\s*items\s*===\s*undefined/);
});

test("login prompt states the purpose and links policies", async () => {
  const prompt = await readFile(
    "src/features/auth/components/LoginPrompt.tsx",
    "utf8"
  );
  assert.match(prompt, /유실 사건을 이어서 관리하려면 로그인해 주세요/);
  assert.match(prompt, /href="\/terms"/);
  assert.match(prompt, /href="\/privacy"/);
  assert.doesNotMatch(prompt, /동의하는 것으로 간주됩니다/);
});
