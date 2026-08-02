import { processAccountDeletionJob } from "@/shared/lib/account-deletion-worker";
import { parsePagination } from "@/shared/lib/api-input";
import { createCronAuthorizedValue } from "@/shared/lib/cron-auth";
import { createServiceRoleSupabase } from "@/shared/supabase/server";

interface ClaimedDeletionJob {
  id: string;
  user_id: string;
  lease_token: string;
  lost_photo_keys: string[];
  sighting_photo_keys: string[];
}

export async function POST(request: Request) {
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

  const batch = parsePagination(
    new URL(request.url).searchParams.get("batch"),
    null,
    5,
    10
  );
  if (!batch.ok) {
    return Response.json(
      { success: false, error: "Invalid batch" },
      { status: 400 }
    );
  }

  const supabase = authorization.value;
  const { data, error } = await supabase.rpc("claim_account_deletion_jobs", {
    p_batch_size: batch.value.limit,
    p_lease_seconds: 300,
  });
  if (error || !Array.isArray(data)) {
    return Response.json(
      { success: false, error: "Deletion queue unavailable" },
      { status: 503 }
    );
  }

  let processed = 0;
  let failed = 0;
  let lostLease = 0;
  for (const row of data as ClaimedDeletionJob[]) {
    const job = {
      id: row.id,
      userId: row.user_id,
      leaseToken: row.lease_token,
      lostPhotoKeys: row.lost_photo_keys ?? [],
      sightingPhotoKeys: row.sighting_photo_keys ?? [],
    };
    const result = await processAccountDeletionJob(job, {
      ensureBanned: async (userId) => {
        const { error: banError } = await supabase.auth.admin.updateUserById(
          userId,
          {
            ban_duration: "876000h",
          }
        );
        const alreadyDeleted =
          banError != null && "status" in banError && banError.status === 404;
        return { ok: banError == null || alreadyDeleted };
      },
      removeStorage: async (bucket, keys) => {
        if (keys.length === 0) return { ok: true };
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(keys);
        return { ok: removeError == null };
      },
      cleanupDatabase: async (input) => {
        const { data: cleaned, error: cleanupError } = await supabase.rpc(
          "cleanup_account_deletion_data",
          {
            p_job_id: input.id,
            p_lease_token: input.leaseToken,
          }
        );
        return { ok: cleanupError == null && cleaned === true };
      },
      deleteAuthUser: async (userId) => {
        const { error: authError } =
          await supabase.auth.admin.deleteUser(userId);
        const notFound =
          authError != null &&
          "status" in authError &&
          authError.status === 404;
        return { ok: authError == null, notFound };
      },
      complete: async (input) => {
        const { data: completed, error: completionError } = await supabase.rpc(
          "complete_account_deletion",
          {
            p_job_id: input.id,
            p_lease_token: input.leaseToken,
          }
        );
        return { ok: completionError == null && completed === true };
      },
    });

    if (result.ok) {
      processed++;
      continue;
    }
    const { data: recorded, error: failureError } = await supabase.rpc(
      "fail_account_deletion_job",
      {
        p_job_id: job.id,
        p_lease_token: job.leaseToken,
        p_error_code: result.code,
      }
    );
    if (failureError || recorded !== true) lostLease++;
    failed++;
  }

  return Response.json(
    {
      success: failed === 0,
      processed,
      failed,
      lostLease,
    },
    { status: failed === 0 ? 200 : 503 }
  );
}

export const GET = POST;
