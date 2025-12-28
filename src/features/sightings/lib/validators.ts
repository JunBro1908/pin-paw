import { SightingFormData, SightingFormErrors } from "../model/types";

/**
 * 제보 폼의 유효성을 검사합니다.
 * 필수 항목: 사진, 좌표(lat/lng)
 */
export function validateSightingForm(data: SightingFormData): SightingFormErrors {
  const errors: SightingFormErrors = {};

  if (!data.photo) {
    errors.photo = "사진을 등록해주세요.";
  }

  // 좌표 정보가 0, 0이 아니거나 비어있지 않은지 확인
  if (!data.lat || !data.lng) {
    errors.location = "위치 정보가 필요합니다.";
  }

  return errors;
}
