import type { MapSourceType } from "../types/naver";

export type MapMarkerKind = "point" | "cluster";

/** Sighting pin status colors — no red. */
export const MAP_PIN_STATUS_COLORS = {
  unseen: "#3B82F6",
  seen: "#9CA3AF",
  claimed: "#EAB308",
} as const;

export function getSightingPinStatusColor(feedback?: {
  seen?: boolean;
  claimed?: boolean;
} | null) {
  if (feedback?.claimed) return MAP_PIN_STATUS_COLORS.claimed;
  if (feedback?.seen) return MAP_PIN_STATUS_COLORS.seen;
  return MAP_PIN_STATUS_COLORS.unseen;
}

export function normalizeMapSourceType(value: unknown): MapSourceType {
  return value === "shelter" ? "shelter" : "sighting";
}

export function getMapMarkerPresentation(
  sourceType: MapSourceType,
  kind: MapMarkerKind
) {
  const shelter = sourceType === "shelter";

  return {
    label: shelter
      ? kind === "cluster"
        ? "보호소 묶음"
        : "보호소"
      : kind === "cluster"
        ? "목격 묶음"
        : "목격",
    // Clusters keep source tint; point borders use status colors in the renderer.
    color: shelter ? "#28736F" : MAP_PIN_STATUS_COLORS.unseen,
    shape: kind === "cluster" ? "cluster" : shelter ? "rounded-square" : "pin",
  } as const;
}
