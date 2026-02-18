"use client";

import { useState, useRef, useEffect } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { SightingFormData } from "../model/types";
import { validateSightingForm } from "../lib/validators";
import { cn } from "@/shared/lib/cn";
import { toLocalDatetimeLocalString } from "@/shared/lib/date";
import { Toast } from "@/shared/ui/Toast";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import { supabase } from "@/shared/supabase/client";
import { DOG_BREEDS } from "../constants/breeds";

const inputBase =
  "w-full rounded-xl border bg-white px-4 py-3 text-[15px] shadow-sm transition-all outline-none focus:ring-2 focus:ring-primary/20 border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
const selectBase =
  "w-full rounded-xl border bg-white px-4 py-3 pr-10 text-[15px] shadow-sm transition-all outline-none focus:ring-2 focus:ring-primary/20 border-gray-200 appearance-none cursor-pointer dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat";

export function SightingForm() {
  const [formData, setFormData] = useState<SightingFormData>({
    photo: null,
    photoUrl: null,
    lat: 37.5665,
    lng: 126.978,
    time: toLocalDatetimeLocalString(),
    traitColor: "",
    traitSize: "",
    traitSpecies: "",
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocationSet, setIsLocationSet] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const naverMapsClientId = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID || "";

  // 초기 렌더링 시 현재 위치 가져오기
  useEffect(() => {
    if ("geolocation" in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }));
          setIsLocationSet(true);
          setIsLocating(false);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setIsLocating(false);

          let msg = "위치 정보를 가져오지 못했습니다.";
          if (error.code === error.PERMISSION_DENIED) {
            msg = "위치 권한을 허용해주세요.";
          } else if (error.code === error.TIMEOUT) {
            msg = "측정 시간이 초과되었습니다. 다시 시도해주세요.";
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = "현재 위치 정보를 사용할 수 없습니다.";
          }
          setToast({ message: msg, type: "error" });
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, photo: file, photoUrl: url }));
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (formData.photoUrl) URL.revokeObjectURL(formData.photoUrl);
    setFormData((prev) => ({ ...prev, photo: null, photoUrl: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const errors = validateSightingForm(formData);
  const isValid = Object.keys(errors).length === 0 && isLocationSet;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !formData.photo) {
      setShowErrors(true);
      return;
    }

    // 1. 네트워크 연결 상태 확인
    if (typeof window !== "undefined" && !window.navigator.onLine) {
      setToast({ message: "이미지 업로드에 실패했습니다.", type: "error" });
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. 사진 업로드 (Presigned URL 발급 + Storage 업로드)
      const fileKey = await uploadPhoto(formData.photo);

      // 3. 목격 제보 저장
      await registerSighting(fileKey, formData);

      setToast({
        message: "제보가 성공적으로 등록되었습니다!",
        type: "success",
      });

      // 폼 초기화
      resetForm();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 사진을 업로드하고 fileKey를 반환합니다.
   */
  const uploadPhoto = async (photo: File): Promise<string> => {
    try {
      // 1-1. Presigned URL 요청
      const presignRes = await fetch("/api/v1/uploads/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          purpose: "sighting_photo",
          files: [{ contentType: photo.type, sizeBytes: photo.size }],
        }),
      });

      // HTTP 상태 코드 체크
      if (!presignRes.ok) {
        const errorData = await presignRes.json();
        const errorMessage =
          errorData.error?.message || "이미지 업로드에 실패했습니다.";
        throw new Error(errorMessage);
      }

      const presignResult = await presignRes.json();
      if (!presignResult.success) {
        const errorMessage =
          presignResult.error?.message || "이미지 업로드에 실패했습니다.";
        throw new Error(errorMessage);
      }

      const { uploadUrl, fileKey } = presignResult.data.uploads[0];

      // 1-2. Storage로 직접 업로드 (PUT)
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": photo.type },
        body: photo,
      });

      if (!uploadRes.ok) {
        throw new Error("이미지 업로드에 실패했습니다.");
      }

      return fileKey;
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
  const registerSighting = async (fileKey: string, data: SightingFormData) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const sightingRes = await fetch("/api/v1/sightings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          photoKeys: [fileKey],
          location: { lat: data.lat, lng: data.lng },
          occurredAt: new Date(data.time).toISOString(),
          traitColor: data.traitColor?.trim() || null,
          traitSize: data.traitSize?.trim() || null,
          traitSpecies: data.traitSpecies?.trim() || null,
          note: data.description?.trim() || null,
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
    setFormData({
      photo: null,
      photoUrl: null,
      lat: 37.5665,
      lng: 126.978,
      time: new Date().toISOString().slice(0, 16),
      traitColor: "",
      traitSize: "",
      traitSpecies: "",
      description: "",
    });
    setIsLocationSet(false);
    setShowErrors(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          <div className="flex items-center justify-between">
            <Text variant="body" className="text-text-main font-bold">
              목격 사진 <span className="text-primary">*</span>
            </Text>
            {showErrors && !formData.photo && (
              <span className="animate-pulse text-[11px] font-medium text-red-500">
                사진을 등록해주세요
              </span>
            )}
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group border-border-subtle bg-surface hover:border-primary/50 hover:bg-primary-soft/30 relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all"
          >
            {formData.photoUrl ? (
              <>
                <img
                  src={formData.photoUrl}
                  alt="Preview"
                  className="h-full w-full object-contain p-2"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                >
                  ✕
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-primary-soft text-primary flex h-16 w-16 items-center justify-center rounded-full shadow-sm">
                  <span className="text-3xl">➕</span>
                </div>
                <Text variant="body" className="text-text-sub font-medium">
                  촬영 및 앨범 선택
                </Text>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              ref={fileInputRef}
              onChange={handlePhotoChange}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <Text variant="body" className="text-text-main font-bold">
              목격 위치 <span className="text-primary">*</span>
            </Text>
            <Text
              variant="caption"
              color="caption"
              className="block text-[11px] leading-relaxed opacity-80"
            >
              현재 위치가 자동 입력되며, 변경 버튼으로 지도 상에서 변경
              가능합니다.
            </Text>
          </div>
          <button
            type="button"
            onClick={() => setIsMapOpen(true)}
            className="border-border-subtle hover:border-primary/50 focus:ring-primary/10 flex w-full items-center justify-between rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2 active:scale-[0.99]"
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
                  ? "현재 위치 확인 중..."
                  : isLocationSet
                    ? `${formData.lat.toFixed(6)}, ${formData.lng.toFixed(6)}`
                    : "위치 정보 접근 실패"}
              </Text>
            </div>
            <div className="bg-primary-soft flex items-center gap-1 rounded-lg px-3 py-1.5">
              <Text variant="caption" className="text-primary font-bold">
                <span className="text-lg">🐾</span> 변경
              </Text>
            </div>
          </button>
        </section>

        {isMapOpen && (
          <LocationPicker
            clientId={naverMapsClientId}
            initialLat={formData.lat}
            initialLng={formData.lng}
            onSelect={(lat, lng) => {
              setFormData((prev) => ({ ...prev, lat, lng }));
              setIsLocationSet(true);
            }}
            onClose={() => setIsMapOpen(false)}
          />
        )}

        <section className="space-y-6">
          <div className="space-y-3">
            <Text variant="body" className="text-text-main font-bold">
              목격 시간 <span className="text-primary">*</span>
            </Text>
            <input
              type="datetime-local"
              name="time"
              value={formData.time}
              max={toLocalDatetimeLocalString()}
              onChange={handleChange}
              className={cn(inputBase, "py-4")}
            />
          </div>

          <div className="space-y-3">
            <Text variant="body" className="text-text-main font-bold">
              색상 · 크기 · 종 (선택)
            </Text>
            <input
              type="text"
              name="traitColor"
              value={formData.traitColor}
              onChange={handleChange}
              placeholder="예: 흰색, 검정"
              className={inputBase}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <select
                  name="traitSize"
                  value={formData.traitSize}
                  onChange={handleChange}
                  className={cn(
                    selectBase,
                    "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]"
                  )}
                >
                  <option value="">크기</option>
                  <option value="소">소</option>
                  <option value="중">중</option>
                  <option value="대">대</option>
                </select>
              </div>
              <div className="relative">
                <select
                  name="traitSpecies"
                  value={formData.traitSpecies}
                  onChange={handleChange}
                  className={cn(
                    selectBase,
                    "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]"
                  )}
                >
                  <option value="">견종</option>
                  {DOG_BREEDS.map((breed) => (
                    <option key={breed} value={breed}>
                      {breed}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Text variant="body" className="text-text-main font-bold">
              추가 설명 (선택)
            </Text>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="상세 정보를 입력해주세요"
              rows={4}
              className={cn(inputBase, "resize-none py-4")}
            />
          </div>
        </section>

        <div className="sticky bottom-6 pt-4">
          <Button
            type="submit"
            className={cn(
              "h-14 w-full rounded-2xl text-lg font-bold shadow-xl transition-all active:scale-[0.98]",
              isValid
                ? "bg-primary text-white"
                : "pointer-events-none bg-gray-200 text-gray-400 shadow-none"
            )}
            isLoading={isSubmitting}
          >
            제보 등록
          </Button>
        </div>
      </form>
    </>
  );
}
