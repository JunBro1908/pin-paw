export type AppNotification = {
  id: string;
  type:
    | "new_recommendation"
    | "claim_update"
    | "lost_post_status_changed"
    | string;
  lost_post_id: string | null;
  sighting_id: string | null;
  display_metadata: {
    petName?: string;
    status?: string;
  };
  created_at: string;
  read_at: string | null;
};

export function notificationTitle(item: AppNotification): string {
  switch (item.type) {
    case "new_recommendation":
      return "새 추천 후보가 있습니다";
    case "claim_update":
      return "북마크/클레임 업데이트가 있습니다";
    case "lost_post_status_changed":
      return "유실글 상태가 변경되었습니다";
    default:
      return "알림";
  }
}

export function notificationHref(item: AppNotification): string | null {
  if (item.lost_post_id && item.type === "new_recommendation") {
    return `/recommend?lostPostId=${item.lost_post_id}`;
  }
  if (item.lost_post_id) {
    return `/my/lost-posts/${item.lost_post_id}`;
  }
  if (item.sighting_id) {
    return `/map?sightingId=${item.sighting_id}`;
  }
  return null;
}
