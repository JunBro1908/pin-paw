import { SightingFormData, SightingFormErrors } from "../model/types";

/**
 * 제보 폼의 유효성을 검사합니다.
 * 필수 항목: 사진, 위치
 */
export function validateSightingForm(
  data: SightingFormData
): SightingFormErrors {
  const errors: SightingFormErrors = {};

  if (!data.photo) {
    errors.photo = "목격 장소의 사진을 등록해주세요.";
  }

  if (!data.location.trim()) {
    errors.location = "목격 위치를 입력하거나 선택해주세요.";
  }

  return errors;
}
