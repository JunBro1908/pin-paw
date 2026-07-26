/**
 * 조건이 참이 아닐 경우 에러를 발생시키는 헬퍼 함수입니다.
 * 개발 중 로직의 무결성을 보장하기 위해 사용합니다.
 */
export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
