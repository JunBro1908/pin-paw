export const SLO_THRESHOLDS = {
  availabilityPercent: 99.5,
  errorRatePercent: 1,
  readP95Ms: 1_000,
  writeP95Ms: 2_000,
  budgetPercent: { warning: 80, critical: 100 },
  embedding: {
    queueDepth: { warning: 100, critical: 500 },
    oldestAgeSeconds: { warning: 300, critical: 900 },
    failures: { warning: 1, critical: 10 },
  },
  uploads: {
    orphanCandidates: { warning: 1, critical: 100 },
    failedCleanups: { warning: 1, critical: 5 },
  },
  moderationOverdue: { warning: 1, critical: 10 },
  accountDeletion: {
    overdue: { warning: 1, critical: 5 },
    failed: { warning: 1, critical: 5 },
  },
} as const;

export interface OperationalSnapshot {
  generatedAt: string;
  windowSeconds: 86400;
  api: {
    requests: number;
    serverErrors: number;
    availabilityPercent: number | null;
    errorRatePercent: number | null;
    readP95Ms: number | null;
    writeP95Ms: number | null;
  };
  embedding: {
    queueDepth: number;
    oldestAgeSeconds: number;
    failures: number;
  };
  uploads: {
    orphanCandidates: number;
    failedCleanups: number;
  };
  moderation: { overdue: number };
  accountDeletion: { overdue: number; failed: number };
  cost: {
    dailyEstimatedUsdMicros: number;
    dailyBudgetUsdMicros: number;
    budgetUsedPercent: number | null;
  };
}

export interface OperationalAlert {
  id: string;
  severity: "warning" | "critical";
  metric: string;
  value: number | null;
  threshold: number | null;
}

const MAX_COUNT = 1_000_000_000;
const MAX_COST_USD_MICROS = 1_000_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isBoundedNumber(
  value: unknown,
  maximum: number,
  nullable = false
): boolean {
  return (
    (nullable && value === null) ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= maximum)
  );
}

export function parseOperationalSnapshot(
  input: unknown
):
  | { ok: true; value: OperationalSnapshot }
  | { ok: false; reason: "invalid_snapshot" } {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "generatedAt",
      "windowSeconds",
      "api",
      "embedding",
      "uploads",
      "moderation",
      "accountDeletion",
      "cost",
    ]) ||
    typeof input.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    input.windowSeconds !== 86400
  ) {
    return { ok: false, reason: "invalid_snapshot" };
  }

  const { api, embedding, uploads, moderation, accountDeletion, cost } = input;
  if (
    !isRecord(api) ||
    !hasExactKeys(api, [
      "requests",
      "serverErrors",
      "availabilityPercent",
      "errorRatePercent",
      "readP95Ms",
      "writeP95Ms",
    ]) ||
    !isBoundedNumber(api.requests, MAX_COUNT) ||
    !isBoundedNumber(api.serverErrors, MAX_COUNT) ||
    !isBoundedNumber(api.availabilityPercent, 100, true) ||
    !isBoundedNumber(api.errorRatePercent, 100, true) ||
    !isBoundedNumber(api.readP95Ms, 60_000, true) ||
    !isBoundedNumber(api.writeP95Ms, 60_000, true) ||
    !isRecord(embedding) ||
    !hasExactKeys(embedding, [
      "queueDepth",
      "oldestAgeSeconds",
      "failures",
    ]) ||
    !isBoundedNumber(embedding.queueDepth, MAX_COUNT) ||
    !isBoundedNumber(embedding.oldestAgeSeconds, 31_536_000) ||
    !isBoundedNumber(embedding.failures, MAX_COUNT) ||
    !isRecord(uploads) ||
    !hasExactKeys(uploads, ["orphanCandidates", "failedCleanups"]) ||
    !isBoundedNumber(uploads.orphanCandidates, MAX_COUNT) ||
    !isBoundedNumber(uploads.failedCleanups, MAX_COUNT) ||
    !isRecord(moderation) ||
    !hasExactKeys(moderation, ["overdue"]) ||
    !isBoundedNumber(moderation.overdue, MAX_COUNT) ||
    !isRecord(accountDeletion) ||
    !hasExactKeys(accountDeletion, ["overdue", "failed"]) ||
    !isBoundedNumber(accountDeletion.overdue, MAX_COUNT) ||
    !isBoundedNumber(accountDeletion.failed, MAX_COUNT) ||
    !isRecord(cost) ||
    !hasExactKeys(cost, [
      "dailyEstimatedUsdMicros",
      "dailyBudgetUsdMicros",
      "budgetUsedPercent",
    ]) ||
    !isBoundedNumber(cost.dailyEstimatedUsdMicros, MAX_COST_USD_MICROS) ||
    !isBoundedNumber(cost.dailyBudgetUsdMicros, MAX_COST_USD_MICROS) ||
    !isBoundedNumber(cost.budgetUsedPercent, 100_000, true)
  ) {
    return { ok: false, reason: "invalid_snapshot" };
  }

  return { ok: true, value: input as unknown as OperationalSnapshot };
}

function thresholdAlert(
  id: string,
  metric: string,
  value: number,
  warning: number,
  critical: number
): OperationalAlert | null {
  if (value >= critical) {
    return { id, metric, severity: "critical", value, threshold: critical };
  }
  if (value >= warning) {
    return { id, metric, severity: "warning", value, threshold: warning };
  }
  return null;
}

export function evaluateOperationalSnapshot(
  snapshot: OperationalSnapshot
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const push = (alert: OperationalAlert | null) => {
    if (alert) alerts.push(alert);
  };
  const missing = (id: string, metric: string) =>
    alerts.push({
      id,
      metric,
      severity: "critical",
      value: null,
      threshold: null,
    });

  if (snapshot.api.availabilityPercent === null) {
    missing("api.availability", "availabilityPercent");
  } else if (
    snapshot.api.availabilityPercent < SLO_THRESHOLDS.availabilityPercent
  ) {
    alerts.push({
      id: "api.availability",
      metric: "availabilityPercent",
      severity:
        snapshot.api.availabilityPercent < 99 ? "critical" : "warning",
      value: snapshot.api.availabilityPercent,
      threshold: SLO_THRESHOLDS.availabilityPercent,
    });
  }

  if (snapshot.api.errorRatePercent === null) {
    missing("api.error_rate", "errorRatePercent");
  } else if (
    snapshot.api.errorRatePercent >= SLO_THRESHOLDS.errorRatePercent
  ) {
    alerts.push({
      id: "api.error_rate",
      metric: "errorRatePercent",
      severity: snapshot.api.errorRatePercent >= 2 ? "critical" : "warning",
      value: snapshot.api.errorRatePercent,
      threshold: SLO_THRESHOLDS.errorRatePercent,
    });
  }

  for (const [id, metric, value, warning] of [
    [
      "api.read_p95",
      "readP95Ms",
      snapshot.api.readP95Ms,
      SLO_THRESHOLDS.readP95Ms,
    ],
    [
      "api.write_p95",
      "writeP95Ms",
      snapshot.api.writeP95Ms,
      SLO_THRESHOLDS.writeP95Ms,
    ],
  ] as const) {
    if (value === null) missing(id, metric);
    else push(thresholdAlert(id, metric, value, warning + 1, warning * 2));
  }

  const thresholdMetrics = [
    [
      "embedding.queue_depth",
      "queueDepth",
      snapshot.embedding.queueDepth,
      SLO_THRESHOLDS.embedding.queueDepth,
    ],
    [
      "embedding.oldest_age",
      "oldestAgeSeconds",
      snapshot.embedding.oldestAgeSeconds,
      SLO_THRESHOLDS.embedding.oldestAgeSeconds,
    ],
    [
      "embedding.failures",
      "failures",
      snapshot.embedding.failures,
      SLO_THRESHOLDS.embedding.failures,
    ],
    [
      "uploads.orphan_candidates",
      "orphanCandidates",
      snapshot.uploads.orphanCandidates,
      SLO_THRESHOLDS.uploads.orphanCandidates,
    ],
    [
      "uploads.failed_cleanups",
      "failedCleanups",
      snapshot.uploads.failedCleanups,
      SLO_THRESHOLDS.uploads.failedCleanups,
    ],
    [
      "moderation.overdue",
      "overdue",
      snapshot.moderation.overdue,
      SLO_THRESHOLDS.moderationOverdue,
    ],
    [
      "account_deletion.overdue",
      "overdue",
      snapshot.accountDeletion.overdue,
      SLO_THRESHOLDS.accountDeletion.overdue,
    ],
    [
      "account_deletion.failed",
      "failed",
      snapshot.accountDeletion.failed,
      SLO_THRESHOLDS.accountDeletion.failed,
    ],
  ] as const;
  for (const [id, metric, value, threshold] of thresholdMetrics) {
    push(
      thresholdAlert(
        id,
        metric,
        value,
        threshold.warning,
        threshold.critical
      )
    );
  }

  if (snapshot.cost.budgetUsedPercent !== null) {
    push(
      thresholdAlert(
        "cost.daily_budget",
        "budgetUsedPercent",
        snapshot.cost.budgetUsedPercent,
        SLO_THRESHOLDS.budgetPercent.warning,
        SLO_THRESHOLDS.budgetPercent.critical
      )
    );
  }

  return alerts;
}
