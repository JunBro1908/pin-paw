/**
 * 한국(서울) 시간 기준 날짜/시간 유틸
 */

/** datetime-local input용 로컬 시간 문자열 (YYYY-MM-DDTHH:mm). UTC가 아닌 사용자 로컬 시간 기준 */
export function toLocalDatetimeLocalString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 표시용: 서울 시간대 옵션 (toLocaleString / toLocaleDateString에 병합) */
export const SEOUL_TZ = "Asia/Seoul" as const;

/** 표시용: 「8월 2일」 (서울 시간, 시각 제외) */
export function formatSeoulMonthDay(
  value: string | Date | null | undefined
): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    timeZone: SEOUL_TZ,
    month: "long",
    day: "numeric",
  });
}
