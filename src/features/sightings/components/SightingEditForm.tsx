"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createClient } from "@/shared/supabase/client";
import { Button } from "@/shared/ui/Button";
import { Text } from "@/shared/ui/Text";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import { SPECIES_UNKNOWN } from "../constants/breeds";
import {
  completeSubmission,
  fingerprintUploadFile,
  prepareSubmission,
  type FormSubmissionAttempt,
} from "@/shared/lib/form-submission-lifecycle";
import {
  toLocalDateTimeInputValue,
  type SightingLocationStatus,
} from "../lib/sighting-form-presentation";
import { parseSeoulDateTimeLocal } from "@/shared/lib/date";
import { TRAIT_TAGS_MAX } from "@/shared/constants/traitTags";
import type { EditableSighting } from "../model/types";
import { SightingEssentials } from "./SightingEssentials";
import { SightingOptionalDetails } from "./SightingOptionalDetails";

interface PhotoDraft {
  id: string;
  key?: string;
  file?: File;
  url: string;
}

const MAX_EDIT_PHOTOS = 1;

export function SightingEditForm({ sightingId }: { sightingId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<EditableSighting | null>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [occurredAt, setOccurredAt] = useState("");
  const [traitColor, setTraitColor] = useState("");
  const [traitSize, setTraitSize] = useState("unknown");
  const [traitSpecies, setTraitSpecies] = useState(SPECIES_UNKNOWN);
  const [traitTags, setTraitTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
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
        setOccurredAt(toLocalDateTimeInputValue(new Date(data.occurred_at)));
        setTraitColor(data.trait_color ?? "");
        setTraitSize(data.trait_size ?? "unknown");
        setTraitSpecies(data.trait_species ?? SPECIES_UNKNOWN);
        setTraitTags((data.trait_tags ?? []).slice(0, TRAIT_TAGS_MAX));
        setDescription(data.note ?? "");
        setPhotos(
          data.photo_keys.slice(0, MAX_EDIT_PHOTOS).map((key) => ({
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

  const photoUrl = photos[0]?.url ?? null;
  const locationStatus: SightingLocationStatus = "selected";
  const photoError =
    showErrors && photos.length !== MAX_EDIT_PHOTOS
      ? "사진을 등록해주세요."
      : undefined;

  const bumpDraft = () => {
    submissionAttemptRef.current = null;
  };

  const handlePhotoChange = (file: File | null) => {
    bumpDraft();
    setPhotos((current) => {
      for (const photo of current) {
        if (photo.file) URL.revokeObjectURL(photo.url);
      }
      if (!file) return [];
      return [
        {
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
        },
      ];
    });
  };

  const handleOptionalFieldChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    bumpDraft();
    const { name, value } = event.target;
    if (name === "traitColor") setTraitColor(value);
    else if (name === "traitSize") setTraitSize(value);
    else if (name === "traitSpecies") setTraitSpecies(value);
    else if (name === "description") setDescription(value);
  };

  const handleToggleTag = (tagId: string) => {
    bumpDraft();
    setTraitTags((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : current.length >= TRAIT_TAGS_MAX
          ? current
          : [...current, tagId]
    );
  };

  const upload = async (
    photo: PhotoDraft,
    uploadIdempotencyKey: string
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
        "Idempotency-Key": `${uploadIdempotencyKey}:0`,
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
    if (photos.length !== MAX_EDIT_PHOTOS) {
      setShowErrors(true);
      setError("사진은 1장으로 유지해야 합니다.");
      return;
    }
    if (!session?.access_token) {
      setError("로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const domainPayload = {
        location: { lat: item.lat, lng: item.lng },
        occurredAt: (() => {
          const parsed = parseSeoulDateTimeLocal(occurredAt);
          if (!parsed) {
            throw new Error("invalid_sighting_time");
          }
          return parsed.toISOString();
        })(),
        traitColor: traitColor.trim() || null,
        traitSize,
        traitSpecies,
        traitTags,
        note: description.trim() || null,
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
        photos.map((photo) => upload(photo, attempt.uploadIdempotencyKey))
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
    <form onSubmit={submit} className="space-y-6">
      <SightingEssentials
        photoUrl={photoUrl}
        photoLabel="사진 (1장)"
        occurredAt={occurredAt}
        photoError={photoError}
        locationStatus={locationStatus}
        disabled={saving}
        onPhotoChange={handlePhotoChange}
        onOccurredAtChange={(value) => {
          bumpDraft();
          setOccurredAt(value);
        }}
        onOpenLocationPicker={() => {
          if (!naverMapsClientId) {
            setError(
              "지도 설정(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)이 없어 위치를 변경할 수 없습니다."
            );
            return;
          }
          setMapOpen(true);
        }}
      />

      {mapOpen && naverMapsClientId ? (
        <LocationPicker
          clientId={naverMapsClientId}
          initialLat={item.lat}
          initialLng={item.lng}
          title="목격 위치 선택"
          guideMessage="지도를 클릭하거나 주소 검색으로 목격 위치를 선택하세요"
          onSelect={(lat, lng) => {
            bumpDraft();
            setItem((current) =>
              current ? { ...current, lat, lng } : current
            );
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      ) : null}

      <SightingOptionalDetails
        traitColor={traitColor}
        traitSize={traitSize}
        traitSpecies={traitSpecies}
        traitTags={traitTags}
        description={description}
        disabled={saving}
        onFieldChange={handleOptionalFieldChange}
        onTraitTagToggle={handleToggleTag}
      />

      {error ? <Text color="error">{error}</Text> : null}

      <div className="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-10 flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-12 flex-1 rounded-2xl text-base font-semibold"
          disabled={saving}
          onClick={() => router.push("/my")}
        >
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="min-h-12 flex-[1.4] rounded-2xl text-base font-semibold"
          isLoading={saving}
          disabled={photos.length !== MAX_EDIT_PHOTOS}
        >
          수정 저장
        </Button>
      </div>
    </form>
  );
}
