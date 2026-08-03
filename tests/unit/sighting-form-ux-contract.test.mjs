import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sighting form separates essentials from optional details", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  assert.match(form, /<SightingEssentials/);
  assert.match(form, /<SightingOptionalDetails/);
  assert.match(form, /toLocalDateTimeInputValue/);
  assert.doesNotMatch(form, /lat\.toFixed|lng\.toFixed|🐾/u);
});

test("photo control is semantic and optional section stays in-page", async () => {
  const [essentials, optional] = await Promise.all([
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);
  assert.match(essentials, /<label[^>]+htmlFor="sighting-photo"/);
  assert.match(essentials, /id="sighting-photo"/);
  assert.match(essentials, /aria-live="polite"/);
  assert.match(optional, /<details/);
  assert.match(optional, /추가 정보 입력하기 \(선택\)/);
  assert.match(optional, /idPrefix = "sighting"/);
  assert.match(optional, /const sizeId = `\$\{idPrefix\}-trait-size`/);
  assert.match(optional, /const speciesId = `\$\{idPrefix\}-trait-species`/);
  assert.match(optional, /htmlFor=\{sizeId\}/);
  assert.match(optional, /htmlFor=\{speciesId\}/);
  assert.match(optional, />\s*크기\s*</);
  assert.match(optional, />\s*종\s*</);
  assert.match(optional, /space-y-5/);
  assert.doesNotMatch(optional, /특징을 더 알려주기/);
  assert.doesNotMatch(optional, /색상 · 크기 · 종/);
  assert.match(
    essentials,
    /border-border-subtle bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3/
  );
  assert.match(essentials, /위치 수정/);
  assert.doesNotMatch(
    essentials,
    /위치 수정[\s\S]*?min-h-11/
  );
});

test("optional color input has an associated label", async () => {
  const optional = await readFile(
    "src/features/sightings/components/SightingOptionalDetails.tsx",
    "utf8"
  );

  assert.match(optional, /const colorId = `\$\{idPrefix\}-trait-color`/);
  assert.match(
    optional,
    /<label[^>]+htmlFor=\{colorId\}[^>]*>[^<]*색상[^<]*<\/label>/s
  );
  assert.match(optional, /id=\{colorId\}/);
  assert.match(optional, /name="traitColor"/);
});

test("required sighting time exposes localized application feedback", async () => {
  const essentials = await readFile(
    "src/features/sightings/components/SightingEssentials.tsx",
    "utf8"
  );

  assert.match(
    essentials,
    /type="datetime-local"[\s\S]*?required[\s\S]*?aria-describedby=\{timeError \? "sighting-time-error" : undefined\}/
  );
  assert.match(essentials, /id="sighting-time-error"[\s\S]*?role="alert"/);
  assert.match(essentials, /photoError/);
  assert.match(essentials, /locationError/);
});

test("submit action shares bottom navigation geometry and action tokens", async () => {
  const [form, layout, css] = await Promise.all([
    readFile("src/features/sightings/components/SightingForm.tsx", "utf8"),
    readFile("src/app/(tabs)/layout.tsx", "utf8"),
    readFile("src/app/globals.css", "utf8"),
  ]);

  assert.match(css, /--bottom-nav-height:\s*3\.5rem/);
  assert.match(
    form,
    /sticky bottom-\[calc\(var\(--bottom-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.75rem\)\]/
  );
  assert.match(layout, /h-\[var\(--bottom-nav-height\)\]/);
  assert.match(layout, /border-border-subtle bg-surface/);
  assert.match(form, /<Button[\s\S]*?variant="primary"/);
  assert.doesNotMatch(form, /sticky bottom-6|3\.5rem|bg-primary text-white/);
});

test("sighting controls only use defined warm and surface utilities", async () => {
  const [essentials, optional] = await Promise.all([
    readFile(
      "src/features/sightings/components/SightingEssentials.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);

  assert.doesNotMatch(`${essentials}\n${optional}`, /accent-warm-soft/);
});

test("optimistic sent screen precedes background registration work", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  const sending = form.indexOf('setSubmitPhase("sending")');
  const hold = form.indexOf("holdMs");
  const successFlip = form.indexOf(
    'prev === "sending" ? "success" : prev',
    hold
  );
  const registration = form.indexOf("await registerSighting(");
  const invalidate = form.indexOf("runBestEffort(async () =>", registration);

  assert.ok(sending >= 0, "sending phase should start on submit");
  assert.ok(hold > sending, "fake hold should follow sending phase");
  assert.ok(successFlip > hold, "success flip follows fake hold");
  assert.ok(registration >= 0, "domain registration should be present");
  assert.ok(
    invalidate > registration,
    "cache invalidation starts after registration"
  );
  const invalidationBlock = form.slice(
    invalidate,
    form.indexOf("});", invalidate) + 3
  );
  assert.match(
    invalidationBlock,
    /await import\("@\/features\/sightings\/hooks\/useMySightings"\)/
  );
  assert.doesNotMatch(invalidationBlock, /console\./);
});

test("submit shows send progress then transmitted confirmation", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );

  assert.match(form, /submitPhase/);
  assert.match(form, /제보를 전송하고 있어요/);
  assert.match(form, /role="progressbar"/);
  assert.match(form, /제보가 전송되었습니다/);
  assert.doesNotMatch(form, /소중한 제보가 전송되었습니다/);
  assert.match(form, /확인했어요/);
  assert.match(form, /useDialogFocus/);
  assert.match(form, /role="dialog"/);
  assert.match(form, /aria-modal="true"/);
  assert.match(form, /fixed inset-0/);
  assert.match(form, /bg-background-warm/);
  assert.match(form, /name="send"/);
  assert.doesNotMatch(form, /name="check"/);
  assert.match(form, /setSubmitPhase\("sending"\)/);
  assert.match(form, /prev === "sending" \? "success" : prev/);
  assert.match(form, /setSubmitPhase\("idle"\)/);
  assert.match(form, /type: "error"/);
  assert.doesNotMatch(form, /지도에서 확인|지도로 보러가기/);
  assert.doesNotMatch(form, /이어서 제보하기/);
  assert.doesNotMatch(form, /optimisticSent/);
  assert.doesNotMatch(form, /h-\[80vh\]/);
  assert.doesNotMatch(form, /제보가 지도에 등록되었습니다/);
  assert.match(form, /사진을 등록해주세요/);
  assert.match(form, /photoError=\{photoError\}/);
});
