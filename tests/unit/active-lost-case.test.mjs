import assert from "node:assert/strict";
import test from "node:test";
import { selectActiveLostCase } from "../../src/features/lost-posts/lib/active-lost-case.ts";

const item = (id, status, updated_at) => ({
  id,
  status,
  updated_at,
  created_at: updated_at,
  lost_at: updated_at,
  pet_name: id,
  cover_photo_key:
    "sighting_photo/20260802/00000000-0000-4000-8000-000000000000.jpg",
  trait_color: null,
  trait_size: null,
  trait_species: null,
  trait_tags: null,
  note: null,
  embedding_status: "ready",
});

test("selects the most recently updated searching case", () => {
  const result = selectActiveLostCase([
    item("closed", "closed", "2026-08-02T12:00:00Z"),
    item("older", "searching", "2026-08-01T12:00:00Z"),
    item("newer", "searching", "2026-08-02T10:00:00Z"),
  ]);
  assert.equal(result?.id, "newer");
});

test("returns null when no searching cases exist", () => {
  const result = selectActiveLostCase([
    item("found", "found", "2026-08-02T12:00:00Z"),
    item("closed", "closed", "2026-08-02T11:00:00Z"),
  ]);
  assert.equal(result, null);
});

test("returns null for an empty list", () => {
  assert.equal(selectActiveLostCase([]), null);
});
