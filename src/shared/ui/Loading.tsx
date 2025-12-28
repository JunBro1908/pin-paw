/**
 * 최소한의 로딩 표시기입니다.
 */
export function Loading() {
  return (
    <div className="flex h-20 items-center justify-center">
      <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  );
}
