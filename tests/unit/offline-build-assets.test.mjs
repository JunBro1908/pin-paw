import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the production build does not download Google fonts", async () => {
  const [layout, globalCss] = await Promise.all([
    readFile("src/app/layout.tsx", "utf8"),
    readFile("src/app/globals.css", "utf8"),
  ]);

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /Geist(?:_Mono)?\s*\(/);
  assert.doesNotMatch(globalCss, /--font-geist-/);
  assert.match(
    globalCss,
    /--font-sans:\s*-apple-system,\s*BlinkMacSystemFont,\s*"Apple SD Gothic Neo",\s*"Noto Sans KR",\s*"Malgun Gothic",\s*sans-serif/
  );
  assert.match(
    globalCss,
    /--font-mono:\s*"SFMono-Regular",\s*Consolas,\s*"Liberation Mono",\s*monospace/
  );
});
