import { parseAccountDeletionRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import {
  createServerSupabaseClient,
  createServiceRoleSupabase,
  getVerifiedUser,
} from "@/shared/supabase/server";

interface DeletionRequestResult {
  id: string;
  status: "awaiting_ban" | "queued" | "processing" | "retry" | "failed";
  requestedAt: string;
  deleteDueAt: string;
  backupExpiryDueAt: string;
}

function unavailable() {
  return Response.json(
    { success: false, error: "Service unavailable" },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  const body = await readJsonBody(request, 1024);
  if (!body.ok) {
    return Response.json(
      { success: false, error: "Invalid request" },
      { status: body.reason === "body_too_large" ? 413 : 400 }
    );
  }
  const parsed = parseAccountDeletionRequest(body.value);
  if (!parsed.ok) {
    return Response.json(
      { success: false, error: "Invalid confirmation" },
      { status: 400 }
    );
  }

  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.access_token) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const { user } = await getVerifiedUser(userClient, session.access_token, {
    allowDeletionPending: true,
  });
  if (!user) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await userClient.rpc("request_account_deletion");
  const deletion = data as DeletionRequestResult | null;
  if (error || !deletion?.id) return unavailable();

  if (deletion.status !== "awaiting_ban") {
    return Response.json({ success: true, data: deletion }, { status: 202 });
  }

  const adminClient = createServiceRoleSupabase();
  const { error: banError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { ban_duration: "876000h" }
  );
  if (banError) {
    const { error: cancelError } = await adminClient.rpc(
      "cancel_account_deletion",
      { p_job_id: deletion.id, p_user_id: user.id }
    );
    if (cancelError) return unavailable();
    return unavailable();
  }

  let { data: activated, error: activationError } = await adminClient.rpc(
    "activate_account_deletion",
    { p_job_id: deletion.id, p_user_id: user.id }
  );
  if (activationError) {
    const retry = await adminClient.rpc("activate_account_deletion", {
      p_job_id: deletion.id,
      p_user_id: user.id,
    });
    activated = retry.data;
    activationError = retry.error;
  }
  if (activationError || activated !== true) {
    // Do not unban on an ambiguous activation result: the worker can safely
    // recover awaiting_ban jobs by confirming the ban before any deletion.
    return unavailable();
  }

  return Response.json(
    {
      success: true,
      data: { ...deletion, status: "queued" },
    },
    { status: 202 }
  );
}
