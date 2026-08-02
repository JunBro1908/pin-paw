import type { SightingFormData, SightingFormErrors } from "../model/types";

function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  parsed.setHours(hour, minute, second, 0);

  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getHours() === hour &&
    parsed.getMinutes() === minute &&
    parsed.getSeconds() === second
    ? parsed
    : null;
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
    const occurredAt = parseLocalDateTime(data.time);
    if (!occurredAt) {
      errors.time = "올바른 목격 시각을 입력해주세요.";
    } else if (occurredAt.getTime() > now.getTime()) {
      errors.time = "미래 시각은 입력할 수 없습니다.";
    }
  }

  return errors;
}
