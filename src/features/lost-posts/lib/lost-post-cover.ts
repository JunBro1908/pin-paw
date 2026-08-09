import { createClient } from "@/shared/supabase/client";
import { formatSeoulLostDateTime } from "@/shared/lib/date";

/** Returns a public Storage URL for a lost-post cover key, or empty string. */
export function getLostPostCoverUrl(coverPhotoKey: string | null | undefined): string {
  if (!coverPhotoKey?.trim()) return "";
  const client = createClient();
  const ref = client?.storage?.from("lost");
  if (!ref) return "";
  return ref.getPublicUrl(coverPhotoKey).data.publicUrl ?? "";
}

export function formatLostCaseDateTime(value: string | null | undefined): string {
  return formatSeoulLostDateTime(value) ?? "";
}
