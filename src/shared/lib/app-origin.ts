export type AppOriginResult =
  | { ok: true; origin: string }
  | { ok: false; error: string };

export function parseAppOrigin(value: string | undefined): AppOriginResult {
  if (!value) {
    return { ok: false, error: "APP_ORIGIN is not configured" };
  }

  try {
    const url = new URL(value);
    const isLoopbackHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const isExactOrigin =
      value === value.trim() &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;

    if ((url.protocol !== "https:" && !isLoopbackHttp) || !isExactOrigin) {
      return {
        ok: false,
        error: "APP_ORIGIN must be an exact HTTPS origin",
      };
    }

    return { ok: true, origin: url.origin };
  } catch {
    return {
      ok: false,
      error: "APP_ORIGIN must be an exact HTTPS origin",
    };
  }
}

/**
 * Prefer APP_ORIGIN. In local development only, fall back to the current
 * request origin when APP_ORIGIN is missing so OAuth callbacks still work.
 */
export function resolveAppOrigin(
  configured: string | undefined,
  requestOrigin?: string | null
): AppOriginResult {
  const configuredResult = parseAppOrigin(configured);
  if (configuredResult.ok) return configuredResult;

  if (process.env.NODE_ENV === "development" && requestOrigin) {
    return parseAppOrigin(requestOrigin);
  }

  return configuredResult;
}

export function getInternalEmbeddingsProcessUrl(
  appOrigin: string | undefined,
  batch: number
): string | null {
  const result = parseAppOrigin(appOrigin);
  if (!result.ok) {
    return null;
  }

  return `${result.origin}/api/v1/internal/embeddings/process?batch=${batch}`;
}

export function getSafeOAuthRedirectUrl(
  appOrigin: string | undefined,
  redirect: string | null,
  requestOrigin?: string | null
): string | null {
  const result = resolveAppOrigin(appOrigin, requestOrigin);
  if (!result.ok) {
    return null;
  }

  const fallback = `${result.origin}/`;
  if (
    !redirect ||
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\")
  ) {
    return fallback;
  }

  const target = new URL(redirect, result.origin);
  return target.origin === result.origin ? target.toString() : fallback;
}
