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
  const hardenMigration = await readFile(
    new URL(
      "../../supabase/migrations/20260803110000_harden_rate_limit_cooldown.sql",
      import.meta.url
    ),
    "utf8"
  );
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
  assert.match(hardenMigration, /v_last_allowed_at := null/i);
  assert.match(
    hardenMigration,
    /extract\(\s*epoch from \(v_now - public\.rate_limit_cooldowns\.last_allowed_at\)\s*\)\s*>=\s*p_cooldown_seconds/i
  );
  assert.match(source, /\.rpc\(\s*"consume_rate_limit_cooldown"/);
  assert.match(
    source,
    /windowMs:\s*10\s*\*\s*1000[\s\S]*strategy:\s*"cooldown"/
  );
});

test("cooldown missing RPC fails closed instead of fixed-window fallback", async () => {
  const source = await readFile(rateLimitSource, "utf8");
  const cooldownCall = source.indexOf('rpc("consume_rate_limit_cooldown"');
  assert.ok(cooldownCall >= 0);
  const afterCooldown = source.slice(cooldownCall, cooldownCall + 900);
  assert.match(afterCooldown, /isMissingRpcError/);
  assert.match(afterCooldown, /unavailable:\s*true/);
  assert.doesNotMatch(
    afterCooldown,
    /consumeFixedWindow/,
    "10s cooldown must not fall back to boundary-prone fixed windows"
  );
});

test("anonymous dimension uses IP scope only; auth adds user scope", async () => {
  const source = await readFile(rateLimitSource, "utf8");
  assert.match(
    source,
    /checkRateLimitDimensions[\s\S]*?`\$\{scope\}:ip`[\s\S]*?if \(!ipResult\.allowed \|\| !userId\) return ipResult/
  );
  assert.match(
    source,
    /return checkRateLimit\([\s\S]*?`\$\{scope\}:user`/
  );
  const sightingRoute = await readFile(
    new URL("../../src/app/api/v1/sightings/route.ts", import.meta.url),
    "utf8"
  );
  const presignRoute = await readFile(
    new URL("../../src/app/api/v1/uploads/presign/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(sightingRoute, /checkRateLimitDimensions\(/);
  assert.match(presignRoute, /checkRateLimitDimensions\(/);
  assert.match(sightingRoute, /getClientIp\(\)/);
  assert.match(presignRoute, /getClientIp\(\)/);
});
