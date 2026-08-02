import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  completeSubmission,
  fingerprintUploadFile,
  prepareSubmission,
  rememberUploadIntent,
  startNewSubmission,
} from "../../src/shared/lib/form-submission-lifecycle.ts";

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
