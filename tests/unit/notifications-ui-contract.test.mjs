import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationHref,
  notificationTitle,
} from "../../src/features/notifications/model/types.ts";

test("notification titles and hrefs stay on safe product routes", () => {
  assert.equal(
    notificationTitle({
      id: "1",
      type: "new_recommendation",
      lost_post_id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      sighting_id: null,
      display_metadata: {},
      created_at: "2026-07-25T00:00:00.000Z",
      read_at: null,
    }),
    "새 추천 후보가 있습니다"
  );
  assert.equal(
    notificationHref({
      id: "1",
      type: "new_recommendation",
      lost_post_id: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      sighting_id: null,
      display_metadata: {},
      created_at: "2026-07-25T00:00:00.000Z",
      read_at: null,
    }),
    "/recommend?lostPostId=8db61ddf-bce2-4b51-b531-0b93093053d1"
  );
});
