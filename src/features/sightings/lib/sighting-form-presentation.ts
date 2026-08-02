import { toLocalDatetimeLocalString } from "@/shared/lib/date";

export type SightingLocationStatus = "locating" | "ready" | "denied" | "error";

/** datetime-local용 서울 벽시계 값. 서버/클라이언트 모두 Asia/Seoul. */
export function toLocalDateTimeInputValue(date: Date): string {
  return toLocalDatetimeLocalString(date);
}

export function formatSightingLocationStatus(
  status: SightingLocationStatus
): string {
  return {
    locating: "현재 위치를 확인하고 있어요",
    ready: "현재 위치가 입력되었어요",
    denied: "위치 권한을 허용하거나 지도에서 선택해 주세요",
    error: "위치를 확인하지 못했어요. 지도에서 선택해 주세요",
  }[status];
}
