import { parseAppOrigin } from "./app-origin.ts";

export const REQUIRED_READINESS_ENV = [
  "APP_ORIGIN",
  "CRON_SECRET",
  "NEXT_PUBLIC_NAVER_CLIENT_ID",
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_API_KEY",
  "SENTRY_DSN",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type ReadinessEnvironment = Record<string, string | undefined>;
type DependencyProbe = () => Promise<{ error: unknown | null }>;

export type OperationalReadiness =
  | { ready: true }
  | {
      ready: false;
      reason: "configuration_missing";
      missingConfiguration: string[];
    }
  | {
      ready: false;
      reason: "dependency_unavailable";
      error: unknown;
    };

export async function checkOperationalReadiness(
  environment: ReadinessEnvironment,
  probe: DependencyProbe
): Promise<OperationalReadiness> {
  const missingConfiguration = REQUIRED_READINESS_ENV.filter(
    (key) => !environment[key]?.trim()
  ).sort();

  if (
    environment.APP_ORIGIN?.trim() &&
    !parseAppOrigin(environment.APP_ORIGIN).ok
  ) {
    missingConfiguration.push("APP_ORIGIN");
    missingConfiguration.sort();
  }

  if (missingConfiguration.length > 0) {
    return {
      ready: false,
      reason: "configuration_missing",
      missingConfiguration,
    };
  }

  try {
    const result = await probe();
    if (result.error) {
      return {
        ready: false,
        reason: "dependency_unavailable",
        error: result.error,
      };
    }
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      reason: "dependency_unavailable",
      error,
    };
  }
}
