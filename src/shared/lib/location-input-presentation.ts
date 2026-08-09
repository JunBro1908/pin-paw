export type LocationInputSource = "geolocation" | "selected";

export type LocationInputStatus =
  | "locating"
  | LocationInputSource
  | "denied"
  | "error";

export function formatLocationInputStatus(status: LocationInputStatus): string {
  return {
    locating: "현재 위치를 확인하고 있어요",
    geolocation: "현재 위치가 입력되었어요.",
    selected: "선택한 위치가 입력되었어요.",
    denied: "위치 권한을 허용하거나 지도에서 선택해 주세요",
    error: "위치를 확인하지 못했어요. 지도에서 선택해 주세요",
  }[status];
}
