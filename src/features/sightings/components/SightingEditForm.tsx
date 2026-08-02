"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createClient } from "@/shared/supabase/client";
import { Button } from "@/shared/ui/Button";
import { Text } from "@/shared/ui/Text";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import {
  DOG_BREEDS,
  getBreedLabel,
  SPECIES_UNKNOWN,
} from "../constants/breeds";
import {
  SIZE_LABELS,
  SIZE_VALUES,
  type SizeValue,
} from "@/shared/constants/traitSizes";
import { TRAIT_TAGS } from "@/shared/constants/traitTags";
import { TRAIT_COLOR_OPTIONS } from "@/shared/constants/traitColors";
import {
  completeSubmission,
  fingerprintUploadFile,
  prepareSubmission,
  type FormSubmissionAttempt,
} from "@/shared/lib/form-submission-lifecycle";
import type { EditableSighting } from "../model/types";

interface PhotoDraft {
  id: string;
  key?: string;
  file?: File;
  url: string;
}

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-600 dark:bg-gray-800";
const selectClass = `${inputClass} appearance-none`;
const MAX_TAG_SELECT = 5;

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function SightingEditForm({ sightingId }: { sightingId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<EditableSighting | null>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const submissionAttemptRef = useRef<FormSubmissionAttempt | null>(null);
  const naverMapsClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "";

  useEffect(() => {
    if (!session?.access_token) return;
    fetch(`/api/v1/me/sightings/${sightingId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(
            result.error?.message ?? "제보를 불러오지 못했습니다."
          );
        }
        return result.data as EditableSighting;
      })
      .then((data) => {
        const client = createClient();
        if (!client) throw new Error("Storage client unavailable");
        const storage = client.storage.from("sightings");
        setItem(data);
        setPhotos(
          data.photo_keys.map((key) => ({
            id: key,
            key,
            url: storage.getPublicUrl(key).data.publicUrl,
          }))
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "오류가 발생했습니다."
        )
      );
  }, [session?.access_token, sightingId]);

  if (error && !item) return <Text color="error">{error}</Text>;
  if (!item) return <Text color="caption">불러오는 중...</Text>;

  const update = <K extends keyof EditableSighting>(
    key: K,
    value: EditableSighting[K]
  ) => {
    submissionAttemptRef.current = null;
    setItem((current) => (current ? { ...current, [key]: value } : current));
  };

  const upload = async (
    photo: PhotoDraft,
    uploadIdempotencyKey: string,
    index: number
  ): Promise<string> => {
    if (photo.key) return photo.key;
    if (!photo.file || !session?.access_token) {
      throw new Error("사진이 없습니다.");
    }
    const presign = await fetch("/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "Idempotency-Key": `${uploadIdempotencyKey}:${index}`,
      },
      body: JSON.stringify({
        purpose: "sighting_photo",
        files: [{ contentType: photo.file.type, sizeBytes: photo.file.size }],
      }),
    });
    const result = await presign.json();
    const intent = result.data?.uploads?.[0];
    if (!presign.ok || !intent) {
      throw new Error(
        result.error?.message ?? "사진 업로드 준비에 실패했습니다."
      );
    }
    const uploaded = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": photo.file.type },
      body: photo.file,
    });
    if (!uploaded.ok) throw new Error("사진 업로드에 실패했습니다.");
    setPhotos((current) =>
      current.map((entry) =>
        entry.id === photo.id ? { ...entry, key: intent.fileKey } : entry
      )
    );
    return intent.fileKey as string;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!session?.access_token || photos.length < 1 || photos.length > 3) {
      setError("사진은 1장 이상 3장 이하로 유지해야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const domainPayload = {
        location: { lat: item.lat, lng: item.lng },
        occurredAt: new Date(item.occurred_at).toISOString(),
        traitColor: item.trait_color,
        traitSize: item.trait_size,
        traitSpecies: item.trait_species,
        traitTags: item.trait_tags,
        note: item.note,
      };
      const fileFingerprints = await Promise.all(
        photos.map(async (photo) =>
          photo.file
            ? fingerprintUploadFile(photo.file)
            : `existing:${photo.key}`
        )
      );
      const payloadFingerprint = JSON.stringify({
        files: fileFingerprints,
        domainPayload,
      });
      const attempt = prepareSubmission(
        submissionAttemptRef.current,
        payloadFingerprint,
        () => crypto.randomUUID()
      );
      submissionAttemptRef.current = attempt;

      const photoKeys = await Promise.all(
        photos.map((photo, index) =>
          upload(photo, attempt.uploadIdempotencyKey, index)
        )
      );

      const response = await fetch(`/api/v1/me/sightings/${sightingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "Idempotency-Key": attempt.submissionIdempotencyKey,
        },
        body: JSON.stringify({ ...domainPayload, photoKeys }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? "제보 수정에 실패했습니다.");
      }
      submissionAttemptRef.current = completeSubmission();
      router.push("/my");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-2">
        <Text className="font-bold">사진 (1~3장)</Text>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-xl bg-gray-100"
            >
              <Image
                src={photo.url}
                alt="제보 사진"
                fill
                unoptimized={Boolean(photo.file)}
                className="object-cover"
              />
              <button
                type="button"
                aria-label="사진 제거"
                onClick={() => {
                  submissionAttemptRef.current = null;
                  setPhotos((current) =>
                    current.filter((entry) => entry.id !== photo.id)
                  );
                }}
                className="absolute top-1 right-1 rounded-full bg-black/60 px-2 py-1 text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < 3 && (
            <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed">
              + 추가
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).slice(
                    0,
                    3 - photos.length
                  );
                  submissionAttemptRef.current = null;
                  setPhotos((current) => [
                    ...current,
                    ...files.map((file) => ({
                      id: crypto.randomUUID(),
                      file,
                      url: URL.createObjectURL(file),
                    })),
                  ]);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </section>

      <label className="block text-sm font-medium">
        목격 시각
        <input
          className={`${inputClass} mt-1`}
          type="datetime-local"
          value={localDateTime(item.occurred_at)}
          onChange={(event) =>
            update("occurred_at", new Date(event.target.value).toISOString())
          }
          required
        />
      </label>

      <div className="space-y-2">
        <Text className="font-medium">위치</Text>
        <Text variant="caption" color="caption">
          {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
        </Text>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            if (!naverMapsClientId) {
              setError(
                "지도 설정(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)이 없어 위치를 변경할 수 없습니다."
              );
              return;
            }
            setMapOpen(true);
          }}
        >
          지도에서 위치 수정
        </Button>
      </div>

      <label className="block text-sm font-medium">
        색상
        <select
          className={`${selectClass} mt-1`}
          value={item.trait_color ?? ""}
          onChange={(event) =>
            update("trait_color", event.target.value || null)
          }
        >
          <option value="">선택</option>
          {TRAIT_COLOR_OPTIONS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        크기
        <select
          className={`${selectClass} mt-1`}
          value={(item.trait_size as SizeValue | null) ?? "unknown"}
          onChange={(event) => update("trait_size", event.target.value)}
        >
          {SIZE_VALUES.map((size) => (
            <option key={size} value={size}>
              {SIZE_LABELS[size]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        종/품종
        <select
          className={`${selectClass} mt-1`}
          value={item.trait_species ?? SPECIES_UNKNOWN}
          onChange={(event) => update("trait_species", event.target.value)}
        >
          {DOG_BREEDS.map((breed) => (
            <option key={breed} value={breed}>
              {getBreedLabel(breed)}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">특징 태그</legend>
        <div className="flex flex-wrap gap-2">
          {TRAIT_TAGS.map((tag) => {
            const selected = item.trait_tags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${
                  selected
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                }`}
                onClick={() => {
                  if (selected) {
                    update(
                      "trait_tags",
                      item.trait_tags.filter((value) => value !== tag.id)
                    );
                    return;
                  }
                  if (item.trait_tags.length >= MAX_TAG_SELECT) return;
                  update("trait_tags", [...item.trait_tags, tag.id]);
                }}
              >
                {tag.labelKo}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        설명
        <textarea
          className={`${inputClass} mt-1`}
          value={item.note ?? ""}
          onChange={(event) => update("note", event.target.value || null)}
          placeholder="설명"
          maxLength={2000}
          rows={4}
        />
      </label>

      {error ? <Text color="error">{error}</Text> : null}
      <Button
        type="submit"
        className="w-full"
        isLoading={saving}
        disabled={photos.length < 1}
      >
        수정 저장
      </Button>

      {mapOpen && naverMapsClientId ? (
        <LocationPicker
          clientId={naverMapsClientId}
          initialLat={item.lat}
          initialLng={item.lng}
          title="목격 위치 선택"
          onSelect={(lat, lng) => {
            update("lat", lat);
            update("lng", lng);
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      ) : null}
    </form>
  );
}
