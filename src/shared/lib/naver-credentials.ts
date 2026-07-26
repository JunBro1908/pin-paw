/**
 * Naver credentials: Maps (NCP) and Search (developers.naver.com) are separate.
 *
 * Client bundles only inline NEXT_PUBLIC_* when accessed as a static
 * `process.env.NEXT_PUBLIC_...` expression. Do not read them via a passed-in
 * `env` object in production client paths.
 */

export function getNaverSearchCredentials(env?: NodeJS.ProcessEnv): {
  clientId: string | undefined;
  clientSecret: string | undefined;
} {
  if (env) {
    return {
      clientId:
        env.NEXT_PUBLIC_NAVER_CLIENT_ID?.trim() ||
        env.NAVER_CLIENT_ID?.trim() ||
        undefined,
      clientSecret:
        env.NEXT_PUBLIC_NAVER_SECRET?.trim() ||
        env.NAVER_CLIENT_SECRET?.trim() ||
        undefined,
    };
  }

  return {
    clientId:
      process.env.NEXT_PUBLIC_NAVER_CLIENT_ID?.trim() ||
      process.env.NAVER_CLIENT_ID?.trim() ||
      undefined,
    clientSecret:
      process.env.NEXT_PUBLIC_NAVER_SECRET?.trim() ||
      process.env.NAVER_CLIENT_SECRET?.trim() ||
      undefined,
  };
}

/** Browser Maps JS ncpKeyId. */
export function getNaverMapsClientId(
  env?: NodeJS.ProcessEnv
): string | undefined {
  if (env) {
    return (
      env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ||
      env.NAVER_MAP_CLIENT_ID?.trim() ||
      undefined
    );
  }

  return (
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ||
    process.env.NAVER_MAP_CLIENT_ID?.trim() ||
    undefined
  );
}
