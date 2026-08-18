"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { Text } from "@/shared/ui/Text";
import { useSeoulDatetimeLocalMax } from "@/shared/hooks/useSeoulDatetimeLocalMax";
import {
  formatSightingLocationStatus,
  type SightingLocationStatus,
} from "../lib/sighting-form-presentation";

export interface SightingEssentialsProps {
  photoUrl: string | null;
  photoUrls?: string[];
  multiple?: boolean;
  photoHint?: string;
  occurredAt: string;
  photoLabel?: string;
  photoError?: string;
  locationError?: string;
  timeError?: string;
  locationStatus: SightingLocationStatus;
  disabled: boolean;
  onPhotoChange(file: File | null, files?: File[]): void;
  onPhotoRemove?(index: number): void;
  onOccurredAtChange(value: string): void;
  onOpenLocationPicker(): void;
}

const inputBase =
  "w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-[15px] text-text-main shadow-sm outline-none transition-all focus:border-action-primary focus:ring-2 focus:ring-action-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

function FieldTitle({
  icon,
  label,
  required,
  error,
}: {
  icon: "camera" | "location" | "clock";
  label: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Icon name={icon} size={18} className="text-action-primary" />
      <Text variant="body" color="main" className="font-semibold">
        {label}
        {required ? <span className="text-action-primary"> *</span> : null}
      </Text>
      {error ? (
        <span role="alert" className="text-error text-xs font-medium">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function SightingEssentials({
  photoUrl,
  photoUrls = photoUrl ? [photoUrl] : [],
  multiple = false,
  photoHint,
  occurredAt,
  photoLabel = "사진 추가",
  photoError,
  locationError,
  timeError,
  locationStatus,
  disabled,
  onPhotoChange,
  onPhotoRemove,
  onOccurredAtChange,
  onOpenLocationPicker,
}: SightingEssentialsProps) {
  const maxOccurredAt = useSeoulDatetimeLocalMax();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoUrls.length && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [photoUrls]);

  return (
    <section className="space-y-6" aria-label="필수 목격 정보">
      <div className="space-y-3">
        <FieldTitle
          icon="camera"
          label={photoLabel}
          required
          error={photoError}
        />
        {photoHint ? (
          <Text variant="caption" color="caption" className="block text-xs">
            {photoHint}
          </Text>
        ) : null}
        <div className="relative">
          <input
            ref={fileInputRef}
            id="sighting-photo"
            type="file"
            accept="image/jpeg,image/png"
            multiple={multiple}
            disabled={disabled}
            className="peer sr-only"
            onChange={(event) => {
              onPhotoChange(
                event.currentTarget.files?.[0] ?? null,
                Array.from(event.currentTarget.files ?? [])
              );
              event.currentTarget.value = "";
            }}
          />
          <label
            htmlFor="sighting-photo"
            className={cn(
              "group border-border-subtle bg-surface-soft hover:border-action-primary/50 hover:bg-accent-warm/10 peer-focus-visible:outline-action-primary relative flex aspect-4/3 max-h-80 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
              disabled && "pointer-events-none opacity-60",
              photoError && "border-error"
            )}
          >
            {photoUrls.length ? (
              <Image
                src={photoUrls[0]}
                alt="선택한 목격 사진 미리보기"
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                unoptimized
                className="object-contain p-2"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="border-border-subtle bg-surface text-action-primary flex h-16 w-16 items-center justify-center rounded-full border shadow-sm">
                  <Icon name="camera" size={30} />
                </span>
                <Text variant="body" color="sub" className="font-medium">
                  촬영 및 앨범 선택
                </Text>
              </div>
            )}
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-black/55 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm">
              <span>{photoUrls.length ? "사진 더 추가" : "사진 선택"}</span>
              <span>
                {photoUrls.length}/{multiple ? 5 : 1}
              </span>
            </div>
          </label>
          {photoUrls.length ? (
            <div
              className="flex gap-2 overflow-x-auto py-2"
              aria-label="선택한 사진"
            >
              {photoUrls.map((url, index) => (
                <div key={url} className="relative h-16 w-16 shrink-0">
                  <Image
                    src={url}
                    alt={`${index + 1}번째 선택 사진`}
                    fill
                    unoptimized
                    className={cn(
                      "rounded-xl border-2 object-cover",
                      index === 0
                        ? "border-accent-warm-text"
                        : "border-border-subtle"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onPhotoRemove?.(index)}
                    disabled={disabled}
                    className="bg-text-main absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs text-white shadow-sm"
                    aria-label={`${index + 1}번째 사진 제거`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <FieldTitle
          icon="location"
          label="목격 위치"
          required
          error={locationError}
        />
        <div
          aria-live="polite"
          className={cn(
            "border-border-subtle bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm",
            locationError && "border-error"
          )}
        >
          <Text
            variant="body"
            className={cn(
              "min-w-0 truncate font-medium",
              locationStatus === "geolocation" || locationStatus === "selected"
                ? "text-text-main"
                : "text-text-sub"
            )}
          >
            {formatSightingLocationStatus(locationStatus)}
          </Text>
          <button
            type="button"
            onClick={onOpenLocationPicker}
            disabled={disabled}
            className="bg-surface-soft text-action-primary hover:bg-accent-warm/20 focus-visible:outline-action-primary flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="map" size={16} />
            위치 수정
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label
          htmlFor="sighting-occurred-at"
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <Icon name="clock" size={18} className="text-action-primary" />
          <Text as="span" variant="body" color="main" className="font-semibold">
            목격 시각 <span className="text-action-primary">*</span>
          </Text>
          {timeError ? (
            <span
              id="sighting-time-error"
              role="alert"
              className="text-error text-xs font-medium"
            >
              {timeError}
            </span>
          ) : null}
        </label>
        <input
          id="sighting-occurred-at"
          type="datetime-local"
          name="time"
          value={occurredAt}
          max={maxOccurredAt}
          required
          aria-invalid={Boolean(timeError)}
          aria-describedby={timeError ? "sighting-time-error" : undefined}
          disabled={disabled}
          onChange={(event) => onOccurredAtChange(event.target.value)}
          className={cn(
            inputBase,
            "min-h-12 appearance-none py-3 text-base leading-normal [color-scheme:light_dark]",
            "[&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:opacity-70",
            "[&::-webkit-datetime-edit]:m-0 [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0",
            timeError && "border-error"
          )}
        />
      </div>
    </section>
  );
}
