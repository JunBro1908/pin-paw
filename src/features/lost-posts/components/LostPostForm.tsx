"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/lib/cn";
import {
  parseSeoulDateTimeLocal,
  toLocalDatetimeLocalString,
} from "@/shared/lib/date";
import { useSeoulDatetimeLocalMax } from "@/shared/hooks/useSeoulDatetimeLocalMax";
import { Toast } from "@/shared/ui/Toast";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { LostPostFormData } from "../model/types";
import {
  DOG_BREEDS,
  getBreedLabel,
  SPECIES_UNKNOWN,
} from "@/features/sightings/constants/breeds";
import {
  SIZE_LABELS,
  SIZE_VALUES,
  type SizeValue,
} from "@/shared/constants/traitSizes";
import { TRAIT_TAGS, TRAIT_TAGS_MAX } from "@/shared/constants/traitTags";
import {
  completeSubmission,
  fingerprintUploadFile,
  markUploadCompleted,
  prepareSubmission,
  rememberUploadIntent,
  type FormSubmissionAttempt,
} from "@/shared/lib/form-submission-lifecycle";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import {
  formatLocationInputStatus,
  type LocationInputSource,
} from "@/shared/lib/location-input-presentation";

const naverMapsClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "";
const inputBase =
  "border-border-subtle focus:border-action-primary focus:ring-action-primary/20 w-full rounded-xl border bg-surface px-4 py-3 text-text-main shadow-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const selectBase =
  "border-border-subtle focus:border-action-primary focus:ring-action-primary/20 w-full cursor-pointer appearance-none rounded-xl border bg-surface bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-4 py-3 pr-10 text-text-main shadow-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]";

const getInitialFormData = (): LostPostFormData => ({
  photo: null,
  photoUrl: null,
  photos: [],
  photoUrls: [],
  lat: 37.5665,
  lng: 126.978,
  petName: "",
  lostAt: toLocalDatetimeLocalString(),
  traitColor: "",
  traitSize: "unknown",
  traitSpecies: SPECIES_UNKNOWN,
  traitTags: [],
  description: "",
});

export function LostPostForm() {
  const router = useRouter();
  const { session } = useAuth();
  const maxLostAt = useSeoulDatetimeLocalMax();
  const [formData, setFormData] =
    useState<LostPostFormData>(getInitialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocationSet, setIsLocationSet] = useState(false);
  const [locationSource, setLocationSource] =
    useState<LocationInputSource | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionAttemptRef = useRef<FormSubmissionAttempt | null>(null);
  const locationSourceRef = useRef<LocationInputSource | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    setIsLocating(true);
    const onSuccess = (position: GeolocationPosition) => {
      if (locationSourceRef.current === "selected") return;
      setFormData((prev) => ({
        ...prev,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }));
      setIsLocationSet(true);
      setIsLocating(false);
      locationSourceRef.current = "geolocation";
      setLocationSource("geolocation");
    };
    const onError = (error: GeolocationPositionError, retried: boolean) => {
      if (error.code === error.TIMEOUT && !retried) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (retryError) => onError(retryError, true),
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 }
        );
        return;
      }
      setIsLocating(false);
      setToast({
        message:
          error.code === error.PERMISSION_DENIED
            ? "위치 권한을 허용해주세요."
            : "위치 정보를 가져오지 못했습니다. 지도에서 직접 선택해주세요.",
        type: "error",
      });
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => onError(error, false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (incoming.length) {
      setFormData((prev) => ({
        ...(() => {
          const merged = [...prev.photos, ...incoming]
            .filter(
              (item, index, all) =>
                all.findIndex(
                  (candidate) =>
                    candidate.name === item.name &&
                    candidate.size === item.size &&
                    candidate.lastModified === item.lastModified
                ) === index
            )
            .slice(0, 3);
          const addedUrls = merged
            .slice(prev.photos.length)
            .map((item) => URL.createObjectURL(item));
          return {
            ...prev,
            photo: merged[0],
            photoUrl: prev.photoUrls[0] ?? addedUrls[0] ?? null,
            photos: merged,
            photoUrls: [...prev.photoUrls, ...addedUrls],
          };
        })(),
      }));
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const url of formData.photoUrls) URL.revokeObjectURL(url);
    setFormData((prev) => ({
      ...prev,
      photo: null,
      photoUrl: null,
      photos: [],
      photoUrls: [],
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isValid =
    formData.photos.length > 0 && isLocationSet && !!formData.lostAt?.trim();

  const uploadCover = async (
    files: File[],
    initialAttempt: FormSubmissionAttempt
  ): Promise<string[]> => {
    const unsupportedIndex = files.findIndex(
      (file) =>
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size < 1 ||
        file.size > 10 * 1024 * 1024
    );
    if (unsupportedIndex >= 0) {
      const file = files[unsupportedIndex];
      throw new Error(
        `${unsupportedIndex + 1}번째 사진은 JPEG/PNG 형식이며 10MB 이하여야 합니다. (${file.type || "알 수 없는 형식"})`
      );
    }
    const token = session?.access_token;
    let attempt = initialAttempt;
    let uploads: Array<{ fileKey: string; uploadUrl: string }> = [];

    if (!attempt.uploadIntent) {
      const presignRes = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.uploadIdempotencyKey,
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          purpose: "lost_cover",
          files: files.map((file) => ({ contentType: file.type, sizeBytes: file.size })),
        }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error?.message || "이미지 업로드에 실패했습니다.");
      }
      const { data } = await presignRes.json();
      if (!data?.uploads?.length || data.uploads.length !== files.length) {
        throw new Error(`이미지 업로드 준비에 실패했습니다. (${presignRes.status})`);
      }
      uploads = data.uploads;
      attempt = rememberUploadIntent(attempt, data.uploads[0]);
      submissionAttemptRef.current = attempt;
    }

    const uploadIntent = attempt.uploadIntent;
    if (!uploadIntent) throw new Error("이미지 업로드에 실패했습니다.");

    if (!uploads.length) uploads = [{ fileKey: uploadIntent.fileKey, uploadUrl: uploadIntent.uploadUrl }];
    for (let index = 0; index < uploads.length; index += 1) {
      const uploadRes = await fetch(uploads[index].uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": files[index].type },
        body: files[index],
      });
      if (!uploadRes.ok) {
        throw new Error(
          `${index + 1}번째 이미지 업로드에 실패했습니다. (Storage ${uploadRes.status})`
        );
      }
    }
    if (!uploadIntent.uploaded) {
      attempt = markUploadCompleted(attempt);
      submissionAttemptRef.current = attempt;
    }

    return uploads.map((upload) => upload.fileKey);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!isValid || !formData.photos.length || !session?.access_token) {
      return;
    }

    setIsSubmitting(true);
    try {
      const domainPayload = {
        petName: formData.petName.trim(),
        lostAt: (() => {
          const parsed = parseSeoulDateTimeLocal(formData.lostAt);
          if (!parsed) {
            throw new Error("invalid_lost_at");
          }
          return parsed.toISOString();
        })(),
        lostLocation: { lat: formData.lat, lng: formData.lng },
        traitColor: formData.traitColor.trim() || undefined,
        traitSize: formData.traitSize,
        traitSpecies: formData.traitSpecies,
        traitTags: formData.traitTags.length ? formData.traitTags : undefined,
        note: formData.description.trim() || undefined,
      };
      const payloadFingerprint = JSON.stringify({
        files: await Promise.all(formData.photos.map(fingerprintUploadFile)),
        domainPayload,
      });
      const attempt = prepareSubmission(
        submissionAttemptRef.current,
        payloadFingerprint,
        () => crypto.randomUUID()
      );
      submissionAttemptRef.current = attempt;
      const fileKeys = await uploadCover(formData.photos, attempt);
      const currentAttempt = submissionAttemptRef.current ?? attempt;
      const res = await fetch("/api/v1/lost-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "Idempotency-Key": currentAttempt.submissionIdempotencyKey,
        },
        body: JSON.stringify({
          photoKeys: fileKeys,
          ...domainPayload,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "유실글 등록에 실패했습니다.");
      }

      const created = await res.json();
      const createdId =
        created?.data?.id ?? created?.data?.lostPost?.id ?? null;
      submissionAttemptRef.current = completeSubmission();
      void trackFunnelEvent(session.access_token, {
        name: "lost_post_created",
        lostPostId: typeof createdId === "string" ? createdId : null,
        properties: { source: "lost_post_form" },
      });
      setToast({ message: "유실글이 등록되었습니다.", type: "success" });
      const { invalidateMyLostPostsCache } =
        await import("@/features/lost-posts/hooks/useMyLostPosts");
      invalidateMyLostPostsCache();
      setTimeout(() => router.push("/my"), 1000);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            대표 사진 <span className="text-primary">*</span>
          </Text>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) =>
              e.key === "Enter" && fileInputRef.current?.click()
            }
            className={cn(
              "border-border-subtle bg-surface relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all",
              "hover:border-primary/50 hover:bg-primary-soft/30"
            )}
          >
            {formData.photoUrl ? (
              <>
                <Image
                  src={formData.photoUrl}
                  alt="미리보기"
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-2 text-white"
                >
                  ✕
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">📷</span>
                <Text variant="caption">사진 선택</Text>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              hidden
              ref={fileInputRef}
              onChange={handlePhotoChange}
            />
          </div>
          {formData.photos.length > 0 && formData.photos.length < 3 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="border-accent-warm-text text-accent-warm-text hover:bg-accent-warm/10 mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed text-sm font-semibold transition-colors disabled:opacity-60"
            >
              + 사진 추가 ({formData.photos.length}/3)
            </button>
          ) : null}
        </section>

        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            강아지 이름 <span className="text-primary">*</span>
          </Text>
          <input
            type="text"
            name="petName"
            value={formData.petName}
            onChange={handleChange}
            placeholder="예: 초코, 망고"
            className={inputBase}
            maxLength={50}
          />
        </section>

        <section className="space-y-3">
          <div>
            <Text variant="body" className="font-bold">
              유실 위치 <span className="text-primary">*</span>
            </Text>
            <Text
              variant="caption"
              className="text-text-caption mt-1 block text-[11px] leading-relaxed opacity-80"
            >
              지도에서 위치를 선택하거나 변경 버튼으로 수정할 수 있습니다.
            </Text>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!naverMapsClientId) {
                setToast({
                  message:
                    "지도 설정(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)이 없어 위치를 변경할 수 없습니다.",
                  type: "error",
                });
                return;
              }
              setIsMapOpen(true);
            }}
            className="border-border-subtle hover:border-action-primary/50 focus:ring-action-primary/10 bg-surface text-text-main flex w-full items-center justify-between rounded-xl border px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2 active:scale-[0.99]"
          >
            <div className="flex items-center gap-2">
              <Text
                variant="body"
                className={cn(
                  "font-medium",
                  !isLocationSet && !isLocating
                    ? "text-error"
                    : "text-text-main",
                  isLocating && "text-text-caption"
                )}
              >
                {isLocating
                  ? "위치 확인 중..."
                  : isLocationSet && locationSource
                    ? formatLocationInputStatus(locationSource)
                    : "위치를 설정해주세요"}
              </Text>
            </div>
            <div className="bg-primary-soft flex items-center gap-1 rounded-lg px-3 py-1.5">
              <Text variant="caption" className="text-primary font-bold">
                변경
              </Text>
            </div>
          </button>
        </section>

        {isMapOpen && naverMapsClientId ? (
          <LocationPicker
            clientId={naverMapsClientId}
            initialLat={formData.lat}
            initialLng={formData.lng}
            onSelect={(lat, lng) => {
              setFormData((prev) => ({ ...prev, lat, lng }));
              setIsLocationSet(true);
              locationSourceRef.current = "selected";
              setLocationSource("selected");
            }}
            onClose={() => setIsMapOpen(false)}
            title="유실 위치 선택"
            guideMessage="지도를 클릭하거나 주소 검색으로 유실 위치를 선택하세요"
          />
        ) : null}

        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            유실 일시 <span className="text-primary">*</span>
          </Text>
          <input
            type="datetime-local"
            name="lostAt"
            value={formData.lostAt}
            max={maxLostAt}
            onChange={handleChange}
            className={`${inputBase} min-h-12 appearance-none py-3 text-base leading-normal [color-scheme:light_dark] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-datetime-edit]:m-0 [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0`}
          />
        </section>

        <details className="border-border-subtle bg-surface group rounded-2xl border shadow-sm">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden">
            추가 정보 입력하기 (선택)
            <span
              aria-hidden
              className="transition-transform group-open:rotate-180"
            >
              ⌄
            </span>
          </summary>
          <div className="border-border-subtle border-t px-4 py-5">
            <ScrollablePanel variant="panel" className="space-y-5">
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="lost-trait-color"
                    className="text-text-main mb-1.5 block text-sm font-semibold"
                  >
                    색상·무늬
                  </label>
                  <input
                    id="lost-trait-color"
                    type="text"
                    name="traitColor"
                    value={formData.traitColor}
                    onChange={handleChange}
                    placeholder="예: 갈색 바탕에 흰색 점박이, 검정·흰색 투톤"
                    maxLength={100}
                    className={inputBase}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="lost-trait-size"
                      className="text-text-main mb-1.5 block text-sm font-semibold"
                    >
                      크기
                    </label>
                    <select
                      id="lost-trait-size"
                      name="traitSize"
                      value={formData.traitSize}
                      onChange={handleChange}
                      className={selectBase}
                    >
                      {SIZE_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {SIZE_LABELS[v as SizeValue]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="lost-trait-species"
                      className="text-text-main mb-1.5 block text-sm font-semibold"
                    >
                      종
                    </label>
                    <select
                      id="lost-trait-species"
                      name="traitSpecies"
                      value={formData.traitSpecies}
                      onChange={handleChange}
                      className={selectBase}
                    >
                      {DOG_BREEDS.map((b) => (
                        <option key={b} value={b}>
                          {getBreedLabel(b)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <Text variant="body" className="font-bold">
                      특이사항
                    </Text>
                    <Text
                      variant="caption"
                      className="text-text-caption mt-0.5 block text-xs"
                    >
                      최대 {TRAIT_TAGS_MAX}개
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TRAIT_TAGS.map((tag) => {
                      const selected = formData.traitTags.includes(tag.id);
                      const disabled =
                        !selected &&
                        formData.traitTags.length >= TRAIT_TAGS_MAX;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setFormData((prev) => ({
                                ...prev,
                                traitTags: prev.traitTags.filter(
                                  (id) => id !== tag.id
                                ),
                              }));
                            } else if (!disabled) {
                              setFormData((prev) => ({
                                ...prev,
                                traitTags: [...prev.traitTags, tag.id],
                              }));
                            }
                          }}
                          disabled={disabled}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-sm transition-colors",
                            selected
                              ? "bg-primary text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                            disabled && "cursor-not-allowed opacity-50"
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
                <Text variant="body" className="font-bold">
                  메모
                </Text>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="발견 당시 상황 등 확인에 필요한 내용을 입력해주세요"
                  rows={4}
                  className={cn(
                    inputBase,
                    "resize-none py-4 placeholder:text-text-caption autofill:bg-surface autofill:text-text-main"
                  )}
                />
              </div>
            </ScrollablePanel>
          </div>
        </details>

        <Button
          type="submit"
          variant="primary"
          className="h-14 w-full rounded-2xl text-lg font-bold"
          disabled={!isValid}
          isLoading={isSubmitting}
        >
          유실글 등록
        </Button>
      </form>
    </>
  );
}
