type CronAuthorizationFailure = {
  ok: false;
  status: 401 | 503;
  error: "Unauthorized" | "Service unavailable";
};

type CronAuthorizationResult = { ok: true } | CronAuthorizationFailure;

type CronAuthorizedValue<T> = { ok: true; value: T } | CronAuthorizationFailure;

export function getCronAuthorizationHeader(
  cronSecret: string | undefined
): string | null {
  if (!cronSecret || !cronSecret.trim() || cronSecret !== cronSecret.trim()) {
    return null;
  }

  return `Bearer ${cronSecret}`;
}

export function authorizeCronRequest(
  cronSecret: string | undefined,
  authorizationHeader: string | null
): CronAuthorizationResult {
  const expectedHeader = getCronAuthorizationHeader(cronSecret);

  if (!expectedHeader) {
    return {
      ok: false,
      status: 503,
      error: "Service unavailable",
    };
  }

  if (authorizationHeader !== expectedHeader) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  return { ok: true };
}

export function createCronAuthorizedValue<T>(
  cronSecret: string | undefined,
  authorizationHeader: string | null,
  createValue: () => T
): CronAuthorizedValue<T> {
  const authorization = authorizeCronRequest(cronSecret, authorizationHeader);

  if (!authorization.ok) {
    return authorization;
  }

  return {
    ok: true,
    value: createValue(),
  };
}

export function runWithCronAuthorizationHeader(
  cronSecret: string | undefined,
  callback: (authorizationHeader: string) => void
): boolean {
  const authorizationHeader = getCronAuthorizationHeader(cronSecret);

  if (!authorizationHeader) {
    return false;
  }

  callback(authorizationHeader);
  return true;
}
