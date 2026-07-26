import assert from "node:assert/strict";
import test from "node:test";

const { getOAuthReturnPath, authFeedbackMessage } = await import(
  "../../src/shared/lib/oauth-return-path.ts"
);

test("preserves pathname and search for OAuth return", () => {
  assert.equal(
    getOAuthReturnPath("/map", "?lat=1&lng=2&sightingId=abc"),
    "/map?lat=1&lng=2&sightingId=abc"
  );
  assert.equal(getOAuthReturnPath("/recommend", ""), "/recommend");
});

test("rejects open-redirect shaped return paths", () => {
  assert.equal(getOAuthReturnPath("//evil.example", ""), "/");
  assert.equal(getOAuthReturnPath("/\\evil.example", ""), "/");
});

test("maps auth feedback codes to user-visible messages", () => {
  assert.match(authFeedbackMessage("denied") ?? "", /로그인할 수 없습니다/);
  assert.match(authFeedbackMessage("cancelled") ?? "", /취소/);
  assert.equal(authFeedbackMessage("unknown"), null);
});
