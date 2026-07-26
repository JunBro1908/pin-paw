import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { createCronAuthorizedValue } from "@/shared/lib/cron-auth";
import {
  cleanupExpiredUploadIntents,
  cleanupQueuedStorageObjects,
} from "@/shared/lib/upload-intents";
import { recordOperationalCounter } from "@/shared/lib/operational-metrics";

export async function GET(request: Request) {
  const authorization = createCronAuthorizedValue(
    process.env.CRON_SECRET,
    request.headers.get("Authorization"),
    createServiceRoleSupabase
  );
  if (!authorization.ok) {
    return Response.json(
      { success: false, error: authorization.error },
      { status: authorization.status }
    );
  }

  const [expired, queued] = await Promise.all([
    cleanupExpiredUploadIntents(authorization.value),
    cleanupQueuedStorageObjects(authorization.value),
  ]);
  if (!expired.ok || !queued.ok) {
    await recordOperationalCounter(authorization.value, {
      metric: "upload_cleanup_failure",
    });
    return Response.json(
      { success: false, error: "Service unavailable" },
      { status: 503 }
    );
  }
  const inspected = expired.inspected + queued.inspected;
  const removed = expired.removed + queued.removed;
  const failedCleanups = inspected - removed;
  if (failedCleanups > 0) {
    await recordOperationalCounter(authorization.value, {
      metric: "upload_cleanup_failure",
      eventCount: failedCleanups,
    });
  }
  return Response.json({ success: true, data: { inspected, removed } });
}
