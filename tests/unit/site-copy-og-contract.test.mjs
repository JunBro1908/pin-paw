import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("site copy exposes metadata fields for OG and layout", async () => {
  const { SITE_COPY } = await import("../../src/shared/constants/site-copy.ts");

  assert.equal(SITE_COPY.brandName, "PinPaw");
  assert.match(SITE_COPY.description, /가족의 품/);
  assert.equal(SITE_COPY.tagline, "함께 이어져, 다시 집으로");
  assert.match(SITE_COPY.ogTitle, /PinPaw/);
  assert.ok(SITE_COPY.ogImageAlt.length > 4);
});

test("brand assets are split into og and favicon paths", async () => {
  await access("public/brand/og.png");
  await access("public/brand/favicon.png");

  const og = await readFile("src/app/opengraph-image.tsx", "utf8");
  const icon = await readFile("src/app/icon.tsx", "utf8");
  const layout = await readFile("src/app/layout.tsx", "utf8");

  assert.match(og, /public\/brand\/og\.png/);
  assert.match(icon, /public\/brand\/favicon\.png/);
  assert.match(layout, /SITE_COPY\.ogTitle/);
  assert.doesNotMatch(og, /pinpaw-mascot-icon/);
  assert.doesNotMatch(icon, /pinpaw-mascot-icon/);
});
