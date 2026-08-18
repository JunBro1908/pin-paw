import assert from "node:assert/strict";
import test from "node:test";

let mergePhotoSelection;
try {
  ({ mergePhotoSelection } =
    await import("../../src/shared/lib/photo-selection.ts"));
} catch {
  // RED: the shared selection contract is introduced by the implementation.
}

const photo = (name, size = 100, lastModified = 1) => ({
  name,
  size,
  lastModified,
});

test("photo selection appends new files and removes duplicates", () => {
  const result = mergePhotoSelection?.(
    [photo("one.jpg")],
    [photo("one.jpg"), photo("two.jpg")],
    5
  );

  assert.deepEqual(result, {
    files: [photo("one.jpg"), photo("two.jpg")],
    added: [photo("two.jpg")],
    rejected: 0,
  });
});

test("photo selection accepts only the available slots and reports overflow", () => {
  const result = mergePhotoSelection?.(
    [photo("one.jpg"), photo("two.jpg"), photo("three.jpg"), photo("four.jpg")],
    [photo("five.jpg"), photo("six.jpg"), photo("seven.jpg")],
    5
  );

  assert.deepEqual(result, {
    files: [
      photo("one.jpg"),
      photo("two.jpg"),
      photo("three.jpg"),
      photo("four.jpg"),
      photo("five.jpg"),
    ],
    added: [photo("five.jpg")],
    rejected: 2,
  });
});

test("photo selection preserves queue order after removing a middle item", () => {
  const result = mergePhotoSelection?.(
    [photo("one.jpg"), photo("three.jpg")],
    [photo("four.jpg")],
    5
  );

  assert.deepEqual(result.files, [
    photo("one.jpg"),
    photo("three.jpg"),
    photo("four.jpg"),
  ]);
});
