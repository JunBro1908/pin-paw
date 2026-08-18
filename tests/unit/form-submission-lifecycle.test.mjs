import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as submissionLifecycle from "../../src/shared/lib/form-submission-lifecycle.ts";

const {
  completeSubmission,
  fingerprintUploadFile,
  markUploadIntentCompleted,
  prepareSubmission,
  rememberUploadIntent,
  rememberUploadIntents,
  startNewSubmission,
} = submissionLifecycle;

const uuids = [
  "123e4567-e89b-42d3-a456-426614174001",
  "123e4567-e89b-42d3-a456-426614174002",
  "123e4567-e89b-42d3-a456-426614174003",
  "123e4567-e89b-42d3-a456-426614174004",
  "123e4567-e89b-42d3-a456-426614174005",
  "123e4567-e89b-42d3-a456-426614174006",
];

function uuidFactory() {
  let index = 0;
  return () => uuids[index++];
}

test("sighting reset keeps datetime-local values in local time", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );

  assert.doesNotMatch(form, /new Date\(\)\.toISOString\(\)\.slice\(0, 16\)/);
});

test("successful sighting reset preserves accepted location readiness", async () => {
  const form = await readFile(
    "src/features/sightings/components/SightingForm.tsx",
    "utf8"
  );
  const reset = form.match(
    /const resetForm = \(\) => \{([\s\S]*?)\n  \};/
  )?.[1];

  assert.ok(reset, "resetForm source should be present");
  assert.match(reset, /setFormData\(\(prev\) => \(\{/);
  assert.match(reset, /lat: prev\.lat/);
  assert.match(reset, /lng: prev\.lng/);
  assert.doesNotMatch(reset, /setIsLocationSet\(false\)/);
  assert.doesNotMatch(reset, /setGeolocationErrorKind\("error"\)/);
});

test("best-effort submission follow-up swallows asynchronous failures", async () => {
  assert.equal(typeof submissionLifecycle.runBestEffort, "function");

  let unhandled = null;
  const onUnhandled = (error) => {
    unhandled = error;
  };
  process.once("unhandledRejection", onUnhandled);

  submissionLifecycle.runBestEffort(async () => {
    throw new Error("cache invalidation failed");
  });
  await new Promise((resolve) => setImmediate(resolve));

  process.removeListener("unhandledRejection", onUnhandled);
  assert.equal(unhandled, null);
});

test("reuses both keys and the upload intent after an ambiguous failure", () => {
  const createUuid = uuidFactory();
  const first = prepareSubmission(null, "same-payload", createUuid);
  const uploaded = rememberUploadIntent(first, {
    uploadUrl: "https://storage.example/upload-token",
    fileKey: "lost_cover/20260725/photo.jpg",
  });

  const retry = prepareSubmission(uploaded, "same-payload", createUuid);

  assert.equal(retry, uploaded);
  assert.equal(retry.uploadIdempotencyKey, uuids[0]);
  assert.equal(retry.submissionIdempotencyKey, uuids[1]);
  assert.deepEqual(retry.uploadIntent, uploaded.uploadIntent);
});

test("rotates keys and discards the upload intent when the payload changes", () => {
  const createUuid = uuidFactory();
  const first = rememberUploadIntent(
    prepareSubmission(null, "payload-a", createUuid),
    {
      uploadUrl: "https://storage.example/upload-token",
      fileKey: "sighting_photo/20260725/photo.jpg",
    }
  );

  const changed = prepareSubmission(first, "payload-b", createUuid);

  assert.equal(changed.payloadFingerprint, "payload-b");
  assert.equal(changed.uploadIdempotencyKey, uuids[2]);
  assert.equal(changed.submissionIdempotencyKey, uuids[3]);
  assert.equal(changed.uploadIntent, null);
});

test("tracks each photo upload intent independently across a retry", () => {
  const createUuid = uuidFactory();
  const first = prepareSubmission(null, "photo-queue", createUuid);
  const withIntents = rememberUploadIntents(first, [
    {
      uploadUrl: "https://storage.example/upload-1",
      fileKey: "lost_cover/20260725/one.jpg",
    },
    {
      uploadUrl: "https://storage.example/upload-2",
      fileKey: "lost_cover/20260725/two.jpg",
    },
  ]);
  const afterFirstUpload = markUploadIntentCompleted(withIntents, 0);
  const retry = prepareSubmission(afterFirstUpload, "photo-queue", createUuid);

  assert.equal(retry.uploadIntents?.[0].uploaded, true);
  assert.equal(retry.uploadIntents?.[1].uploaded, false);
  assert.equal(retry.uploadIntents?.[1].fileKey, "lost_cover/20260725/two.jpg");
});

test("rotates only after success or an explicit new submission", () => {
  const createUuid = uuidFactory();
  const first = prepareSubmission(null, "payload", createUuid);

  assert.equal(completeSubmission(first), null);
  const afterSuccess = prepareSubmission(
    completeSubmission(first),
    "payload",
    createUuid
  );
  assert.notEqual(
    afterSuccess.uploadIdempotencyKey,
    first.uploadIdempotencyKey
  );

  const explicitlyReset = startNewSubmission(afterSuccess);
  assert.equal(explicitlyReset, null);
  const next = prepareSubmission(explicitlyReset, "payload", createUuid);
  assert.notEqual(
    next.submissionIdempotencyKey,
    afterSuccess.submissionIdempotencyKey
  );
});

test("fingerprints file bytes so same metadata cannot reuse another upload", async () => {
  const metadata = {
    name: "same-name.jpg",
    lastModified: 1_753_449_600_000,
  };
  const first = Object.assign(
    new Blob(["first"], { type: "image/jpeg" }),
    metadata
  );
  const second = Object.assign(
    new Blob(["other"], { type: "image/jpeg" }),
    metadata
  );

  assert.notEqual(
    await fingerprintUploadFile(first),
    await fingerprintUploadFile(second)
  );
  assert.equal(
    await fingerprintUploadFile(first),
    await fingerprintUploadFile(first)
  );
});
