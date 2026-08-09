import { formatDogSizeLabel } from "../constants/traitSizes.ts";

export const SHARE_PREVIEW_SENSITIVE_KEYS = [
  "note",
  "lat",
  "lng",
  "location",
  "owner_id",
  "user_id",
  "contact",
  "phone",
  "email",
  "access_token",
  "refresh_token",
  "token",
] as const;

export type ShareableLostPostRow = {
  id: string;
  status: string;
  pet_name: string | null;
  lost_at: string | null;
  trait_color: string | null;
  trait_size: string | null;
  trait_species: string | null;
  trait_tags: string[] | null;
  cover_photo_key: string | null;
  hidden_at: string | null;
  archived_at: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  owner_id?: string | null;
};

export type SafeLostPostSharePreview = {
  id: string;
  status: "searching";
  petName: string | null;
  lostAt: string | null;
  traitColor: string | null;
  traitSize: string | null;
  traitSpecies: string | null;
  traitTags: string[];
  coverPhotoKey: string | null;
  approximateArea: {
    lat: number;
    lng: number;
    locationPrecision: "approximate";
  } | null;
  sharePath: string;
};

export function maskShareCoordinate(coordinate: number): number {
  const gridSize = 0.05;
  if (!Number.isFinite(coordinate)) {
    throw new TypeError("Location coordinates must be finite.");
  }
  return Number(
    ((Math.floor(coordinate / gridSize) + 0.5) * gridSize).toFixed(6)
  );
}

/**
 * 공개 공유/OG용 미리보기. 정밀 좌표·비공개 note·소유자 식별자는 절대 포함하지 않는다.
 */
export function buildLostPostSharePreview(
  row: ShareableLostPostRow
): SafeLostPostSharePreview | null {
  if (
    row.status !== "searching" ||
    row.hidden_at != null ||
    row.archived_at != null
  ) {
    return null;
  }

  const approximateArea =
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lng)
      ? {
          lat: maskShareCoordinate(row.lat),
          lng: maskShareCoordinate(row.lng),
          locationPrecision: "approximate" as const,
        }
      : null;

  return {
    id: row.id,
    status: "searching",
    petName: row.pet_name?.trim() || null,
    lostAt: row.lost_at,
    traitColor: row.trait_color,
    traitSize: row.trait_size,
    traitSpecies: row.trait_species,
    traitTags: Array.isArray(row.trait_tags) ? row.trait_tags.slice(0, 8) : [],
    coverPhotoKey: row.cover_photo_key,
    approximateArea,
    sharePath: `/share/lost-posts/${row.id}`,
  };
}

export function assertSharePreviewIsSafe(
  preview: Record<string, unknown>
): void {
  const serialized = JSON.stringify(preview).toLowerCase();
  for (const key of SHARE_PREVIEW_SENSITIVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(preview, key)) {
      throw new Error(`share_preview_contains_sensitive_key:${key}`);
    }
  }
  if (
    /"note"\s*:/.test(serialized) ||
    /"owner_id"\s*:/.test(serialized) ||
    /"access_token"\s*:/.test(serialized)
  ) {
    throw new Error("share_preview_leaks_sensitive_payload");
  }
}

/** 공개 티저/OG용 특성 라벨. unknown·모름은 숨기고 크기는 한글로 표기한다. */
export function buildShareTraitLabels(
  preview: Pick<
    SafeLostPostSharePreview,
    "traitColor" | "traitSize" | "traitSpecies"
  >
): string[] {
  const labels: string[] = [];
  const species = preview.traitSpecies?.trim();
  if (species && species !== "unknown" && species !== "모름") {
    labels.push(species);
  }
  const sizeLabel = formatDogSizeLabel(preview.traitSize);
  if (sizeLabel) labels.push(sizeLabel);
  const color = preview.traitColor?.trim();
  if (color && color !== "unknown" && color !== "모름") {
    labels.push(color);
  }
  return labels;
}

export function buildOpenGraphDescription(
  preview: SafeLostPostSharePreview,
  options?: { regionLabel?: string | null; lostDateLabel?: string | null }
): string {
  const traits = buildShareTraitLabels(preview).join(" · ");
  const name = preview.petName ?? "강아지";
  const datePart = options?.lostDateLabel?.trim() || null;
  const regionPart = options?.regionLabel?.trim() || null;
  const areaHint =
    regionPart ||
    (preview.approximateArea ? "근처에서 찾고 있습니다." : "찾고 있습니다.");
  return [`${name} 실종 제보`, datePart, regionPart ?? areaHint, traits]
    .filter(Boolean)
    .join(" · ");
}
