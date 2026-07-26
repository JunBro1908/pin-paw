import assert from "node:assert/strict";
import test from "node:test";

import { getIdempotencyReplay } from "../../src/shared/lib/idempotency.ts";

function fakeClient(result) {
  const filters = [];
  const builder = {
    select() {
      return builder;
    },
    eq(column, value) {
      filters.push(["eq", column, value]);
      return builder;
    },
    is(column, value) {
      filters.push(["is", column, value]);
      return builder;
    },
    gt(column, value) {
      filters.push(["gt", column, value]);
      return builder;
    },
    async maybeSingle() {
      return result;
    },
  };
  return {
    filters,
    client: {
      from(table) {
        assert.equal(table, "idempotency_keys");
        return builder;
      },
    },
  };
}

const baseInput = {
  scope: "sighting:submit",
  key: "123e4567-e89b-42d3-a456-426614174000",
  ownerId: null,
  ipHash: "a".repeat(64),
  requestHash: "b".repeat(64),
};

test("returns a cached response only for the exact live identity and request hash", async () => {
  const response = { success: true, data: { id: "row-1" } };
  const { client, filters } = fakeClient({
    data: { request_hash: baseInput.requestHash, response },
    error: null,
  });

  assert.deepEqual(await getIdempotencyReplay(client, baseInput), {
    status: "hit",
    response,
  });
  assert.deepEqual(filters.slice(0, 4), [
    ["eq", "scope", baseInput.scope],
    ["eq", "key", baseInput.key],
    ["is", "owner_id", null],
    ["eq", "ip_hash", baseInput.ipHash],
  ]);
  assert.equal(filters.at(-1)[0], "gt");
  assert.equal(filters.at(-1)[1], "expires_at");
});

test("distinguishes cache miss, payload conflict, and database failure", async () => {
  const miss = fakeClient({ data: null, error: null });
  assert.deepEqual(await getIdempotencyReplay(miss.client, baseInput), {
    status: "miss",
  });

  const conflict = fakeClient({
    data: { request_hash: "c".repeat(64), response: { success: true } },
    error: null,
  });
  assert.deepEqual(await getIdempotencyReplay(conflict.client, baseInput), {
    status: "conflict",
  });

  const unavailable = fakeClient({
    data: null,
    error: { code: "08006" },
  });
  assert.deepEqual(await getIdempotencyReplay(unavailable.client, baseInput), {
    status: "unavailable",
  });
});
