/**
 * Pure fixed-window / cooldown helpers (unit-testable without DB).
 */

export function fixedWindowStartEpoch(
  epochSeconds: number,
  windowSeconds: number
): number {
  return Math.floor(epochSeconds / windowSeconds) * windowSeconds;
}

/**
 * Fixed-window allow check after incrementing within the bucket.
 * maxRequests=1 means one allow per aligned window.
 */
export function wouldFixedWindowAllow(options: {
  previousEpochSeconds: number | null;
  nextEpochSeconds: number;
  windowSeconds: number;
  maxRequests: number;
  previousCountInWindow?: number;
}): boolean {
  const {
    previousEpochSeconds,
    nextEpochSeconds,
    windowSeconds,
    maxRequests,
    previousCountInWindow = 0,
  } = options;

  if (previousEpochSeconds === null) return true;

  const prevWindow = fixedWindowStartEpoch(previousEpochSeconds, windowSeconds);
  const nextWindow = fixedWindowStartEpoch(nextEpochSeconds, windowSeconds);
  if (prevWindow !== nextWindow) return true;
  return previousCountInWindow + 1 <= maxRequests;
}

/**
 * Sliding cooldown: next request allowed only after cooldownSeconds
 * from the last allowed request.
 */
export function wouldCooldownAllow(options: {
  lastAllowedEpochSeconds: number | null;
  nextEpochSeconds: number;
  cooldownSeconds: number;
}): { allowed: boolean; retryAfterSeconds: number } {
  const { lastAllowedEpochSeconds, nextEpochSeconds, cooldownSeconds } =
    options;
  if (lastAllowedEpochSeconds === null) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const elapsed = nextEpochSeconds - lastAllowedEpochSeconds;
  if (elapsed >= cooldownSeconds) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(0, Math.ceil(cooldownSeconds - elapsed)),
  };
}
