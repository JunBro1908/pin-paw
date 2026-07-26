import { createCronAuthorizedValue } from "@/shared/lib/cron-auth";
import {
  evaluateOperationalSnapshot,
  parseOperationalSnapshot,
} from "@/shared/lib/operational-slo";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { observeServiceApiRequest } from "@/shared/lib/api-observability";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

async function getSnapshot(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/internal/operations/snapshot"
  );
  const authorization = createCronAuthorizedValue(
    process.env.CRON_SECRET,
    request.headers.get("Authorization"),
    createServiceRoleSupabase
  );
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.error },
      { status: authorization.status, headers: NO_STORE_HEADERS }
    );
  }

  const { data, error } = await authorization.value.rpc(
    "get_operational_snapshot"
  );
  if (error) {
    logger.error("operations.snapshot_unavailable", { error, status: 503 });
    return Response.json(
      { error: "Service unavailable" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = parseOperationalSnapshot(data);
  if (!parsed.ok) {
    logger.error("operations.snapshot_invalid", { status: 503 });
    return Response.json(
      { error: "Service unavailable" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const snapshot = parsed.value;
  const alerts = evaluateOperationalSnapshot(snapshot);
  return Response.json(
    { snapshot, alerts },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export function GET(request: Request) {
  return observeServiceApiRequest(
    request,
    {
      routeClass: "internal.read",
      route: "/api/v1/internal/operations/snapshot",
    },
    () => getSnapshot(request)
  );
}
