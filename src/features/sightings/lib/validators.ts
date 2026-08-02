import type { SightingFormData, SightingFormErrors } from "../model/types";

const SEOUL_OFFSET = "+09:00";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function seoulParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  };
}

/** datetime-local 서울 벽시계 → Instant (런타임 TZ 비의존) */
function parseSeoulDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value.trim()
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${pad2(Number(second))}${SEOUL_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const roundTrip = seoulParts(parsed);
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

/**
 * 제보 폼의 유효성을 검사합니다.
 * 필수 항목: 사진, 좌표(lat/lng)
 */
export function validateSightingForm(
  data: SightingFormData,
  now: Date = new Date()
): SightingFormErrors {
  const errors: SightingFormErrors = {};

  if (!data.photo) {
    errors.photo = "사진을 등록해주세요.";
  }

  // 좌표 정보가 0, 0이 아니거나 비어있지 않은지 확인
  if (!data.lat || !data.lng) {
    errors.location = "위치 정보가 필요합니다.";
  }

  if (!data.time.trim()) {
    errors.time = "목격 시각을 입력해주세요.";
  } else {
    const occurredAt = parseSeoulDateTimeLocal(data.time);
    if (!occurredAt) {
      errors.time = "올바른 목격 시각을 입력해주세요.";
    } else if (occurredAt.getTime() > now.getTime()) {
      errors.time = "미래 시각은 입력할 수 없습니다.";
    }
  }

  return errors;
}
