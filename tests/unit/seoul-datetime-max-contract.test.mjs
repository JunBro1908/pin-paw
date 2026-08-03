import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("datetime-local max is client-mounted Seoul clock only", async () => {
  const [hook, essentials, lostForm] = await Promise.all([
    readFile("src/shared/hooks/useSeoulDatetimeLocalMax.ts", "utf8"),
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
    readFile("src/features/lost-posts/components/LostPostForm.tsx", "utf8"),
  ]);

  assert.match(hook, /useSeoulDatetimeLocalMax/);
  assert.match(hook, /toLocalDatetimeLocalString/);
  assert.match(hook, /useState<string \| undefined>\(undefined\)/);
  assert.match(essentials, /useSeoulDatetimeLocalMax/);
  assert.match(essentials, /max=\{maxOccurredAt\}/);
  assert.doesNotMatch(
    essentials,
    /max=\{toLocalDateTimeInputValue\(new Date\(\)\)\}/
  );
  assert.match(lostForm, /useSeoulDatetimeLocalMax/);
  assert.match(lostForm, /max=\{maxLostAt\}/);
  assert.doesNotMatch(lostForm, /max=\{toLocalDatetimeLocalString\(\)\}/);
});
