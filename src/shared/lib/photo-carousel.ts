export function nextPhotoIndex(current: number, total: number): number {
  if (!Number.isSafeInteger(total) || total <= 0) return 0;
  return (current + 1) % total;
}
