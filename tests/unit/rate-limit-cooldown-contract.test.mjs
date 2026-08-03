import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  wouldCooldownAllow,
  wouldFixedWindowAllow,
} from "../../src/shared/lib/rate-limit-window.ts";

const cooldownMigration = new URL(
  "../../supabase/migrations/20260803010000_rate_limit_cooldown.sql",
  import.meta.url
);
const rateLimitSource = new URL(
  "../../src/shared/lib/rate-limit.ts",
  import.meta.url
);

test("fixed-window max=1 allows two requests within <10s at bucket boundary", () => {
  // Window aligned to 10s: [...9.5 allowed] then [10.0 new window allowed]
  const first = 9.5;
  const second = 10.0;
  assert.equal(
    wouldFixedWindowAllow({
      previousEpochSeconds: first,
      nextEpochSeconds: second,
      windowSeconds: 10,
      maxRequests: 1,
      previousCountInWindow: 1,
    }),
    true
  );
  assert.ok(second - first < 10);
});

test("cooldown max spacing rejects the same boundary pair", () => {
  const first = 9.5;
  const second = 10.0;
  const result = wouldCooldownAllow({
    lastAllowedEpochSeconds: first,
    nextEpochSeconds: second,
    cooldownSeconds: 10,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterSeconds, 10);
});

test("cooldown allows only after full 10s from last allow", () => {
  assert.equal(
    wouldCooldownAllow({
      lastAllowedEpochSeconds: 100,
      nextEpochSeconds: 109.9,
      cooldownSeconds: 10,
    }).allowed,
    false
  );
  assert.equal(
    wouldCooldownAllow({
      lastAllowedEpochSeconds: 100,
      nextEpochSeconds: 110,
      cooldownSeconds: 10,
    }).allowed,
    true
  );
});

test("sighting 10s preset uses cooldown RPC wiring", async () => {
  const migration = await readFile(cooldownMigration, "utf8");
  const source = await readFile(rateLimitSource, "utf8");

  assert.match(migration, /create table if not exists public\.rate_limit_cooldowns/i);
  assert.match(
    migration,
    /create or replace function public\.consume_rate_limit_cooldown/i
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_rate_limit_cooldown[\s\S]*to service_role/i
  );
  assert.match(source, /\.rpc\(\s*"consume_rate_limit_cooldown"/);
  assert.match(
    source,
    /windowMs:\s*10\s*\*\s*1000[\s\S]*strategy:\s*"cooldown"/
  );
});
