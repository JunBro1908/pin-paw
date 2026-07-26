export interface AccountDeletionJob {
  id: string;
  userId: string;
  leaseToken: string;
  lostPhotoKeys: string[];
  sightingPhotoKeys: string[];
}

interface StepResult {
  ok: boolean;
}

interface AuthDeleteResult extends StepResult {
  notFound?: boolean;
}

interface AccountDeletionDependencies {
  ensureBanned(userId: string): Promise<StepResult>;
  removeStorage(bucket: "lost" | "sightings", keys: string[]): Promise<StepResult>;
  cleanupDatabase(job: AccountDeletionJob): Promise<StepResult>;
  deleteAuthUser(userId: string): Promise<AuthDeleteResult>;
  complete(job: AccountDeletionJob): Promise<StepResult>;
}

export type AccountDeletionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "auth_ban_failed"
        | "storage_delete_failed"
        | "database_cleanup_failed"
        | "auth_delete_failed"
        | "completion_failed";
    };

export async function processAccountDeletionJob(
  job: AccountDeletionJob,
  dependencies: AccountDeletionDependencies
): Promise<AccountDeletionResult> {
  const ban = await dependencies.ensureBanned(job.userId);
  if (!ban.ok) {
    return { ok: false, code: "auth_ban_failed" };
  }

  const lostStorage = await dependencies.removeStorage(
    "lost",
    job.lostPhotoKeys
  );
  if (!lostStorage.ok) {
    return { ok: false, code: "storage_delete_failed" };
  }

  const sightingStorage = await dependencies.removeStorage(
    "sightings",
    job.sightingPhotoKeys
  );
  if (!sightingStorage.ok) {
    return { ok: false, code: "storage_delete_failed" };
  }

  const database = await dependencies.cleanupDatabase(job);
  if (!database.ok) {
    return { ok: false, code: "database_cleanup_failed" };
  }

  const auth = await dependencies.deleteAuthUser(job.userId);
  if (!auth.ok && !auth.notFound) {
    return { ok: false, code: "auth_delete_failed" };
  }

  const completion = await dependencies.complete(job);
  return completion.ok
    ? { ok: true }
    : { ok: false, code: "completion_failed" };
}
