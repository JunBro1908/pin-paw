"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/shared/ui/Button";
import { SightingFormData } from "../model/types";
import { validateSightingForm } from "../lib/validators";
import { Toast } from "@/shared/ui/Toast";
import { Text } from "@/shared/ui/Text";
import { Icon } from "@/shared/ui/Icon";
import { useDialogFocus } from "@/shared/ui/dialog-focus";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import { supabase } from "@/shared/supabase/client";
import { SPECIES_UNKNOWN } from "../constants/breeds";
import {
  toLocalDateTimeInputValue,
  type SightingLocationStatus,
} from "../lib/sighting-form-presentation";
import { parseSeoulDateTimeLocal } from "@/shared/lib/date";
import { SightingEssentials } from "./SightingEssentials";
import { SightingOptionalDetails } from "./SightingOptionalDetails";
import {
  completeSubmission,
  fingerprintUploadFile,
  markUploadCompleted,
  prepareSubmission,
  rememberUploadIntent,
  runBestEffort,
  type FormSubmissionAttempt,
} from "@/shared/lib/form-submission-lifecycle";

export function SightingForm() {
  const [formData, setFormData] = useState<SightingFormData>({
    photo: null,
    photoUrl: null,
    lat: 37.5665,
    lng: 126.978,
    time: toLocalDateTimeInputValue(new Date()),
    traitColor: "",
    traitSize: "unknown",
    traitSpecies: SPECIES_UNKNOWN,
    traitTags: [],
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<"idle" | "sending" | "success">(
    "idle"
  );
  const [sendProgress, setSendProgress] = useState(8);
  const [showErrors, setShowErrors] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLocationSet, setIsLocationSet] = useState(false);
  const [geolocationErrorKind, setGeolocationErrorKind] =
    useState<Exclude<SightingLocationStatus, "ready">>("locating");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const submissionAttemptRef = useRef<FormSubmissionAttempt | null>(null);
  const closeConfirmation = () => {
    setSubmitPhase("idle");
    setSendProgress(8);
  };
  const confirmationActive = submitPhase !== "idle";
  const { dialogRef, closeButtonRef } = useDialogFocus({
    active: confirmationActive,
    onClose: closeConfirmation,
  });
  const naverMapsClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "";
  const lat = isLocationSet ? formData.lat : null;
  const lng = isLocationSet ? formData.lng : null;
  const locationStatus: SightingLocationStatus =
    lat !== null && lng !== null ? "ready" : geolocationErrorKind;

  // 초기 렌더링 시 현재 위치 가져오기
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeolocationErrorKind("error");
      return;
    }

    setGeolocationErrorKind("locating");
    const onSuccess = (position: GeolocationPosition) => {
      setFormData((prev) => ({
        ...prev,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }));
      setIsLocationSet(true);
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
      console.error("Geolocation error:", error);
      let msg = "위치 정보를 가져오지 못했습니다.";
      if (error.code === error.PERMISSION_DENIED) {
        setGeolocationErrorKind("denied");
        msg = "위치 권한을 허용해주세요.";
      } else if (error.code === error.TIMEOUT) {
        setGeolocationErrorKind("error");
        msg = "측정 시간이 초과되었습니다. 다시 시도해주세요.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        setGeolocationErrorKind("error");
        msg = "현재 위치 정보를 사용할 수 없습니다.";
      } else {
        setGeolocationErrorKind("error");
      }
      setToast({ message: msg, type: "error" });
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => onError(error, false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    const photoUrl = formData.photoUrl;
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [formData.photoUrl]);

  const handlePhotoChange = (file: File | null) => {
    const photoUrl = file ? URL.createObjectURL(file) : null;
    setFormData((prev) => ({ ...prev, photo: file, photoUrl }));
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleTag = (tagId: string) => {
    setFormData((prev) => ({
      ...prev,
      traitTags: prev.traitTags.includes(tagId)
        ? prev.traitTags.filter((id) => id !== tagId)
        : [...prev.traitTags, tagId],
    }));
  };

  const errors = validateSightingForm(formData);
  const photoError =
    showErrors && !formData.photo ? "사진을 등록해주세요." : undefined;
  const locationError =
    showErrors && !isLocationSet
      ? "목격 위치를 확인해 주세요."
      : showErrors
        ? errors.location
        : undefined;
  const timeError = showErrors ? errors.time : undefined;
  const isValid =
    Object.keys(errors).length === 0 && isLocationSet && Boolean(formData.photo);

  const firstValidationMessage = (): string => {
    if (!formData.photo) return "사진을 등록해주세요.";
    if (!isLocationSet) return "목격 위치를 확인해 주세요.";
    if (errors.time) return errors.time;
    if (errors.location) return errors.location;
    return "필수 항목을 확인해 주세요.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!isValid || !formData.photo) {
      setShowErrors(true);
      setToast({ message: firstValidationMessage(), type: "error" });
      return;
    }

    if (typeof window !== "undefined" && !window.navigator.onLine) {
      setToast({ message: "이미지 업로드에 실패했습니다.", type: "error" });
      return;
    }

    const photo = formData.photo;
    const domainPayload = {
      location: { lat: formData.lat, lng: formData.lng },
      occurredAt: (() => {
        const occurredAt = parseSeoulDateTimeLocal(formData.time);
        if (!occurredAt) {
          throw new Error("invalid_sighting_time");
        }
        return occurredAt.toISOString();
      })(),
      traitColor: formData.traitColor?.trim() || null,
      traitSize: formData.traitSize,
      traitSpecies: formData.traitSpecies,
      traitTags: formData.traitTags?.length ? formData.traitTags : null,
      note: formData.description?.trim() || null,
    };

    // 최소 전송 연출(hold)과 실제 등록을 맞춘다.
    // rate limit(429) 등 실패를 성공 화면보다 먼저 확정해야 익명 연속 제보가
    // 「전송되었습니다」로 오인되지 않는다.
    setIsSubmitting(true);
    setSubmitPhase("sending");
    setSendProgress(12);
    resetForm();

    const progressTimer = window.setInterval(() => {
      setSendProgress((prev) => Math.min(prev + 8 + Math.random() * 12, 90));
    }, 160);
    const holdMs = 1600;
    const holdStartedAt = Date.now();

    let registered = false;
    try {
      const payloadFingerprint = JSON.stringify({
        file: await fingerprintUploadFile(photo),
        domainPayload,
      });
      const attempt = prepareSubmission(
        submissionAttemptRef.current,
        payloadFingerprint,
        () => crypto.randomUUID()
      );
      submissionAttemptRef.current = attempt;

      const fileKey = await uploadPhoto(photo, attempt);
      const currentAttempt = submissionAttemptRef.current ?? attempt;

      await registerSighting(
        fileKey,
        domainPayload,
        currentAttempt.submissionIdempotencyKey
      );
      submissionAttemptRef.current = completeSubmission();
      registered = true;
      runBestEffort(async () => {
        const { invalidateMySightingsCache } =
          await import("@/features/sightings/hooks/useMySightings");
        invalidateMySightingsCache();
      });
    } catch (err) {
      setSubmitPhase("idle");
      setSendProgress(8);
      setToast({
        message: err instanceof Error ? err.message : "오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      window.clearInterval(progressTimer);
      setIsSubmitting(false);
    }

    if (registered) {
      const remainingMs = holdMs - (Date.now() - holdStartedAt);
      if (remainingMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
      }
      setSendProgress(100);
      setSubmitPhase("success");
    }
  };

  /**
   * 사진을 업로드하고 fileKey를 반환합니다.
   */
  const uploadPhoto = async (
    photo: File,
    initialAttempt: FormSubmissionAttempt
  ): Promise<string> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      let attempt = initialAttempt;

      if (!attempt.uploadIntent) {
        const presignRes = await fetch("/api/v1/uploads/presign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": attempt.uploadIdempotencyKey,
            ...(session?.access_token && {
              Authorization: `Bearer ${session.access_token}`,
            }),
          },
          body: JSON.stringify({
            purpose: "sighting_photo",
            files: [{ contentType: photo.type, sizeBytes: photo.size }],
          }),
        });

        if (!presignRes.ok) {
          const errorData = await presignRes.json();
          const errorMessage =
            errorData.error?.message || "이미지 업로드에 실패했습니다.";
          throw new Error(errorMessage);
        }

        const presignResult = await presignRes.json();
        if (!presignResult.success || !presignResult.data?.uploads?.[0]) {
          const errorMessage =
            presignResult.error?.message || "이미지 업로드에 실패했습니다.";
          throw new Error(errorMessage);
        }

        attempt = rememberUploadIntent(attempt, presignResult.data.uploads[0]);
        submissionAttemptRef.current = attempt;
      }

      const uploadIntent = attempt.uploadIntent;
      if (!uploadIntent) throw new Error("이미지 업로드에 실패했습니다.");

      if (!uploadIntent.uploaded) {
        const uploadRes = await fetch(uploadIntent.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": photo.type },
          body: photo,
        });

        if (!uploadRes.ok) {
          throw new Error("이미지 업로드에 실패했습니다.");
        }
        attempt = markUploadCompleted(attempt);
        submissionAttemptRef.current = attempt;
      }

      return uploadIntent.fileKey;
    } catch (err) {
      const message =
        err instanceof Error && err.message && err.message !== "Failed to fetch"
          ? err.message
          : "이미지 업로드에 실패했습니다.";
      throw new Error(message);
    }
  };

  /**
   * 제보 정보를 서버에 저장합니다.
   */
  const registerSighting = async (
    fileKey: string,
    data: {
      location: { lat: number; lng: number };
      occurredAt: string;
      traitColor: string | null;
      traitSize: string;
      traitSpecies: string;
      traitTags: string[] | null;
      note: string | null;
    },
    idempotencyKey: string
  ) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      };

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const sightingRes = await fetch("/api/v1/sightings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          photoKeys: [fileKey],
          location: data.location,
          occurredAt: data.occurredAt,
          traitColor: data.traitColor,
          traitSize: data.traitSize,
          traitSpecies: data.traitSpecies,
          traitTags: data.traitTags,
          note: data.note,
        }),
      });

      if (!sightingRes.ok) {
        try {
          const errorData = await sightingRes.json();
          const errorMessage =
            errorData.error?.message || "제보 등록에 실패했습니다.";
          throw new Error(errorMessage);
        } catch (err) {
          if (err instanceof Error && err.message !== "Failed to fetch") {
            throw err;
          }
          throw new Error(
            "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
          );
        }
      }

      const sightingResult = await sightingRes.json();
      if (!sightingResult.success) {
        const errorMessage =
          sightingResult.error?.message || "제보 등록에 실패했습니다.";
        throw new Error(errorMessage);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message && err.message !== "Failed to fetch"
          ? err.message
          : "제보 등록에 실패했습니다.";
      throw new Error(message);
    }
  };

  /**
   * 폼 상태를 초기화합니다.
   */
  const resetForm = () => {
    setFormData((prev) => ({
      photo: null,
      photoUrl: null,
      lat: prev.lat,
      lng: prev.lng,
      time: toLocalDateTimeInputValue(new Date()),
      traitColor: "",
      traitSize: "unknown",
      traitSpecies: SPECIES_UNKNOWN,
      traitTags: [],
      description: "",
    }));
    setShowErrors(false);
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
      {confirmationActive ? (
        <div
          ref={dialogRef as React.RefObject<HTMLDivElement>}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sighting-sent-title"
          className="bg-background-warm fixed inset-0 z-[120] flex flex-col px-5 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            {submitPhase === "sending" ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div
                  className="bg-primary-soft text-action-primary flex h-24 w-24 items-center justify-center rounded-full"
                  aria-hidden="true"
                >
                  <Icon name="send" size={44} className="stroke-[2.2]" />
                </div>
                <Text
                  as="h2"
                  id="sighting-sent-title"
                  variant="title"
                  color="main"
                  className="mt-8 block text-2xl leading-snug tracking-tight"
                >
                  제보를 전송하고 있어요
                </Text>
                <div
                  className="bg-surface-soft mt-10 h-2 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(sendProgress)}
                  aria-label="제보 전송 진행"
                >
                  <div
                    className="bg-action-primary h-full rounded-full transition-[width] duration-200 ease-out"
                    style={{ width: `${sendProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <div
                    className="bg-primary-soft text-action-primary flex h-24 w-24 items-center justify-center rounded-full"
                    aria-hidden="true"
                  >
                    <Icon name="send" size={44} className="stroke-[2.2]" />
                  </div>
                  <Text
                    as="h2"
                    id="sighting-sent-title"
                    variant="title"
                    color="main"
                    className="mt-8 block text-2xl leading-snug tracking-tight"
                  >
                    제보가 전송되었습니다
                  </Text>
                </div>
                <Button
                  ref={closeButtonRef}
                  type="button"
                  variant="primary"
                  className="min-h-12 w-full rounded-2xl text-base font-semibold"
                  onClick={closeConfirmation}
                >
                  확인했어요
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-6">
        <SightingEssentials
          photoUrl={formData.photoUrl}
          occurredAt={formData.time}
          photoError={photoError}
          locationError={locationError}
          timeError={timeError}
          locationStatus={locationStatus}
          disabled={isSubmitting}
          onPhotoChange={handlePhotoChange}
          onOccurredAtChange={(time) =>
            setFormData((prev) => ({ ...prev, time }))
          }
          onOpenLocationPicker={() => {
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
        />

        {isMapOpen && naverMapsClientId ? (
          <LocationPicker
            clientId={naverMapsClientId}
            initialLat={formData.lat}
            initialLng={formData.lng}
            onSelect={(lat, lng) => {
              setFormData((prev) => ({ ...prev, lat, lng }));
              setIsLocationSet(true);
            }}
            onClose={() => setIsMapOpen(false)}
            title="목격 위치 선택"
            guideMessage="지도를 클릭하거나 주소 검색으로 목격 위치를 선택하세요"
          />
        ) : null}

        <SightingOptionalDetails
          traitColor={formData.traitColor}
          traitSize={formData.traitSize}
          traitSpecies={formData.traitSpecies}
          traitTags={formData.traitTags}
          description={formData.description}
          disabled={isSubmitting}
          onFieldChange={handleChange}
          onTraitTagToggle={handleToggleTag}
        />

        <div className="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-10 pt-2">
          <Button
            type="submit"
            variant="primary"
            className="min-h-12 w-full rounded-2xl text-base font-semibold"
            isLoading={isSubmitting}
          >
            제보 등록
          </Button>
        </div>
      </form>
    </>
  );
}
