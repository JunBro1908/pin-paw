"use client";

import { cn } from "@/shared/lib/cn";
import {
  SIZE_LABELS,
  SIZE_VALUES,
  type SizeValue,
} from "@/shared/constants/traitSizes";
import { TRAIT_TAGS } from "@/shared/constants/traitTags";
import { Icon } from "@/shared/ui/Icon";
import { Text } from "@/shared/ui/Text";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";
import { DOG_BREEDS, getBreedLabel } from "../constants/breeds";

const MAX_TAG_SELECT_SIGHTING = 5;
const inputBase =
  "w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-[15px] text-text-main shadow-sm outline-none transition-all focus:border-action-primary focus:ring-2 focus:ring-action-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const selectBase =
  "w-full cursor-pointer appearance-none rounded-xl border border-border-subtle bg-surface bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-4 py-3 pr-10 text-[15px] text-text-main shadow-sm outline-none transition-all focus:border-action-primary focus:ring-2 focus:ring-action-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

type OptionalFieldChangeEvent = React.ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export interface SightingOptionalDetailsProps {
  traitColor: string;
  traitSize: string;
  traitSpecies: string;
  traitTags: string[];
  description: string;
  disabled: boolean;
  onFieldChange(event: OptionalFieldChangeEvent): void;
  onTraitTagToggle(tagId: string): void;
}

export function SightingOptionalDetails({
  traitColor,
  traitSize,
  traitSpecies,
  traitTags,
  description,
  disabled,
  onFieldChange,
  onTraitTagToggle,
}: SightingOptionalDetailsProps) {
  return (
    <details className="group border-border-subtle bg-surface rounded-2xl border shadow-sm">
      <summary className="text-text-main focus-visible:outline-action-primary flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon name="paw" size={20} className="text-action-primary" />
          특징을 더 알려주기 (선택)
        </span>
        <span
          aria-hidden="true"
          className="text-text-sub transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>

      <div className="border-border-subtle space-y-6 border-t px-4 py-5">
        <ScrollablePanel variant="panel">
        <div className="space-y-3">
          <Text variant="body" className="text-text-main font-bold">
            색상 · 크기 · 종
          </Text>
          <label htmlFor="sighting-trait-color" className="sr-only">
            색상
          </label>
          <input
            id="sighting-trait-color"
            type="text"
            name="traitColor"
            value={traitColor}
            onChange={onFieldChange}
            disabled={disabled}
            placeholder="예: 갈색, 흰색 얼룩, 검정·흰색"
            maxLength={100}
            className={inputBase}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <select
                name="traitSize"
                value={traitSize}
                onChange={onFieldChange}
                disabled={disabled}
                aria-label="동물 크기"
                className={cn(
                  selectBase,
                  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]"
                )}
              >
                {SIZE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {SIZE_LABELS[value as SizeValue]}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <select
                name="traitSpecies"
                value={traitSpecies}
                onChange={onFieldChange}
                disabled={disabled}
                aria-label="동물 종과 품종"
                className={cn(
                  selectBase,
                  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]"
                )}
              >
                {DOG_BREEDS.map((breed) => (
                  <option key={breed} value={breed}>
                    {getBreedLabel(breed)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Text variant="caption" color="caption">
              특이사항 (최대 {MAX_TAG_SELECT_SIGHTING}개)
            </Text>
            <div className="flex flex-wrap gap-2">
              {TRAIT_TAGS.map((tag) => {
                const selected = traitTags.includes(tag.id);
                const tagDisabled =
                  disabled ||
                  (!selected && traitTags.length >= MAX_TAG_SELECT_SIGHTING);

                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onTraitTagToggle(tag.id)}
                    disabled={tagDisabled}
                    aria-pressed={selected}
                    className={cn(
                      "focus-visible:outline-action-primary min-h-11 rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                      selected
                        ? "bg-action-primary text-action-on-primary"
                        : "bg-surface-soft text-text-sub hover:bg-accent-warm/20",
                      tagDisabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    {tag.labelKo}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label
            htmlFor="sighting-description"
            className="text-text-main font-bold"
          >
            추가 설명
          </label>
          <textarea
            id="sighting-description"
            name="description"
            value={description}
            onChange={onFieldChange}
            disabled={disabled}
            placeholder="상세 정보를 입력해주세요"
            rows={4}
            className={cn(inputBase, "resize-none py-4")}
          />
        </div>
        </ScrollablePanel>
      </div>
    </details>
  );
}
