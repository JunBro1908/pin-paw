import assert from "node:assert/strict";
import test from "node:test";

const { getNaverMapsClientId, getNaverSearchCredentials } =
  await import("../../src/shared/lib/naver-credentials.ts");

test("search credentials use a public client id and server-only secret", () => {
  assert.deepEqual(
    getNaverSearchCredentials({
      NEXT_PUBLIC_NAVER_CLIENT_ID: "search-id",
      NAVER_CLIENT_SECRET: "search-secret",
      NAVER_CLIENT_ID: "legacy-id",
    }),
    { clientId: "search-id", clientSecret: "search-secret" }
  );
});

test("maps client id uses dedicated map env", () => {
  assert.equal(
    getNaverMapsClientId({
      NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: "map-id",
      NEXT_PUBLIC_NAVER_CLIENT_ID: "search-id",
    }),
    "map-id"
  );
});
