/**
 * 최소한의 로딩 표시기입니다.
 */
export function Loading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      className="flex h-20 items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
