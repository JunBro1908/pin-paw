import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("site copy exposes metadata fields for OG and layout", async () => {
  const { SITE_COPY } = await import("../../src/shared/constants/site-copy.ts");

  assert.equal(SITE_COPY.brandName, "PinPaw");
  assert.match(SITE_COPY.description, /가족의 품/);
  assert.equal(SITE_COPY.tagline, "작은 제보들이 만든 발자취");
  assert.equal(SITE_COPY.ogTitle, "PinPaw 작은 제보들이 만든 발자취");
  assert.ok(SITE_COPY.ogImageAlt.length > 4);
});

test("brand assets are split into og and favicon paths", async () => {
  await access("public/brand/og.png");
  await access("public/brand/favicon.png");
  await access("src/app/favicon.ico");
  await access("src/app/icon.png");

  const og = await readFile("src/app/opengraph-image.tsx", "utf8");
  const layout = await readFile("src/app/layout.tsx", "utf8");

  assert.match(og, /public\/brand\/og\.png/);
  assert.match(layout, /SITE_COPY\.ogTitle/);
  assert.doesNotMatch(og, /pinpaw-mascot-icon/);
});
