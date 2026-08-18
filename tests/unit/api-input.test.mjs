import assert from "node:assert/strict";
import test from "node:test";

let parseUploadRequest;
let parseSightingCreateRequest;
let parseSightingUpdateRequest;
let parseLostPostCreateRequest;
let parseLostPostUpdateRequest;
let parseEntityIdRequest;
let parseEntityIdList;
let parsePagination;
let parseRecommendationQuery;
let parseAccountDeletionRequest;
let isValidUuid;

try {
  ({
    parseUploadRequest,
    parseSightingCreateRequest,
    parseSightingUpdateRequest,
    parseLostPostCreateRequest,
    parseLostPostUpdateRequest,
    parseEntityIdRequest,
    parseEntityIdList,
    parsePagination,
    parseRecommendationQuery,
    parseAccountDeletionRequest,
    isValidUuid,
  } = await import("../../src/shared/lib/api-input.ts"));
} catch {
  // RED: shared runtime input contracts do not exist yet.
}

test("upload schema rejects non-objects, forged sizes, and unsupported MIME", () => {
  assert.equal(parseUploadRequest?.(null).ok, false);
  assert.equal(
    parseUploadRequest?.({
      purpose: "sighting_photo",
      files: [{ contentType: "image/jpeg", sizeBytes: -1 }],
    }).ok,
    false
  );
  assert.equal(
    parseUploadRequest?.({
      purpose: "sighting_photo",
      files: [{ contentType: "image/svg+xml", sizeBytes: 100 }],
    }).ok,
    false
  );
});

test("upload schema accepts only the established purpose and file contract", () => {
  assert.deepEqual(
    parseUploadRequest?.({
      purpose: "lost_cover",
      files: [{ contentType: "image/png", sizeBytes: 1024 }],
    }),
    {
      ok: true,
      value: {
        purpose: "lost_cover",
        files: [{ contentType: "image/png", sizeBytes: 1024 }],
      },
    }
  );
});

test("sighting schema rejects invalid coordinates, dates, photo keys, and long notes", () => {
  const base = {
    photoKeys: [
      "sighting_photo/20260725/123e4567-e89b-42d3-a456-426614174000.jpg",
    ],
    location: { lat: 37.5, lng: 127 },
    occurredAt: "2026-07-25T12:00:00+09:00",
  };

  assert.equal(
    parseSightingCreateRequest?.({
      ...base,
      location: { lat: 91, lng: 127 },
    }).ok,
    false
  );
  assert.equal(
    parseSightingCreateRequest?.({ ...base, occurredAt: "not-a-date" }).ok,
    false
  );
  assert.equal(
    parseSightingCreateRequest?.({ ...base, photoKeys: ["../other.jpg"] }).ok,
    false
  );
  assert.equal(
    parseSightingCreateRequest?.({ ...base, note: "x".repeat(2001) }).ok,
    false
  );
});

test("sighting schema accepts five photos but rejects a sixth", () => {
  const key = (index) =>
    `sighting_photo/20260725/123e4567-e89b-42d3-a456-42661417400${index}.jpg`;
  const base = {
    location: { lat: 37.5, lng: 127 },
    occurredAt: "2026-07-25T12:00:00+09:00",
  };

  assert.equal(
    parseSightingCreateRequest?.({
      ...base,
      photoKeys: [1, 2, 3, 4, 5].map(key),
    }).ok,
    true
  );
  assert.equal(
    parseSightingCreateRequest?.({
      ...base,
      photoKeys: [1, 2, 3, 4, 5, 6].map(key),
    }).ok,
    false
  );
});

test("sighting update accepts only the complete bounded mutable field set", () => {
  const key =
    "sighting_photo/20260725/123e4567-e89b-42d3-a456-426614174000.jpg";
  const valid = parseSightingUpdateRequest?.({
    photoKeys: [key],
    location: { lat: 37.5, lng: 127 },
    occurredAt: "2026-07-25T12:00:00+09:00",
    traitColor: " 갈색 ",
    traitSize: "small",
    traitSpecies: "poodle",
    traitTags: ["collar", "collar"],
    note: "",
  });
  assert.deepEqual(valid, {
    ok: true,
    value: {
      photoKeys: [key],
      location: { lat: 37.5, lng: 127 },
      occurredAt: "2026-07-25T12:00:00+09:00",
      traitColor: "갈색",
      traitSize: "small",
      traitSpecies: "poodle",
      traitTags: ["collar"],
      note: null,
    },
  });
  assert.equal(
    parseSightingUpdateRequest?.({ ...valid?.value, photoKeys: [] }).ok,
    false
  );
  assert.equal(
    parseSightingUpdateRequest?.({
      ...valid?.value,
      note: "x".repeat(2001),
    }).ok,
    false
  );
  assert.equal(
    parseSightingUpdateRequest?.({ ...valid?.value, userId: "forged" }).ok,
    false
  );
});

test("lost-post schema requires bounded owner data and a lost-cover key", () => {
  const result = parseLostPostCreateRequest?.({
    coverPhotoKey:
      "lost_cover/20260725/123e4567-e89b-42d3-a456-426614174000.png",
    lostAt: "2026-07-25T12:00:00+09:00",
    lostLocation: { lat: 37.5, lng: 127 },
    petName: "보리",
    note: "갈색 목줄",
  });

  assert.equal(result?.ok, true);
  assert.equal(
    parseLostPostCreateRequest?.({
      coverPhotoKey: "sighting_photo/other.jpg",
      lostAt: "2026-07-25",
      lostLocation: { lat: 37.5, lng: 127 },
      petName: "",
    }).ok,
    false
  );
});

test("lost-post update accepts one to three photo keys and rejects a fourth", () => {
  const key = (index) =>
    `lost_cover/20260725/123e4567-e89b-42d3-a456-42661417400${index}.jpg`;
  assert.equal(
    parseLostPostUpdateRequest({ photoKeys: [1, 2, 3].map(key) }).ok,
    true
  );
  assert.equal(
    parseLostPostUpdateRequest({ photoKeys: [1, 2, 3, 4].map(key) }).ok,
    false
  );
  assert.equal(
    parseLostPostUpdateRequest({
      coverPhotoKey: key(1),
      photoKeys: [key(2), key(1)],
    }).ok,
    false
  );
});

test("lost-post trait tags reject more than five selections", () => {
  assert.equal(
    parseLostPostCreateRequest({
      coverPhotoKey:
        "lost_cover/20260725/123e4567-e89b-42d3-a456-426614174000.png",
      lostAt: "2026-07-25T12:00:00+09:00",
      lostLocation: { lat: 37.5665, lng: 126.978 },
      petName: "보리",
      traitTags: ["a", "b", "c", "d", "e", "f"],
    }).ok,
    false
  );
});

test("idempotency keys must be canonical UUID values", () => {
  assert.equal(isValidUuid?.("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isValidUuid?.("not-a-uuid"), false);
});

test("entity ID bodies and lists accept only bounded canonical UUID values", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  assert.deepEqual(parseEntityIdRequest?.({ sightingId: id }, "sightingId"), {
    ok: true,
    value: id,
  });
  assert.equal(
    parseEntityIdRequest?.({ sightingId: "../other" }, "sightingId").ok,
    false
  );
  assert.deepEqual(parseEntityIdList?.(`${id},${id}`, 500), {
    ok: true,
    value: [id],
  });
  assert.equal(parseEntityIdList?.(`${id},not-a-uuid`, 500).ok, false);
  assert.equal(
    parseEntityIdList?.(Array.from({ length: 501 }, () => id).join(","), 500)
      .ok,
    false
  );
});

test("lost-post update schema rejects coercion and unbounded mutable fields", () => {
  assert.equal(
    parseLostPostUpdateRequest?.({ petName: { value: "보리" } }).ok,
    false
  );
  assert.equal(
    parseLostPostUpdateRequest?.({ traitSpecies: "x".repeat(101) }).ok,
    false
  );
  assert.equal(
    parseLostPostUpdateRequest?.({ note: "x".repeat(2001) }).ok,
    false
  );
  assert.equal(parseLostPostUpdateRequest?.({ status: "deleted" }).ok, false);
  assert.equal(
    parseLostPostUpdateRequest?.({
      coverPhotoKey: "sighting_photo/other.jpg",
    }).ok,
    false
  );

  assert.deepEqual(
    parseLostPostUpdateRequest?.({
      petName: "  보리  ",
      traitColor: "",
      traitTags: ["collar", "collar"],
      status: "found",
      coverPhotoKey:
        "lost_cover/20260725/123e4567-e89b-42d3-a456-426614174000.png",
    }),
    {
      ok: true,
      value: {
        petName: "보리",
        traitColor: null,
        traitTags: ["collar"],
        status: "found",
        coverPhotoKey:
          "lost_cover/20260725/123e4567-e89b-42d3-a456-426614174000.png",
      },
    }
  );
});

test("pagination rejects NaN, fractional, negative, and oversized values", () => {
  assert.deepEqual(parsePagination?.(null, null, 20, 100), {
    ok: true,
    value: { limit: 20, offset: 0 },
  });
  assert.equal(parsePagination?.("NaN", "0", 20, 100).ok, false);
  assert.equal(parsePagination?.("1.5", "0", 20, 100).ok, false);
  assert.equal(parsePagination?.("20", "-1", 20, 100).ok, false);
  assert.equal(parsePagination?.("101", "0", 20, 100).ok, false);
});

test("recommendation query enforces UUID and bounded cost parameters", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(
    parseRecommendationQuery?.({
      lostPostId: id,
      radiusKm: null,
      days: null,
      topK: null,
    }),
    {
      ok: true,
      value: { lostPostId: id, radiusKm: 8, days: 8, topK: 10 },
    }
  );
  assert.equal(
    parseRecommendationQuery?.({
      lostPostId: "not-a-uuid",
      radiusKm: "8",
      days: "8",
      topK: "10",
    }).ok,
    false
  );
  assert.equal(
    parseRecommendationQuery?.({
      lostPostId: id,
      radiusKm: "101",
      days: "366",
      topK: "51",
    }).ok,
    false
  );
});

test("account deletion requires the exact bounded confirmation body", () => {
  assert.deepEqual(parseAccountDeletionRequest?.({ confirmation: "DELETE" }), {
    ok: true,
    value: { confirmation: "DELETE" },
  });
  assert.equal(
    parseAccountDeletionRequest?.({ confirmation: "delete" }).ok,
    false
  );
  assert.equal(
    parseAccountDeletionRequest?.({
      confirmation: "DELETE",
      userId: "123e4567-e89b-42d3-a456-426614174000",
    }).ok,
    false
  );
});
