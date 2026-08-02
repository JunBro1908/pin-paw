import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadRecommendationInteractionModule() {
  try {
    return await import("../../src/features/recommendations/lib/recommendation-interaction.ts");
  } catch (error) {
    assert.fail(`recommendation interaction module must exist: ${error}`);
  }
}

test("editing a draft range does not alter the applied request range", async () => {
  const { createRangeState, updateDraftRange } =
    await loadRecommendationInteractionModule();
  const initial = createRangeState({ radiusKm: 8, days: 8 });
  const edited = updateDraftRange(initial, { radiusKm: 20 });

  assert.deepEqual(edited, {
    draft: { radiusKm: 20, days: 8 },
    applied: { radiusKm: 8, days: 8 },
  });
  assert.deepEqual(initial.applied, { radiusKm: 8, days: 8 });
});

test("applying a range atomically promotes the complete draft", async () => {
  const { applyDraftRange, createRangeState, updateDraftRange } =
    await loadRecommendationInteractionModule();
  const edited = updateDraftRange(
    updateDraftRange(createRangeState({ radiusKm: 8, days: 8 }), {
      radiusKm: 20,
    }),
    { days: 14 }
  );

  assert.deepEqual(applyDraftRange(edited), {
    draft: { radiusKm: 20, days: 14 },
    applied: { radiusKm: 20, days: 14 },
  });
  const unchanged = createRangeState({ radiusKm: 8, days: 8 });
  assert.equal(applyDraftRange(unchanged), unchanged);
});

test("a newer request owner invalidates every older request", async () => {
  const { createRecommendationRequestGuard } =
    await loadRecommendationInteractionModule();
  const guard = createRecommendationRequestGuard();
  const first = guard.begin("lost-a:8:8");
  const second = guard.begin("lost-a:20:14");

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

test("page keeps draft controls separate from the applied request and funnel range", async () => {
  const page = await readFile("src/app/(tabs)/recommend/page.tsx", "utf8");

  assert.match(page, /range\.draft\.radiusKm/);
  assert.match(page, /range\.draft\.days/);
  assert.match(page, /range\.applied\.radiusKm/);
  assert.match(page, /range\.applied\.days/);
  assert.match(page, /applyDraftRange/);
});

test("hook aborts superseded work and only publishes the current owner key", async () => {
  const hook = await readFile(
    "src/features/recommendations/hooks/useRecommendations.ts",
    "utf8"
  );

  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /signal:\s*controller\.signal/);
  assert.match(hook, /createRecommendationRequestGuard/);
  assert.match(hook, /guard\.isCurrent\(requestOwner\)/);
  assert.match(hook, /state\.key === requestKey/);
});
