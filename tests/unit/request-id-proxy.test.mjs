import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server.js";
import { proxy } from "../../src/proxy.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("API proxy replaces an untrusted request ID with a new server UUID", () => {
  const request = new NextRequest("https://pinpaw.example/api/v1/sightings", {
    headers: { "x-request-id": "attacker-controlled-value" },
  });

  const response = proxy(request);
  const requestId = response.headers.get("x-request-id");

  assert.match(requestId ?? "", UUID_PATTERN);
  assert.notEqual(requestId, "attacker-controlled-value");
});

test("API proxy generates a distinct request ID for every request", () => {
  const first = proxy(
    new NextRequest("https://pinpaw.example/api/v1/sightings")
  );
  const second = proxy(
    new NextRequest("https://pinpaw.example/api/v1/sightings")
  );

  assert.notEqual(
    first.headers.get("x-request-id"),
    second.headers.get("x-request-id")
  );
});
