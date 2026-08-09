import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertSharePreviewIsSafe,
  buildLostPostSharePreview,
  buildOpenGraphDescription,
  buildShareTraitLabels,
} from "../../src/shared/lib/share-preview.ts";

const migrationPath =
  "supabase/migrations/20260725140000_public_lost_post_share_preview.sql";

test("share preview masks precise coordinates and omits note/owner fields", () => {
  const preview = buildLostPostSharePreview({
    id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
    status: "searching",
    pet_name: "초코",
    lost_at: "2026-07-25T00:00:00.000Z",
    trait_color: "갈색",
    trait_size: "중형",
    trait_species: "믹스",
    trait_tags: ["목줄"],
    cover_photo_key: "lost_cover/20260725/example.jpg",
    hidden_at: null,
    archived_at: null,
    lat: 37.5665,
    lng: 126.978,
    note: "집 근처 골목, 전화 010-0000-0000",
    owner_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });

  assert.ok(preview);
  assert.equal(preview.approximateArea?.lat, 37.575);
  assert.equal(preview.approximateArea?.lng, 126.975);
  assert.equal(preview.approximateArea?.locationPrecision, "approximate");
  assert.equal(preview.petName, "초코");
  assert.equal("note" in preview, false);
  assert.equal("owner_id" in preview, false);
  assert.equal("lat" in preview, false);
  assert.equal("lng" in preview, false);
  assertSharePreviewIsSafe(preview);
});

test("share preview hides closed, hidden, or archived posts", () => {
  assert.equal(
    buildLostPostSharePreview({
      id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      status: "closed",
      pet_name: "초코",
      lost_at: null,
      trait_color: null,
      trait_size: null,
      trait_species: null,
      trait_tags: null,
      cover_photo_key: null,
      hidden_at: null,
      archived_at: null,
    }),
    null
  );
  assert.equal(
    buildLostPostSharePreview({
      id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      status: "searching",
      pet_name: "초코",
      lost_at: null,
      trait_color: null,
      trait_size: null,
      trait_species: null,
      trait_tags: null,
      cover_photo_key: null,
      hidden_at: "2026-07-25T00:00:00.000Z",
      archived_at: null,
    }),
    null
  );
});

test("open graph description never embeds private notes", () => {
  const preview = buildLostPostSharePreview({
    id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
    status: "searching",
    pet_name: "초코",
    lost_at: null,
    trait_color: "갈색",
    trait_size: null,
    trait_species: null,
    trait_tags: null,
    cover_photo_key: null,
    hidden_at: null,
    archived_at: null,
    lat: 37.5665,
    lng: 126.978,
    note: "SECRET_NOTE",
  });
  const description = buildOpenGraphDescription(preview);
  assert.doesNotMatch(description, /SECRET_NOTE/);
  assert.match(description, /초코/);
});

test("share trait labels localize size and hide unknown values", () => {
  const preview = buildLostPostSharePreview({
    id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
    status: "searching",
    pet_name: "초코",
    lost_at: null,
    trait_color: "흰색",
    trait_size: "medium",
    trait_species: "말티즈",
    trait_tags: null,
    cover_photo_key: null,
    hidden_at: null,
    archived_at: null,
  });
  assert.deepEqual(buildShareTraitLabels(preview), ["말티즈", "중형견", "흰색"]);
});

test("share page keeps public teaser CTAs without auth-only detail fields", async () => {
  const page = await readFile(
    "src/app/share/lost-posts/[lostPostId]/page.tsx",
    "utf8"
  );
  assert.match(page, /get_public_lost_post_share_preview/);
  assert.match(page, /buildShareTraitLabels/);
  assert.match(page, /목격 제보하기/);
  assert.match(page, /로그인하고 함께 찾기/);
  assert.match(page, /유실 날짜 :/);
  assert.match(page, /유실 지역 :/);
  assert.match(page, /resolveApproxRegionLabel/);
  assert.match(page, /formatSeoulLostDateLabel/);
  assert.match(page, /ShareUnavailable|공유할 수 없는 유실글/);
  assert.match(page, /정확한 위치와 비공개 메모는 공유되지 않습니다/);
  assert.doesNotMatch(page, /지도에서 주변 보기/);
  assert.doesNotMatch(page, /\bowner_id\b|\.note\b|정밀 위치/);
  assert.doesNotMatch(page, /notFound\(/);
});

test("approx region label keeps city/district granularity only", async () => {
  const { formatKoreanRegionLabel } = await import(
    "../../src/shared/lib/approx-region-label.ts"
  );
  assert.equal(
    formatKoreanRegionLabel({
      state: "경기도",
      city: "안산시",
      borough: "단원구",
      road: "고잔로 123",
    }),
    "경기도 안산시 단원구"
  );
  assert.equal(
    formatKoreanRegionLabel({
      state: "서울특별시",
      borough: "마포구",
      suburb: "합정동",
    }),
    "서울특별시 마포구"
  );
});

test("share preview SQL uses lost_location grid and never selects note", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /get_public_lost_post_share_preview/i);
  assert.match(sql, /lost_location/i);
  assert.match(sql, /0\.05/);
  assert.doesNotMatch(sql, /\blp\.note\b/i);
  assert.doesNotMatch(sql, /\bowner_id\b/i);
  assert.match(
    sql,
    /grant execute on function public\.get_public_lost_post_share_preview\(uuid\)[\s\S]*?to anon/i
  );
});
