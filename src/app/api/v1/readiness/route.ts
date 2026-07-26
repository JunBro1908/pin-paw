import { NextResponse } from "next/server";
import { checkOperationalReadiness } from "@/shared/lib/operational-health";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { createServiceRoleSupabase } from "@/shared/supabase/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};
const PROBE_TIMEOUT_MS = 3_000;

export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/readiness");
  const readiness = await checkOperationalReadiness(process.env, async () => {
    const { error } = await createServiceRoleSupabase()
      .from("embeddings")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    return { error };
  });

  if (!readiness.ready) {
    if (readiness.reason === "configuration_missing") {
      logger.warn("readiness.configuration_missing", {
        missingConfiguration: readiness.missingConfiguration,
        status: 503,
      });
    } else {
      logger.error("readiness.dependency_unavailable", {
        dependency: "supabase",
        error: readiness.error,
        status: 503,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "서비스를 준비하는 중입니다.",
        },
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: { status: "ready" },
    },
    { headers: NO_STORE_HEADERS }
  );
}
