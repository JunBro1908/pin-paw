import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(path, "utf8");
}

test("release packet remains on HOLD while external evidence is outstanding", async () => {
  const packet = await source("artifacts/security/release-packet.md");
  const review = await source("docs/SECURITY_OPERATING_ARCHITECTURE_REVIEW.md");

  assert.match(packet, /상태:\s*\*\*HOLD — 공개 운영 전환 승인 불가\*\*/);
  assert.match(
    packet,
    /- \[x\] Supabase CLI\/Docker로 빈 DB migration replay 성공/
  );
  for (const blocker of [
    "backup restore rehearsal 및 checksum 비교",
    "production secret rotation 및 이전 값 revoke 증거",
  ]) {
    assert.match(packet, new RegExp(`- \\[ \\] ${blocker}`));
  }

  const findingIds = [...review.matchAll(/^#### (SEC-[A-Z0-9-]+)/gm)].map(
    (match) => match[1]
  );
  assert.equal(new Set(findingIds).size, findingIds.length);
});
