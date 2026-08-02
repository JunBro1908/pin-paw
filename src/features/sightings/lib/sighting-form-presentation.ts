export type SightingLocationStatus = "locating" | "ready" | "denied" | "error";

const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalDateTimeInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
