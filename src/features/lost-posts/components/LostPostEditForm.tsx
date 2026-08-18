"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SightingOptionalDetails } from "@/features/sightings/components/SightingOptionalDetails";
import { SPECIES_UNKNOWN } from "@/features/sightings/constants/breeds";
import { TRAIT_TAGS_MAX } from "@/shared/constants/traitTags";
import { cn } from "@/shared/lib/cn";
import {
  completeSubmission,
  fingerprintUploadFile,
  markUploadIntentCompleted,
  prepareSubmission,
  rememberUploadIntents,
  type FormSubmissionAttempt,
} from "@/shared/lib/form-submission-lifecycle";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";
import { photoValidationMessage } from "@/shared/lib/photo-validation";
import { getLostPostCoverUrl } from "../lib/lost-post-cover";
import { invalidateMyLostPostsCache } from "../hooks/useMyLostPosts";
import { useLostPost } from "../hooks/useLostPost";

const inputBase =
  "w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-[15px] text-text-main shadow-sm outline-none transition-all focus:border-action-primary focus:ring-2 focus:ring-action-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const selectBase =
  "w-full cursor-pointer appearance-none rounded-xl border border-border-subtle bg-surface bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-4 py-3 pr-10 text-[15px] text-text-main shadow-sm outline-none transition-all focus:border-action-primary focus:ring-2 focus:ring-action-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const SELECT_CHEVRON =
  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]";

type EditPhotoDraft = {
  key: string | null;
  file: File | null;
  url: string;
};

const MAX_EDIT_PHOTOS = 3;

function normalizeTraitSize(raw: string | null | undefined): string {
  if (raw && ["small", "medium", "large", "unknown"].includes(raw)) return raw;
  if (raw === "소") return "small";
  if (raw === "중") return "medium";
  if (raw === "대") return "large";
  return "unknown";
}

export function LostPostEditForm({ lostPostId }: { lostPostId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const { data: item, error: loadError, isLoading } = useLostPost(lostPostId);
  const [petName, setPetName] = useState("");
  const [traitColor, setTraitColor] = useState("");
  const [traitSize, setTraitSize] = useState("unknown");
  const [traitSpecies, setTraitSpecies] = useState(SPECIES_UNKNOWN);
  const [traitTags, setTraitTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"searching" | "found">("searching");
  const [photos, setPhotos] = useState<EditPhotoDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<EditPhotoDraft[]>([]);
  const submissionAttemptRef = useRef<FormSubmissionAttempt | null>(null);

  useEffect(() => {
    if (!item || hydrated) return;
    setPetName(item.pet_name ?? "");
    setTraitColor(item.trait_color ?? "");
    setTraitSize(normalizeTraitSize(item.trait_size));
    setTraitSpecies(item.trait_species ?? SPECIES_UNKNOWN);
    setTraitTags(
      Array.isArray(item.trait_tags)
        ? item.trait_tags.slice(0, TRAIT_TAGS_MAX)
        : []
    );
    setDescription(item.note ?? "");
    setStatus(item.status === "found" ? "found" : "searching");
    const photoKeys =
      Array.isArray(item.photo_keys) && item.photo_keys.length
        ? item.photo_keys
        : [item.cover_photo_key];
    setPhotos(
      photoKeys.slice(0, MAX_EDIT_PHOTOS).map((key) => ({
        key: key?.trim() || null,
        file: null,
        url: getLostPostCoverUrl(key),
      }))
    );
    setHydrated(true);
  }, [item, hydrated]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        if (photo.file && photo.url.startsWith("blob:")) {
          URL.revokeObjectURL(photo.url);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!photos.length && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [photos.length]);

  if (isLoading || (!hydrated && !loadError)) {
    return <Text color="caption">불러오는 중...</Text>;
  }
  if (loadError || !item) {
    return (
      <Text color="error">{loadError ?? "유실글을 찾을 수 없습니다."}</Text>
    );
  }

  const photoUrl = photos[0]?.url || null;
  const hasPhoto = photos.length > 0;
  const photoError =
    showErrors && !hasPhoto ? "사진을 등록해주세요." : undefined;
  const petNameError =
    showErrors && !petName.trim() ? "이름을 입력해주세요." : undefined;

  const bumpDraft = () => {
    submissionAttemptRef.current = null;
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!incoming.length) return;

    const validIncoming = incoming.filter((file, index) => {
      const message = photoValidationMessage(file, index + 1);
      if (message) {
        setToast({ message, type: "error" });
        return false;
      }
      return true;
    });
    if (!validIncoming.length) return;

    const incomingDrafts = validIncoming.map((file) => ({
      key: null,
      file,
      url: URL.createObjectURL(file),
    }));
    const existing = photos;
    const merged = [...existing, ...incomingDrafts].filter(
      (draft, index, all) =>
        all.findIndex((candidate) => {
          if (draft.key || candidate.key) return draft.key === candidate.key;
          return (
            draft.file?.name === candidate.file?.name &&
            draft.file?.size === candidate.file?.size &&
            draft.file?.lastModified === candidate.file?.lastModified
          );
        }) === index
    );
    for (const draft of incomingDrafts) {
      if (!merged.includes(draft)) {
        URL.revokeObjectURL(draft.url);
      }
    }
    const nextPhotos = merged.slice(0, MAX_EDIT_PHOTOS);
    const rejected = merged.length - nextPhotos.length;
    if (rejected > 0) {
      for (const draft of merged.slice(MAX_EDIT_PHOTOS)) {
        if (draft.file && draft.url.startsWith("blob:")) {
          URL.revokeObjectURL(draft.url);
        }
      }
      setToast({
        message: `최대 ${MAX_EDIT_PHOTOS}장까지 등록할 수 있어요. ${rejected}장은 제외했어요.`,
        type: "error",
      });
    }
    bumpDraft();
    setPhotos(nextPhotos);
  };

  const handlePhotoRemove = (index: number) => {
    const removed = photos[index];
    if (removed?.file && removed.url.startsWith("blob:")) {
      URL.revokeObjectURL(removed.url);
    }
    bumpDraft();
    setPhotos(photos.filter((_, photoIndex) => photoIndex !== index));
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

  const uploadPhotos = async (
    drafts: EditPhotoDraft[],
    initialAttempt: FormSubmissionAttempt
  ): Promise<string[]> => {
    const token = session?.access_token;
    let attempt = initialAttempt;
    const newDrafts = drafts.filter((draft) => !draft.key && draft.file);

    if (!newDrafts.length) {
      return drafts.map((draft) => draft.key as string);
    }

    let intents = attempt.uploadIntents ?? [];
    if (intents.length !== newDrafts.length) {
      const presignRes = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.uploadIdempotencyKey,
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          purpose: "lost_cover",
          files: newDrafts.map((draft) => ({
            contentType: draft.file!.type,
            sizeBytes: draft.file!.size,
          })),
        }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error?.message || "이미지 업로드에 실패했습니다.");
      }
      const { data } = await presignRes.json();
      if (
        !Array.isArray(data?.uploads) ||
        data.uploads.length !== newDrafts.length
      ) {
        throw new Error("이미지 업로드에 실패했습니다.");
      }
      attempt = rememberUploadIntents(attempt, data.uploads);
      intents = attempt.uploadIntents ?? [];
      submissionAttemptRef.current = attempt;
    }

    for (let index = 0; index < newDrafts.length; index += 1) {
      const intent = intents[index];
      const file = newDrafts[index].file;
      if (!intent || !file) throw new Error("이미지 업로드에 실패했습니다.");
      if (!intent.uploaded) {
        const uploadRes = await fetch(intent.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("이미지 업로드에 실패했습니다.");
        attempt = markUploadIntentCompleted(attempt, index);
        submissionAttemptRef.current = attempt;
      }
    }

    let newIndex = 0;
    return drafts.map((draft) => draft.key ?? intents[newIndex++].fileKey);
  };

  const detailHref = `/my/lost-posts/${lostPostId}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!hasPhoto || !petName.trim()) {
      setShowErrors(true);
      setError(
        !hasPhoto
          ? "사진을 한 장 이상 선택해주세요."
          : "강아지 이름을 입력해주세요."
      );
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
        petName: petName.trim(),
        traitColor: traitColor.trim() || undefined,
        traitSize,
        traitSpecies,
        traitTags: traitTags.length ? traitTags : undefined,
        note: description.trim() || undefined,
        status,
      };

      if (photos.some((photo) => photo.file)) {
        const payloadFingerprint = JSON.stringify({
          files: await Promise.all(
            photos.map((photo) =>
              photo.file
                ? fingerprintUploadFile(photo.file)
                : `existing:${photo.key}`
            )
          ),
          domainPayload,
        });
        const attempt = prepareSubmission(
          submissionAttemptRef.current,
          payloadFingerprint,
          () => crypto.randomUUID()
        );
        submissionAttemptRef.current = attempt;
      }

      const photoKeys = photos.some((photo) => photo.file)
        ? await uploadPhotos(
            photos,
            submissionAttemptRef.current ??
              prepareSubmission(
                null,
                JSON.stringify(photos.map((photo) => photo.key)),
                () => crypto.randomUUID()
              )
          )
        : photos.map((photo) => photo.key as string);
      if (!photoKeys.length) {
        throw new Error("사진을 한 장 이상 선택해주세요.");
      }

      const response = await fetch(`/api/v1/lost-posts/${lostPostId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          ...(submissionAttemptRef.current
            ? {
                "Idempotency-Key":
                  submissionAttemptRef.current.submissionIdempotencyKey,
              }
            : {}),
        },
        body: JSON.stringify({
          ...domainPayload,
          photoKeys,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error?.message ?? "유실글 수정에 실패했습니다."
        );
      }
      submissionAttemptRef.current = completeSubmission();
      invalidateMyLostPostsCache();
      router.push(detailHref);
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "오류가 발생했습니다.";
      if (message.includes("JPEG/PNG") || message.includes("10MB")) {
        setToast({ message, type: "error" });
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
      <section className="space-y-6" aria-label="필수 유실 정보">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Icon name="camera" size={18} className="text-action-primary" />
            <Text variant="body" color="main" className="font-semibold">
              사진 (최대 3장) <span className="text-action-primary">*</span>
            </Text>
            <Text
              variant="caption"
              color="caption"
              className="block w-full text-xs"
            >
              유실글은 최대 3장
            </Text>
            {photoError ? (
              <span role="alert" className="text-error text-xs font-medium">
                {photoError}
              </span>
            ) : null}
          </div>
          <div className="relative">
            <input
              ref={fileInputRef}
              id="lost-edit-photo"
              type="file"
              accept="image/jpeg,image/png"
              disabled={saving}
              className="peer sr-only"
              multiple
              onChange={handlePhotoChange}
            />
            <label
              htmlFor="lost-edit-photo"
              aria-label="사진 추가 또는 변경"
              className={cn(
                "group border-border-subtle bg-surface-soft hover:border-action-primary/50 hover:bg-accent-warm/10 peer-focus-visible:outline-action-primary relative flex aspect-4/3 max-h-80 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                saving && "pointer-events-none opacity-60",
                photoError && "border-error"
              )}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt="선택한 유실글 사진 미리보기"
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  unoptimized={Boolean(photos[0]?.file)}
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
                <span>{photoUrl ? "사진 더 추가" : "사진 선택"}</span>
                <span>
                  {photos.length}/{MAX_EDIT_PHOTOS}
                </span>
              </div>
            </label>
            {photos.length ? (
              <div
                className="flex gap-2 overflow-x-auto py-2"
                aria-label="선택한 사진"
              >
                {photos.map((entry, index) => (
                  <div
                    key={`${entry.key ?? entry.url}-${index}`}
                    className="relative h-16 w-16 shrink-0"
                  >
                    <Image
                      src={entry.url}
                      alt={`${index + 1}번째 선택 사진`}
                      fill
                      unoptimized={Boolean(entry.file)}
                      className={cn(
                        "rounded-xl border-2 object-cover",
                        index === 0
                          ? "border-accent-warm-text"
                          : "border-border-subtle"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => handlePhotoRemove(index)}
                      disabled={saving}
                      aria-label={`${index + 1}번째 사진 제거`}
                      className="bg-text-main absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs text-white shadow-sm"
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
          <label
            htmlFor="lost-edit-status"
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <Icon name="activity" size={18} className="text-action-primary" />
            <Text
              as="span"
              variant="body"
              color="main"
              className="font-semibold"
            >
              상태
            </Text>
          </label>
          <select
            id="lost-edit-status"
            value={status}
            disabled={saving}
            onChange={(event) => {
              bumpDraft();
              setStatus(event.target.value as "searching" | "found");
            }}
            className={cn(selectBase, SELECT_CHEVRON)}
          >
            <option value="searching">찾는 중</option>
            <option value="found">찾았어요</option>
          </select>
        </div>

        <div className="space-y-3">
          <label
            htmlFor="lost-edit-pet-name"
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <Icon name="paw" size={18} className="text-action-primary" />
            <Text
              as="span"
              variant="body"
              color="main"
              className="font-semibold"
            >
              강아지 이름 <span className="text-action-primary">*</span>
            </Text>
            {petNameError ? (
              <span role="alert" className="text-error text-xs font-medium">
                {petNameError}
              </span>
            ) : null}
          </label>
          <input
            id="lost-edit-pet-name"
            type="text"
            value={petName}
            disabled={saving}
            required
            maxLength={50}
            placeholder="예: 초코, 망고"
            aria-invalid={Boolean(petNameError)}
            onChange={(event) => {
              bumpDraft();
              setPetName(event.target.value);
            }}
            className={cn(inputBase, petNameError && "border-error")}
          />
        </div>
      </section>

      <SightingOptionalDetails
        traitColor={traitColor}
        traitSize={traitSize}
        traitSpecies={traitSpecies}
        traitTags={traitTags}
        description={description}
        disabled={saving}
        maxTags={TRAIT_TAGS_MAX}
        idPrefix="lost-edit"
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
          onClick={() => router.push(detailHref)}
        >
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="min-h-12 flex-[1.4] rounded-2xl text-base font-semibold"
          isLoading={saving}
          disabled={!hasPhoto || !petName.trim()}
        >
          수정 저장
        </Button>
      </div>
    </form>
  );
}
