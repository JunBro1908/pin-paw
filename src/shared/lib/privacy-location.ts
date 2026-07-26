const PUBLIC_LOCATION_GRID_DEGREES = 0.05;

export interface PreciseRecommendationLocation {
  lat: number;
  lng: number;
}

export type ApproximateRecommendationLocation = {
  lat: number;
  lng: number;
  locationPrecision: "approximate";
};

/**
 * 좌표를 공개 지도와 동일한 약 5.5km 격자의 중심점으로 이동합니다.
 * 같은 격자 안의 요청은 항상 같은 값을 반환해 viewport sweep 정밀화를 막습니다.
 */
export function maskCoordinate(
  coordinate: number,
  gridSize = PUBLIC_LOCATION_GRID_DEGREES
): number {
  if (!Number.isFinite(coordinate) || !Number.isFinite(gridSize)) {
    throw new TypeError("Location coordinates and grid size must be finite.");
  }
  if (gridSize <= 0) {
    throw new RangeError("Location grid size must be greater than zero.");
  }

  return Number(
    ((Math.floor(coordinate / gridSize) + 0.5) * gridSize).toFixed(6)
  );
}

/**
 * recommendation_cache에는 서버 계산용 정밀 좌표가 남아 있어도, API 경계를
 * 통과하는 모든 추천 좌표는 근사화합니다. 북마크 claim은 매칭 승인이 아니므로
 * 정밀 좌표를 해제하는 조건으로 사용하지 않습니다.
 */
export function protectRecommendationLocations<
  T extends PreciseRecommendationLocation,
>(
  items: readonly T[]
): Array<Omit<T, "lat" | "lng"> & ApproximateRecommendationLocation> {
  return items.map((item) => ({
    ...item,
    lat: maskCoordinate(item.lat),
    lng: maskCoordinate(item.lng),
    locationPrecision: "approximate",
  }));
}
