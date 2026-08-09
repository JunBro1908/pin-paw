import { getBreedLabel } from "../constants/breeds.ts";
import { formatDogSizeLabel } from "../../../shared/constants/traitSizes.ts";
import { getTagById } from "../../../shared/constants/traitTags.ts";

export type SightingDetailFieldInput = {
  trait_species?: string | null;
  trait_size?: string | null;
  trait_color?: string | null;
  trait_tags?: string[] | null;
  note?: string | null;
};

export type SightingDetailField = {
  label: "종" | "크기" | "색/무늬" | "특이사항" | "메모";
  value: string;
};

function textOrEmpty(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function formatSpecies(value: string | null | undefined): string {
  const species = textOrEmpty(value);
  return species ? getBreedLabel(species) : "정보 없음";
}

function formatSize(value: string | null | undefined): string {
  const rawSize = textOrEmpty(value);
  if (!rawSize) return "정보 없음";
  return formatDogSizeLabel(rawSize) ?? "정보 없음";
}

function formatTraitTags(value: string[] | null | undefined): string {
  const labels = (value ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => getTagById(tag)?.labelKo)
    .filter((label): label is string => Boolean(label));

  return labels.length > 0 ? labels.join(", ") : "없음";
}

/** A fixed order makes a sparse report as easy to scan as a complete one. */
export function getSightingDetailFields(
  input: SightingDetailFieldInput
): SightingDetailField[] {
  return [
    { label: "종", value: formatSpecies(input.trait_species) },
    { label: "크기", value: formatSize(input.trait_size) },
    {
      label: "색/무늬",
      value: textOrEmpty(input.trait_color) ?? "정보 없음",
    },
    { label: "특이사항", value: formatTraitTags(input.trait_tags) },
    { label: "메모", value: textOrEmpty(input.note) ?? "없음" },
  ];
}
