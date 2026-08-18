import assert from "node:assert/strict";
import test from "node:test";

let nextPhotoIndex;
try {
  ({ nextPhotoIndex } = await import("../../src/shared/lib/photo-carousel.ts"));
} catch {
  // RED: the carousel loop contract is introduced by the implementation.
}

test("photo autoplay wraps from the last photo to the first", () => {
  assert.equal(nextPhotoIndex?.(2, 3), 0);
  assert.equal(nextPhotoIndex?.(0, 3), 1);
  assert.equal(nextPhotoIndex?.(0, 0), 0);
});
