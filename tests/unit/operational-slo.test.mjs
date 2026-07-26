import assert from "node:assert/strict";
import test from "node:test";

import {
  SLO_THRESHOLDS,
  evaluateOperationalSnapshot,
  parseOperationalSnapshot,
} from "../../src/shared/lib/operational-slo.ts";

function healthySnapshot() {
  return {
    generatedAt: "2026-07-25T12:00:00.000Z",
    windowSeconds: 86400,
    api: {
      requests: 1000,
      serverErrors: 4,
      availabilityPercent: 99.6,
      errorRatePercent: 0.4,
      readP95Ms: 900,
      writeP95Ms: 1800,
    },
    embedding: { queueDepth: 2, oldestAgeSeconds: 30, failures: 0 },
    uploads: { orphanCandidates: 0, failedCleanups: 0 },
    moderation: { overdue: 0 },
    accountDeletion: { overdue: 0, failed: 0 },
    cost: {
      dailyEstimatedUsdMicros: 790000,
      dailyBudgetUsdMicros: 1000000,
      budgetUsedPercent: 79,
    },
  };
}

test("SLO defaults match the product targets", () => {
  assert.equal(SLO_THRESHOLDS.availabilityPercent, 99.5);
  assert.equal(SLO_THRESHOLDS.errorRatePercent, 1);
  assert.equal(SLO_THRESHOLDS.readP95Ms, 1000);
  assert.equal(SLO_THRESHOLDS.writeP95Ms, 2000);
  assert.deepEqual(SLO_THRESHOLDS.budgetPercent, {
    warning: 80,
    critical: 100,
  });
});

test("healthy bounded snapshot produces no alerts", () => {
  assert.deepEqual(evaluateOperationalSnapshot(healthySnapshot()), []);
});

test("warning and critical thresholds are deterministic", () => {
  const snapshot = healthySnapshot();
  snapshot.api.availabilityPercent = 98.9;
  snapshot.api.errorRatePercent = 1;
  snapshot.api.readP95Ms = 1001;
  snapshot.embedding.queueDepth = 500;
  snapshot.embedding.oldestAgeSeconds = 900;
  snapshot.embedding.failures = 1;
  snapshot.uploads.orphanCandidates = 1;
  snapshot.uploads.failedCleanups = 5;
  snapshot.moderation.overdue = 1;
  snapshot.accountDeletion.overdue = 5;
  snapshot.accountDeletion.failed = 1;
  snapshot.cost.budgetUsedPercent = 100;

  const alerts = evaluateOperationalSnapshot(snapshot);
  const byId = Object.fromEntries(alerts.map((alert) => [alert.id, alert]));

  assert.equal(byId["api.availability"].severity, "critical");
  assert.equal(byId["api.error_rate"].severity, "warning");
  assert.equal(byId["api.read_p95"].severity, "warning");
  assert.equal(byId["embedding.queue_depth"].severity, "critical");
  assert.equal(byId["embedding.oldest_age"].severity, "critical");
  assert.equal(byId["embedding.failures"].severity, "warning");
  assert.equal(byId["uploads.orphan_candidates"].severity, "warning");
  assert.equal(byId["uploads.failed_cleanups"].severity, "critical");
  assert.equal(byId["moderation.overdue"].severity, "warning");
  assert.equal(byId["account_deletion.overdue"].severity, "critical");
  assert.equal(byId["account_deletion.failed"].severity, "warning");
  assert.equal(byId["cost.daily_budget"].severity, "critical");
});

test("snapshot parser fails closed on identifiers and sensitive or unbounded fields", () => {
  const snapshot = healthySnapshot();
  assert.deepEqual(parseOperationalSnapshot(snapshot), {
    ok: true,
    value: snapshot,
  });

  for (const invalid of [
    { ...snapshot, userId: crypto.randomUUID() },
    { ...snapshot, note: "private" },
    { ...snapshot, token: "secret" },
    {
      ...snapshot,
      api: { ...snapshot.api, requests: Number.MAX_SAFE_INTEGER + 1 },
    },
    {
      ...snapshot,
      generatedAt: "not-a-date",
    },
  ]) {
    assert.deepEqual(parseOperationalSnapshot(invalid), {
      ok: false,
      reason: "invalid_snapshot",
    });
  }
});
