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
const fieldLabelClass = "text-text-main mb-1.5 block text-sm font-semibold";
const SELECT_CHEVRON =
  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]";

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
  /** Defaults to sighting create/edit limit (5). Lost-post edit uses 8. */
  maxTags?: number;
  /** Prefix for field ids to avoid collisions when reused. */
  idPrefix?: string;
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
  maxTags = MAX_TAG_SELECT_SIGHTING,
  idPrefix = "sighting",
  onFieldChange,
  onTraitTagToggle,
}: SightingOptionalDetailsProps) {
  const colorId = `${idPrefix}-trait-color`;
  const sizeId = `${idPrefix}-trait-size`;
  const speciesId = `${idPrefix}-trait-species`;
  const descriptionId = `${idPrefix}-description`;

  return (
    <details className="group border-border-subtle bg-surface rounded-2xl border shadow-sm">
      <summary className="text-text-main focus-visible:outline-action-primary flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon name="paw" size={18} className="text-action-primary" />
          추가 정보 입력하기 (선택)
        </span>
        <span
          aria-hidden="true"
          className="text-text-sub transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>

      <div className="border-border-subtle border-t px-4 py-5">
        <ScrollablePanel variant="panel" className="space-y-5">
          <div className="space-y-3">
            <div>
              <label htmlFor={colorId} className={fieldLabelClass}>
                색상
              </label>
              <input
                id={colorId}
                type="text"
                name="traitColor"
                value={traitColor}
                onChange={onFieldChange}
                disabled={disabled}
                placeholder="예: 갈색, 흰색 얼룩, 검정·흰색"
                maxLength={100}
                className={inputBase}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={sizeId} className={fieldLabelClass}>
                  크기
                </label>
                <div className="relative">
                  <select
                    id={sizeId}
                    name="traitSize"
                    value={traitSize}
                    onChange={onFieldChange}
                    disabled={disabled}
                    className={cn(selectBase, SELECT_CHEVRON)}
                  >
                    {SIZE_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {SIZE_LABELS[value as SizeValue]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={speciesId} className={fieldLabelClass}>
                  종
                </label>
                <div className="relative">
                  <select
                    id={speciesId}
                    name="traitSpecies"
                    value={traitSpecies}
                    onChange={onFieldChange}
                    disabled={disabled}
                    className={cn(selectBase, SELECT_CHEVRON)}
                  >
                    {DOG_BREEDS.map((breed) => (
                      <option key={breed} value={breed}>
                        {getBreedLabel(breed)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Text variant="caption" color="caption">
                특이사항 (최대 {maxTags}개)
              </Text>
              <div className="flex flex-wrap gap-2">
                {TRAIT_TAGS.map((tag) => {
                  const selected = traitTags.includes(tag.id);
                  const tagDisabled =
                    disabled || (!selected && traitTags.length >= maxTags);

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

          <div className="space-y-2 pt-1">
            <label
              htmlFor={descriptionId}
              className="text-text-main block font-semibold"
            >
              추가 설명
            </label>
            <textarea
              id={descriptionId}
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
