/**
 * Capture the in-app path to restore after OAuth, including query string.
 * Rejects protocol-relative and backslash open-redirect shapes.
 */
export function getOAuthReturnPath(
  pathname: string,
  search = ""
): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const withSearch = `${path}${search.startsWith("?") || search === "" ? search : `?${search}`}`;
  if (
    !withSearch.startsWith("/") ||
    withSearch.startsWith("//") ||
    withSearch.includes("\\")
  ) {
    return "/";
  }
  return withSearch;
}

export type AuthFeedbackCode =
  | "denied"
  | "cancelled"
  | "failed"
  | "origin_mismatch";

export function authFeedbackMessage(
  code: string | null | undefined
): string | null {
  switch (code) {
    case "denied":
      return "로그인할 수 없습니다. 계정 상태를 확인한 뒤 다시 시도해주세요.";
    case "cancelled":
      return "카카오 로그인이 취소되었습니다.";
    case "failed":
      return "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
    case "origin_mismatch":
      return "앱 주소 설정(APP_ORIGIN)이 현재 접속 주소와 달라 로그인을 시작할 수 없습니다.";
    default:
      return null;
  }
}
