import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeMonitoringEvent,
  sanitizeMonitoringSpan,
} from "../../src/shared/lib/monitoring-sanitizer.ts";

test("monitoring events retain stack diagnostics without request or user payloads", () => {
  const event = sanitizeMonitoringEvent({
    message: "note=private memo token=secret-token",
    request: {
      url: "https://pinpaw.example/api/v1/public/map/clusters?minLat=37.5&note=private",
      method: "GET",
      headers: { authorization: "Bearer secret-token" },
      cookies: { session: "secret-cookie" },
      data: { note: "private memo" },
      query_string: "minLat=37.5",
    },
    user: { id: "private-user-id", ip_address: "203.0.113.10" },
    extra: { note: "private memo" },
    exception: {
      values: [
        {
          type: "PostgrestError",
          value: "database response with private memo",
          stacktrace: { frames: [{ filename: "route.ts", lineno: 10 }] },
        },
      ],
    },
    breadcrumbs: [
      {
        category: "fetch",
        message: "GET private memo",
        data: {
          url: "https://pinpaw.example/search?query=private",
          method: "GET",
          status_code: 503,
          request_body: "private memo",
        },
      },
    ],
  });

  assert.equal(event.message, "Application error");
  assert.equal(event.user, undefined);
  assert.equal(event.extra, undefined);
  assert.deepEqual(event.request, {
    url: "https://pinpaw.example/api/v1/public/map/clusters",
    method: "GET",
  });
  assert.equal(event.exception.values[0].value, "Application error");
  assert.deepEqual(event.exception.values[0].stacktrace, {
    frames: [{ filename: "route.ts", lineno: 10 }],
  });
  assert.deepEqual(event.breadcrumbs, [
    {
      category: "fetch",
      data: {
        method: "GET",
        status_code: 503,
        url: "https://pinpaw.example/search",
      },
    },
  ]);

  const serialized = JSON.stringify(event);
  for (const sensitive of [
    "private memo",
    "private-user-id",
    "203.0.113.10",
    "secret-token",
    "secret-cookie",
    "37.5",
    "query=private",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(sensitive.replace(".", "\\.")));
  }
});

test("monitoring spans strip query strings and sensitive attributes", () => {
  const span = sanitizeMonitoringSpan({
    description:
      "GET https://pinpaw.example/api/v1/search/local?query=private-place",
    data: {
      "http.request.method": "GET",
      "http.response.status_code": 502,
      "url.full": "https://pinpaw.example/path?lat=37.5&lng=127",
      "http.request.body": "private body",
      note: "private note",
    },
  });

  assert.equal(
    span.description,
    "GET https://pinpaw.example/api/v1/search/local"
  );
  assert.deepEqual(span.data, {
    "http.request.method": "GET",
    "http.response.status_code": 502,
    "url.full": "https://pinpaw.example/path",
  });
});
