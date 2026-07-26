import assert from "node:assert/strict";
import test from "node:test";

let processAccountDeletionJob;
try {
  ({ processAccountDeletionJob } = await import(
    "../../src/shared/lib/account-deletion-worker.ts"
  ));
} catch {
  // RED: the deletion worker orchestration does not exist yet.
}

const job = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  userId: "123e4567-e89b-42d3-a456-426614174001",
  leaseToken: "123e4567-e89b-42d3-a456-426614174002",
  lostPhotoKeys: ["lost_cover/20260725/a.jpg"],
  sightingPhotoKeys: ["sighting_photo/20260725/b.jpg"],
};

test("does not touch storage until the account ban is confirmed", async () => {
  let storageCalled = false;
  const result = await processAccountDeletionJob?.(job, {
    ensureBanned: async () => ({ ok: false }),
    removeStorage: async () => {
      storageCalled = true;
      return { ok: true };
    },
    cleanupDatabase: async () => ({ ok: true }),
    deleteAuthUser: async () => ({ ok: true }),
    complete: async () => ({ ok: true }),
  });

  assert.deepEqual(result, { ok: false, code: "auth_ban_failed" });
  assert.equal(storageCalled, false);
});

test("stops before database and auth cleanup when storage removal fails", async () => {
  const calls = [];
  const result = await processAccountDeletionJob?.(job, {
    ensureBanned: async () => {
      calls.push("ban");
      return { ok: true };
    },
    removeStorage: async (bucket) => {
      calls.push(`storage:${bucket}`);
      return { ok: false };
    },
    cleanupDatabase: async () => {
      calls.push("database");
      return { ok: true };
    },
    deleteAuthUser: async () => {
      calls.push("auth");
      return { ok: true };
    },
    complete: async () => {
      calls.push("complete");
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: false, code: "storage_delete_failed" });
  assert.deepEqual(calls, ["ban", "storage:lost"]);
});

test("deletes both storage buckets before database, auth, and tombstone", async () => {
  const calls = [];
  const result = await processAccountDeletionJob?.(job, {
    ensureBanned: async () => {
      calls.push("ban");
      return { ok: true };
    },
    removeStorage: async (bucket) => {
      calls.push(`storage:${bucket}`);
      return { ok: true };
    },
    cleanupDatabase: async () => {
      calls.push("database");
      return { ok: true };
    },
    deleteAuthUser: async () => {
      calls.push("auth");
      return { ok: true };
    },
    complete: async () => {
      calls.push("complete");
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    "ban",
    "storage:lost",
    "storage:sightings",
    "database",
    "auth",
    "complete",
  ]);
});

test("treats an already-missing auth user as idempotent success", async () => {
  const result = await processAccountDeletionJob?.(job, {
    ensureBanned: async () => ({ ok: true }),
    removeStorage: async () => ({ ok: true }),
    cleanupDatabase: async () => ({ ok: true }),
    deleteAuthUser: async () => ({ ok: false, notFound: true }),
    complete: async () => ({ ok: true }),
  });

  assert.deepEqual(result, { ok: true });
});
