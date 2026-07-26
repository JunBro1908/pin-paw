import type { SupabaseClient } from "@supabase/supabase-js";

type IdempotencyIdentity =
  | { ownerId: string; ipHash: null }
  | { ownerId: null; ipHash: string };

type IdempotencyReplayInput = IdempotencyIdentity & {
  scope: string;
  key: string;
  requestHash: string;
};

export type IdempotencyReplayResult =
  | { status: "miss" }
  | { status: "conflict" }
  | { status: "unavailable" }
  | { status: "hit"; response: unknown };

export async function getIdempotencyReplay(
  supabase: SupabaseClient,
  input: IdempotencyReplayInput
): Promise<IdempotencyReplayResult> {
  let query = supabase
    .from("idempotency_keys")
    .select("request_hash, response")
    .eq("scope", input.scope)
    .eq("key", input.key);

  query =
    input.ownerId === null
      ? query.is("owner_id", null)
      : query.eq("owner_id", input.ownerId);
  query =
    input.ipHash === null
      ? query.is("ip_hash", null)
      : query.eq("ip_hash", input.ipHash);

  const { data, error } = await query
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) return { status: "unavailable" };
  if (!data) return { status: "miss" };
  if (data.request_hash !== input.requestHash) {
    return { status: "conflict" };
  }
  return { status: "hit", response: data.response };
}
