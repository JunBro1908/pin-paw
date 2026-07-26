import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeCronRequest,
  createCronAuthorizedValue,
  getCronAuthorizationHeader,
  runWithCronAuthorizationHeader,
} from "../../src/shared/lib/cron-auth.ts";

test("returns no authorization header when CRON_SECRET is missing", () => {
  assert.equal(getCronAuthorizationHeader(undefined), null);
  assert.equal(getCronAuthorizationHeader("   "), null);
  assert.equal(getCronAuthorizationHeader(" padded-secret "), null);
});

test("builds the exact bearer header for a configured CRON_SECRET", () => {
  assert.equal(
    getCronAuthorizationHeader("worker-secret"),
    "Bearer worker-secret"
  );
});

test("fails closed with 503 when CRON_SECRET is missing", () => {
  assert.deepEqual(authorizeCronRequest(undefined, null), {
    ok: false,
    status: 503,
    error: "Service unavailable",
  });
  assert.deepEqual(authorizeCronRequest("   ", "Bearer    "), {
    ok: false,
    status: 503,
    error: "Service unavailable",
  });
});

test("rejects a missing or incorrect bearer token", () => {
  assert.deepEqual(authorizeCronRequest("worker-secret", null), {
    ok: false,
    status: 401,
    error: "Unauthorized",
  });
  assert.deepEqual(
    authorizeCronRequest("worker-secret", "Bearer wrong-secret"),
    {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  );
});

test("authorizes only the exact bearer token", () => {
  assert.deepEqual(
    authorizeCronRequest("worker-secret", "Bearer worker-secret"),
    { ok: true }
  );
});

test("does not create a protected value before authorization succeeds", () => {
  let createCount = 0;
  const createValue = () => {
    createCount += 1;
    return "service-role-client";
  };

  assert.deepEqual(createCronAuthorizedValue(undefined, null, createValue), {
    ok: false,
    status: 503,
    error: "Service unavailable",
  });
  assert.deepEqual(
    createCronAuthorizedValue(
      "worker-secret",
      "Bearer wrong-secret",
      createValue
    ),
    {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  );
  assert.equal(createCount, 0);
});

test("creates a protected value after authorization succeeds", () => {
  let createCount = 0;

  const result = createCronAuthorizedValue(
    "worker-secret",
    "Bearer worker-secret",
    () => {
      createCount += 1;
      return "service-role-client";
    }
  );

  assert.deepEqual(result, {
    ok: true,
    value: "service-role-client",
  });
  assert.equal(createCount, 1);
});

test("does not run an internal request callback without CRON_SECRET", () => {
  let callbackCount = 0;

  const didRun = runWithCronAuthorizationHeader(undefined, () => {
    callbackCount += 1;
  });

  assert.equal(didRun, false);
  assert.equal(callbackCount, 0);
});

test("runs an internal request callback with the exact bearer header", () => {
  const headers = [];

  const didRun = runWithCronAuthorizationHeader(
    "worker-secret",
    (authorizationHeader) => {
      headers.push(authorizationHeader);
    }
  );

  assert.equal(didRun, true);
  assert.deepEqual(headers, ["Bearer worker-secret"]);
});
