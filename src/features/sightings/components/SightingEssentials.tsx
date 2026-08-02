"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { Text } from "@/shared/ui/Text";
import {
  formatSightingLocationStatus,
  toLocalDateTimeInputValue,
  type SightingLocationStatus,
} from "../lib/sighting-form-presentation";

export interface SightingEssentialsProps {
  photoUrl: string | null;
  occurredAt: string;
  photoError?: string;
  locationError?: string;
  timeError?: string;
  locationStatus: SightingLocationStatus;
  disabled: boolean;
  onPhotoChange(file: File | null): void;
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
  occurredAt,
  photoError,
  locationError,
  timeError,
  locationStatus,
  disabled,
  onPhotoChange,
  onOccurredAtChange,
  onOpenLocationPicker,
}: SightingEssentialsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoUrl && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [photoUrl]);

  return (
    <section className="space-y-6" aria-label="필수 목격 정보">
      <div className="space-y-3">
        <FieldTitle
          icon="camera"
          label="사진 추가"
          required
          error={photoError}
        />
        <div className="relative">
          <input
            ref={fileInputRef}
            id="sighting-photo"
            type="file"
            accept="image/*"
            disabled={disabled}
            className="peer sr-only"
            onChange={(event) =>
              onPhotoChange(event.currentTarget.files?.[0] ?? null)
            }
          />
          <label
            htmlFor="sighting-photo"
            className={cn(
              "group border-border-subtle bg-surface-soft hover:border-action-primary/50 hover:bg-accent-warm/10 peer-focus-visible:outline-action-primary relative flex aspect-4/3 max-h-80 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
              disabled && "pointer-events-none opacity-60",
              photoError && "border-error"
            )}
          >
            {photoUrl ? (
              <Image
                src={photoUrl}
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
          </label>
          {photoUrl ? (
            <button
              type="button"
              onClick={() => onPhotoChange(null)}
              disabled={disabled}
              aria-label="선택한 사진 제거"
              className="focus-visible:outline-action-primary absolute top-4 right-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true">×</span>
            </button>
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
            "border-border-subtle bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-4 shadow-sm",
            locationError && "border-error"
          )}
        >
          <Text
            variant="body"
            className={cn(
              "font-medium",
              locationStatus === "ready" ? "text-text-main" : "text-text-sub"
            )}
          >
            {formatSightingLocationStatus(locationStatus)}
          </Text>
          <button
            type="button"
            onClick={onOpenLocationPicker}
            disabled={disabled}
            className="bg-surface-soft text-action-primary hover:bg-accent-warm/20 focus-visible:outline-action-primary flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="map" size={18} />
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
          max={toLocalDateTimeInputValue(new Date())}
          required
          aria-invalid={Boolean(timeError)}
          aria-describedby={timeError ? "sighting-time-error" : undefined}
          disabled={disabled}
          onChange={(event) => onOccurredAtChange(event.target.value)}
          className={cn(inputBase, "py-4", timeError && "border-error")}
        />
      </div>
    </section>
  );
}
