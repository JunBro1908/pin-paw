import type { SupabaseClient } from "@supabase/supabase-js";

type UploadPurpose = "sighting_photo" | "lost_cover";

// Supabase signed upload URLs remain valid for two hours. Keep the intent row
// until that token is certainly unusable so a late upload can still be found
// and removed instead of becoming an untracked object.
const SIGNED_UPLOAD_URL_LIFETIME_MS = 2 * 60 * 60 * 1000;
const CLEANUP_CLOCK_SKEW_MS = 5 * 60 * 1000;

interface UploadIntentRow {
  object_key: string;
  bucket_id: string;
  purpose: UploadPurpose;
  owner_id: string | null;
  ip_hash: string;
  expected_content_type: "image/jpeg" | "image/png";
  expected_size_bytes: number;
  expires_at: string;
  consumed_at: string | null;
}

export type UploadIntentVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "intent_not_found"
        | "intent_identity_mismatch"
        | "intent_expired"
        | "object_unavailable"
        | "object_size_mismatch"
        | "object_type_mismatch"
        | "verification_unavailable";
    };

export function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

export function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

export async function verifyUploadIntents(
  supabase: SupabaseClient,
  input: {
    keys: string[];
    purpose: UploadPurpose;
    userId: string | null;
    ipHash: string;
  }
): Promise<UploadIntentVerificationResult> {
  const uniqueKeys = [...new Set(input.keys)];
  if (uniqueKeys.length !== input.keys.length || uniqueKeys.length === 0) {
    return { ok: false, reason: "intent_not_found" };
  }

  const { data, error } = await supabase
    .from("upload_intents")
    .select(
      "object_key, bucket_id, purpose, owner_id, ip_hash, expected_content_type, expected_size_bytes, expires_at, consumed_at"
    )
    .in("object_key", uniqueKeys);
  if (error) return { ok: false, reason: "verification_unavailable" };

  const intents = (data ?? []) as UploadIntentRow[];
  if (intents.length !== uniqueKeys.length) {
    return { ok: false, reason: "intent_not_found" };
  }

  const intentByKey = new Map(
    intents.map((intent) => [intent.object_key, intent])
  );
  const now = Date.now();
  for (const key of uniqueKeys) {
    const intent = intentByKey.get(key);
    if (!intent || intent.purpose !== input.purpose) {
      return { ok: false, reason: "intent_not_found" };
    }
    const identityMatches =
      input.userId !== null
        ? intent.owner_id === input.userId
        : intent.owner_id === null && intent.ip_hash === input.ipHash;
    if (!identityMatches) {
      return { ok: false, reason: "intent_identity_mismatch" };
    }
    // A response may be lost after the atomic domain RPC commits. Let that
    // already-consumed key reach the RPC so it can return the cached response
    // for the same idempotency key or reject a different one. Never download or
    // re-verify an object that the database has already bound to a domain row.
    if (intent.consumed_at) {
      continue;
    }
    if (
      !Number.isFinite(Date.parse(intent.expires_at)) ||
      Date.parse(intent.expires_at) <= now
    ) {
      return { ok: false, reason: "intent_expired" };
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(intent.bucket_id)
      .download(intent.object_key);
    if (downloadError || !blob) {
      return { ok: false, reason: "object_unavailable" };
    }
    if (blob.size !== Number(intent.expected_size_bytes)) {
      return { ok: false, reason: "object_size_mismatch" };
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const typeMatches =
      intent.expected_content_type === "image/jpeg"
        ? isJpeg(bytes)
        : isPng(bytes);
    if (!typeMatches) {
      return { ok: false, reason: "object_type_mismatch" };
    }
  }

  const { error: verificationError } = await supabase
    .from("upload_intents")
    .update({ verified_at: new Date().toISOString() })
    .in("object_key", uniqueKeys)
    .is("consumed_at", null);
  return verificationError
    ? { ok: false, reason: "verification_unavailable" }
    : { ok: true };
}

export async function cleanupExpiredUploadIntents(
  supabase: SupabaseClient,
  batchSize = 100
): Promise<
  | { ok: true; inspected: number; removed: number }
  | { ok: false; reason: "cleanup_unavailable" }
> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    return { ok: false, reason: "cleanup_unavailable" };
  }

  const cleanupBefore = new Date(
    Date.now() - SIGNED_UPLOAD_URL_LIFETIME_MS - CLEANUP_CLOCK_SKEW_MS
  );
  const { data, error } = await supabase
    .from("upload_intents")
    .select("object_key, bucket_id")
    .is("consumed_at", null)
    .lt("created_at", cleanupBefore.toISOString())
    .limit(batchSize);
  if (error) return { ok: false, reason: "cleanup_unavailable" };

  const rows = (data ?? []) as Array<{ object_key: string; bucket_id: string }>;
  const removedKeys: string[] = [];
  const keysByBucket = new Map<string, string[]>();
  for (const row of rows) {
    const keys = keysByBucket.get(row.bucket_id) ?? [];
    keys.push(row.object_key);
    keysByBucket.set(row.bucket_id, keys);
  }

  for (const [bucket, keys] of keysByBucket) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(keys);
    if (!removeError) removedKeys.push(...keys);
  }

  if (removedKeys.length > 0) {
    const { error: deleteError } = await supabase
      .from("upload_intents")
      .delete()
      .in("object_key", removedKeys)
      .is("consumed_at", null);
    if (deleteError) return { ok: false, reason: "cleanup_unavailable" };
  }

  return { ok: true, inspected: rows.length, removed: removedKeys.length };
}

interface StorageCleanupJob {
  id: string;
  bucket_id: string;
  object_key: string;
  lease_token: string;
}

export async function cleanupQueuedStorageObjects(
  supabase: SupabaseClient,
  batchSize = 100
): Promise<
  | { ok: true; inspected: number; removed: number }
  | { ok: false; reason: "cleanup_unavailable" }
> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    return { ok: false, reason: "cleanup_unavailable" };
  }
  const { data, error } = await supabase.rpc("lease_storage_cleanup_jobs", {
    p_batch_size: batchSize,
    p_lease_seconds: 300,
  });
  if (error) return { ok: false, reason: "cleanup_unavailable" };

  const jobs = (data ?? []) as StorageCleanupJob[];
  let removed = 0;
  let finalizationFailed = false;
  for (const job of jobs) {
    const { error: removeError } = await supabase.storage
      .from(job.bucket_id)
      .remove([job.object_key]);
    if (removeError) {
      const { error: failError } = await supabase.rpc(
        "fail_storage_cleanup_job",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_code: "storage_delete_failed",
        }
      );
      if (failError) finalizationFailed = true;
      continue;
    }

    const { data: completed, error: completeError } = await supabase.rpc(
      "complete_storage_cleanup_job",
      {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
      }
    );
    if (completeError || completed !== true) {
      finalizationFailed = true;
      continue;
    }
    removed += 1;
  }

  return finalizationFailed
    ? { ok: false, reason: "cleanup_unavailable" }
    : { ok: true, inspected: jobs.length, removed };
}
