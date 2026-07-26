import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupExpiredUploadIntents,
  cleanupQueuedStorageObjects,
  isJpeg,
  isPng,
  verifyUploadIntents,
} from "../../src/shared/lib/upload-intents.ts";

const key = "sighting_photo/20260725/123e4567-e89b-42d3-a456-426614174000.jpg";

function fakeClient({ intents, blob }) {
  const calls = { downloads: 0, verified: null };
  return {
    calls,
    client: {
      from(table) {
        assert.equal(table, "upload_intents");
        return {
          select() {
            return {
              in: async () => ({ data: intents, error: null }),
            };
          },
          update(value) {
            calls.verified = value;
            return {
              in() {
                return {
                  is: async () => ({ error: null }),
                };
              },
            };
          },
        };
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, "sightings");
          return {
            async download(objectKey) {
              calls.downloads += 1;
              assert.equal(objectKey, key);
              return { data: blob, error: null };
            },
          };
        },
      },
    },
  };
}

function intent(overrides = {}) {
  return {
    object_key: key,
    bucket_id: "sightings",
    purpose: "sighting_photo",
    owner_id: "123e4567-e89b-42d3-a456-426614174001",
    ip_hash: "a".repeat(64),
    expected_content_type: "image/jpeg",
    expected_size_bytes: 4,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

test("recognizes only complete JPEG and PNG signatures", () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff])), true);
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8])), false);
  assert.equal(
    isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    true
  );
  assert.equal(isPng(new Uint8Array([0x89, 0x50, 0x4e])), false);
});

test("verifies matching bytes and records verification only after download", async () => {
  const { client, calls } = fakeClient({
    intents: [intent()],
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]),
  });

  const result = await verifyUploadIntents(client, {
    keys: [key],
    purpose: "sighting_photo",
    userId: "123e4567-e89b-42d3-a456-426614174001",
    ipHash: "b".repeat(64),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.downloads, 1);
  assert.equal(typeof calls.verified?.verified_at, "string");
});

test("rejects another identity and expired intents before downloading", async () => {
  const otherIdentity = fakeClient({
    intents: [intent()],
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]),
  });
  const identityResult = await verifyUploadIntents(otherIdentity.client, {
    keys: [key],
    purpose: "sighting_photo",
    userId: "123e4567-e89b-42d3-a456-426614174099",
    ipHash: "a".repeat(64),
  });
  assert.deepEqual(identityResult, {
    ok: false,
    reason: "intent_identity_mismatch",
  });
  assert.equal(otherIdentity.calls.downloads, 0);

  const expired = fakeClient({
    intents: [intent({ expires_at: new Date(Date.now() - 1).toISOString() })],
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]),
  });
  const expiredResult = await verifyUploadIntents(expired.client, {
    keys: [key],
    purpose: "sighting_photo",
    userId: "123e4567-e89b-42d3-a456-426614174001",
    ipHash: "a".repeat(64),
  });
  assert.deepEqual(expiredResult, { ok: false, reason: "intent_expired" });
  assert.equal(expired.calls.downloads, 0);
});

test("lets an already-consumed intent reach the idempotent RPC without redownloading", async () => {
  const consumed = fakeClient({
    intents: [
      intent({
        consumed_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() - 30_000).toISOString(),
      }),
    ],
    blob: null,
  });

  const result = await verifyUploadIntents(consumed.client, {
    keys: [key],
    purpose: "sighting_photo",
    userId: "123e4567-e89b-42d3-a456-426614174001",
    ipHash: "a".repeat(64),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(consumed.calls.downloads, 0);
});

test("rejects actual size and magic-byte mismatches", async () => {
  const wrongSize = fakeClient({
    intents: [intent({ expected_size_bytes: 5 })],
    blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])]),
  });
  assert.deepEqual(
    await verifyUploadIntents(wrongSize.client, {
      keys: [key],
      purpose: "sighting_photo",
      userId: "123e4567-e89b-42d3-a456-426614174001",
      ipHash: "a".repeat(64),
    }),
    { ok: false, reason: "object_size_mismatch" }
  );

  const wrongType = fakeClient({
    intents: [intent()],
    blob: new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])]),
  });
  assert.deepEqual(
    await verifyUploadIntents(wrongType.client, {
      keys: [key],
      purpose: "sighting_photo",
      userId: "123e4567-e89b-42d3-a456-426614174001",
      ipHash: "a".repeat(64),
    }),
    { ok: false, reason: "object_type_mismatch" }
  );
});

test("cleanup deletes intent rows only after Storage removal succeeds", async () => {
  const calls = { removed: [], deleted: [], cleanupCutoff: null };
  const cleanupStartedAt = Date.now();
  const client = {
    from(table) {
      assert.equal(table, "upload_intents");
      return {
        select() {
          return {
            is() {
              return {
                lt(column, value) {
                  calls.cleanupCutoff = { column, value };
                  return {
                    limit: async () => ({
                      data: [
                        { object_key: key, bucket_id: "sightings" },
                        {
                          object_key:
                            "lost_cover/20260725/123e4567-e89b-42d3-a456-426614174002.png",
                          bucket_id: "lost",
                        },
                      ],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        delete() {
          return {
            in(_column, keys) {
              calls.deleted.push(...keys);
              return {
                is: async () => ({ error: null }),
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          async remove(keys) {
            calls.removed.push({ bucket, keys });
            return {
              error: bucket === "lost" ? new Error("unavailable") : null,
            };
          },
        };
      },
    },
  };

  assert.deepEqual(await cleanupExpiredUploadIntents(client), {
    ok: true,
    inspected: 2,
    removed: 1,
  });
  assert.equal(calls.cleanupCutoff.column, "created_at");
  const cleanupAgeMs = cleanupStartedAt - Date.parse(calls.cleanupCutoff.value);
  assert.ok(cleanupAgeMs >= 2 * 60 * 60 * 1000);
  assert.ok(cleanupAgeMs < 2 * 60 * 60 * 1000 + 10 * 60 * 1000);
  assert.deepEqual(calls.deleted, [key]);
});

test("queued cleanup completes only successful Storage deletions and backs off failures", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "lease_storage_cleanup_jobs") {
        return {
          data: [
            {
              id: "job-ok",
              bucket_id: "sightings",
              object_key: key,
              lease_token: "lease-ok",
            },
            {
              id: "job-fail",
              bucket_id: "sightings",
              object_key: "sighting_photo/20260725/fail.jpg",
              lease_token: "lease-fail",
            },
          ],
          error: null,
        };
      }
      return {
        data: name === "complete_storage_cleanup_job" ? true : null,
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async remove(keys) {
            calls.push({ name: "storage.remove", args: keys });
            return { error: keys[0].endsWith("fail.jpg") ? new Error() : null };
          },
        };
      },
    },
  };

  assert.deepEqual(await cleanupQueuedStorageObjects(client), {
    ok: true,
    inspected: 2,
    removed: 1,
  });
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "lease_storage_cleanup_jobs",
      "storage.remove",
      "complete_storage_cleanup_job",
      "storage.remove",
      "fail_storage_cleanup_job",
    ]
  );
});
