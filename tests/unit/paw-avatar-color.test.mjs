import assert from "node:assert/strict";
import test from "node:test";
import {
  PAW_AVATAR_COLOR_KEYS,
  PAW_AVATAR_PALETTE,
  isPawAvatarColorKey,
  pawAvatarIndexForUserId,
  pawColorKeyForUserId,
  resolvePawAvatarTone,
  resolvePawColorKey,
} from "../../src/shared/lib/paw-avatar-color.ts";

test("palette exposes eight curated brand-friendly keys", () => {
  assert.deepEqual([...PAW_AVATAR_COLOR_KEYS], [
    "pine",
    "honey",
    "sky",
    "coral",
    "sage",
    "teal",
    "rose",
    "slate",
  ]);
  assert.equal(PAW_AVATAR_PALETTE.length, 8);
  for (const tone of PAW_AVATAR_PALETTE) {
    assert.equal(tone.key, PAW_AVATAR_COLOR_KEYS[PAW_AVATAR_PALETTE.indexOf(tone)]);
    assert.match(tone.bgClass, /^bg-\[#[0-9a-f]{6}\]$/i);
    assert.match(tone.fgClass, /^text-\[#[0-9a-f]{6}\]$/i);
  }
});

test("user id hash is stable and covers the palette", () => {
  const samples = [
    "00000000-0000-4000-8000-000000000001",
    "11111111-1111-4111-8111-111111111111",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ffffffff-ffff-4fff-8fff-ffffffffffff",
    "89abcdef-0123-4567-89ab-cdef01234567",
  ];

  for (const id of samples) {
    const first = pawColorKeyForUserId(id);
    const second = pawColorKeyForUserId(id);
    assert.equal(first, second);
    assert.equal(isPawAvatarColorKey(first), true);
    assert.equal(pawAvatarIndexForUserId(id), PAW_AVATAR_COLOR_KEYS.indexOf(first));
  }

  const seen = new Set(
    samples.map((id) => pawAvatarIndexForUserId(id) % PAW_AVATAR_PALETTE.length)
  );
  assert.ok(seen.size >= 2, "sample ids should not all collapse to one tone");
});

test("high-bit uuid prefixes stay unsigned (matches SQL & 7)", () => {
  const id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.equal(pawAvatarIndexForUserId(id), (0xffffffff >>> 0) % 8);
  assert.equal(pawColorKeyForUserId(id), "slate");
});

test("stored key wins when valid; invalid falls back to id hash", () => {
  const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const hashed = pawColorKeyForUserId(id);
  assert.equal(resolvePawColorKey(id, "coral"), "coral");
  assert.equal(resolvePawAvatarTone(id, "coral").key, "coral");
  assert.equal(resolvePawColorKey(id, "not-a-key"), hashed);
  assert.equal(resolvePawColorKey(id, null), hashed);
  assert.equal(resolvePawColorKey(undefined, undefined), "pine");
  assert.equal(resolvePawAvatarTone(null, undefined).key, "pine");
});
