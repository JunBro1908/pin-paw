/**
 * 한국(서울) 시간 기준 날짜/시간 유틸
 */

export const SEOUL_TZ = "Asia/Seoul" as const;
const SEOUL_OFFSET = "+09:00";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function seoulDateTimeParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * datetime-local input용 서울 벽시계 문자열 (YYYY-MM-DDTHH:mm).
 * 서버(UTC) SSR에서도 기기 타임존과 무관하게 Asia/Seoul 기준이다.
 */
export function toLocalDatetimeLocalString(d: Date = new Date()): string {
  const { year, month, day, hour, minute } = seoulDateTimeParts(d);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * datetime-local 값(서울 벽시계)을 Instant로 파싱한다.
 * `new Date("YYYY-MM-DDTHH:mm")`의 런타임 로컬 TZ 의존을 피한다.
 */
export function parseSeoulDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim()
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${pad2(Number(second))}${SEOUL_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const roundTrip = seoulDateTimeParts(parsed);
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  ) {
    return null;
  }
  return parsed;
}

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
