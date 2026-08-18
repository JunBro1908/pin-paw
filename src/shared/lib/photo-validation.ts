export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

export function photoValidationMessage(
  file: Pick<File, "type" | "size">,
  index = 1
): string | null {
  if (
    !ACCEPTED_PHOTO_TYPES.includes(
      file.type as (typeof ACCEPTED_PHOTO_TYPES)[number]
    )
  ) {
    return `${index}번째 사진은 JPEG/PNG 형식만 올릴 수 있어요.`;
  }
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    return `${index}번째 사진은 10MB 이하로 선택해주세요.`;
  }
  return null;
}
