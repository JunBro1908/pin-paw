import type { LostPostItem } from "../model/types";

export function selectActiveLostCase(
  items: LostPostItem[]
): LostPostItem | null {
  return (
    items
      .filter((item) => item.status === "searching")
      .toSorted(
        (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
      )[0] ?? null
  );
}
