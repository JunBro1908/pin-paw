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
  assert.match(optional, /특징을 더 알려주기 \(선택\)/);
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

  assert.match(
    optional,
    /<label[^>]+htmlFor="sighting-trait-color"[^>]*>[^<]*색상[^<]*<\/label>/s
  );
  assert.match(optional, /<input[^>]+id="sighting-trait-color"/s);
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

test("domain success toast follows registration before best-effort cache invalidation", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  const registration = form.indexOf("await registerSighting(");
  const clearAttempt = form.indexOf(
    "submissionAttemptRef.current = completeSubmission()",
    registration
  );
  const toastSuccess = form.indexOf(
    'message: "제보가 성공적으로 등록되었습니다!"',
    clearAttempt
  );
  const invalidate = form.indexOf("runBestEffort(async () =>", toastSuccess);

  assert.ok(registration >= 0, "domain registration should be present");
  assert.ok(clearAttempt > registration, "attempt clears after registration");
  assert.ok(toastSuccess > clearAttempt, "success toast after attempt clears");
  assert.ok(
    invalidate > toastSuccess,
    "cache invalidation starts after domain success toast"
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

test("submit shows optimistic confirmation and defers result to toast", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );

  assert.match(form, /optimisticSent/);
  assert.match(form, /제보가 전송되었습니다/);
  assert.match(form, /setOptimisticSent\(true\)/);
  assert.ok(
    form.indexOf("setOptimisticSent(true)") <
      form.indexOf("await uploadPhoto("),
    "optimistic confirmation should appear before network upload"
  );
  assert.doesNotMatch(form, /지도에서 확인/);
  assert.doesNotMatch(form, /제보가 지도에 등록되었습니다/);
  assert.match(form, /사진을 등록해주세요/);
  assert.match(form, /photoError=\{photoError\}/);
});
