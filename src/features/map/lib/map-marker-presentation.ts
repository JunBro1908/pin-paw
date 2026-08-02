import type { MapSourceType } from "../types/naver";

export type MapMarkerKind = "point" | "cluster";

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
    color: shelter ? "#28736F" : "#087A3E",
    shape: kind === "cluster" ? "cluster" : shelter ? "rounded-square" : "pin",
  } as const;
}
