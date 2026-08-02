import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function assertReadable(path) {
  await access(path);
}

test("terms and privacy App Router pages exist", async () => {
  await assertReadable("src/app/terms/page.tsx");
  await assertReadable("src/app/privacy/page.tsx");
  await assertReadable("src/features/legal/components/LegalDocument.tsx");
});

test("LoginPrompt policy links match public legal routes", async () => {
  const prompt = await readFile(
    "src/features/auth/components/LoginPrompt.tsx",
    "utf8"
  );
  const terms = await readFile("src/app/terms/page.tsx", "utf8");
  const privacy = await readFile("src/app/privacy/page.tsx", "utf8");

  assert.match(prompt, /href="\/terms"/);
  assert.match(prompt, /href="\/privacy"/);
  assert.match(terms, /이용약관/);
  assert.match(privacy, /개인정보 처리방침/);
  assert.match(terms, /LegalDocument/);
  assert.match(privacy, /LegalDocument/);
});

test("legal pages stay honest MVP guidance without overclaiming", async () => {
  const terms = await readFile("src/app/terms/page.tsx", "utf8");
  const privacy = await readFile("src/app/privacy/page.tsx", "utf8");
  const shell = await readFile(
    "src/features/legal/components/LegalDocument.tsx",
    "utf8"
  );

  assert.match(shell, /MVP 서비스 안내/);
  assert.match(terms, /법률 자문이 아닌|완벽한 약관이 아니라|MVP/);
  assert.match(privacy, /실제로 수집|솔직히|MVP/);
  assert.match(privacy, /카카오/);
  assert.match(privacy, /세션|쿠키/);
  assert.match(privacy, /사진/);
  assert.match(privacy, /위치/);
  assert.doesNotMatch(terms, /100%\s*보장|절대\s*보장|법적\s*효력을\s*완전/);
  assert.doesNotMatch(privacy, /절대\s*안전|완전\s*암호화로\s*보장/);
});
