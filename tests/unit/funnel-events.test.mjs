import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  isFunnelOptOutEnabled,
  parseFunnelEvent,
} from "../../src/shared/lib/funnel-events.ts";

const migrationPath = "supabase/migrations/20260725150000_funnel_events.sql";

test("funnel parser accepts canonical events and safe properties", () => {
  const parsed = parseFunnelEvent({
    name: "recommendation_viewed",
    lostPostId: "8db61ddf-bce2-4b51-b531-0b93093053d1",
    properties: { source: "recommend_tab", rank: 1 },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.name, "recommendation_viewed");
  assert.equal(parsed.value.properties.source, "recommend_tab");
});

test("funnel parser rejects raw location, note, and token properties", () => {
  for (const properties of [
    { lat: 37.5 },
    { lng: 127 },
    { note: "secret" },
    { access_token: "x" },
    { location: "home" },
  ]) {
    const parsed = parseFunnelEvent({
      name: "lost_post_created",
      properties,
    });
    assert.equal(parsed.ok, false);
  }
});

test("analytics opt-out is detected", () => {
  assert.equal(isFunnelOptOutEnabled({ analyticsOptIn: false }), true);
  assert.equal(isFunnelOptOutEnabled({ analyticsOptIn: true }), false);
  assert.equal(isFunnelOptOutEnabled(null), false);
});

test("funnel SQL forbids sensitive properties and is append-only", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.funnel_events/i);
  assert.match(sql, /funnel_events_are_append_only/i);
  assert.match(sql, /funnel_events_no_sensitive_properties/i);
  assert.match(sql, /record_funnel_event/i);
  assert.match(sql, /analytics_opt_in/i);
  assert.match(
    sql,
    /revoke all on table public\.funnel_events[\s\S]*?from public,\s*anon,\s*authenticated/i
  );
  for (const key of ["lat", "lng", "note", "token", "access_token"]) {
    assert.match(sql, new RegExp(`'${key}'`, "i"));
  }
});
