import { toLocalDatetimeLocalString } from "@/shared/lib/date";
import {
  formatLocationInputStatus,
  type LocationInputStatus,
} from "@/shared/lib/location-input-presentation";

export type SightingLocationStatus = LocationInputStatus;

/** datetime-local용 서울 벽시계 값. 서버/클라이언트 모두 Asia/Seoul. */
export function toLocalDateTimeInputValue(date: Date): string {
  return toLocalDatetimeLocalString(date);
}

export function formatSightingLocationStatus(
  status: SightingLocationStatus
): string {
  return formatLocationInputStatus(status);
}
