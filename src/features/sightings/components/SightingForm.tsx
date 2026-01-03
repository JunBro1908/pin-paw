"use client";

import { useState, useRef } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { SightingFormData } from "../model/types";
import { validateSightingForm } from "../lib/validators";
import { cn } from "@/shared/lib/cn";
import { Toast } from "@/shared/ui/Toast";

export function SightingForm() {
  const [formData, setFormData] = useState<SightingFormData>({
    photo: null,
    photoUrl: null,
    lat: 37.5665,
    lng: 126.978,
    locationName: "",
    time: new Date().toISOString().slice(0, 16),
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const isValid = Object.keys(errors).length === 0;

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

      const presignResult = await presignRes.json();
      if (!presignResult.success) {
        throw new Error(presignResult.error || "이미지 업로드에 실패했습니다.");
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
      const sightingRes = await fetch("/api/v1/sightings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoKeys: [fileKey],
          location: { lat: data.lat, lng: data.lng },
          occurredAt: new Date(data.time).toISOString(),
          note: data.description,
        }),
      });

      const sightingResult = await sightingRes.json();
      if (!sightingResult.success) {
        throw new Error(sightingResult.error || "제보 등록에 실패했습니다.");
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
      locationName: "",
      time: new Date().toISOString().slice(0, 16),
      description: "",
    });
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
          <div className="flex items-center justify-between">
            <Text variant="body" className="text-text-main font-bold">
              목격 위치 <span className="text-primary">*</span>
            </Text>
          </div>
          <input
            name="locationName"
            value={formData.locationName}
            onChange={handleChange}
            placeholder="목격한 장소를 입력해주세요"
            className="border-border-subtle focus:border-primary focus:ring-primary/10 w-full rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2"
          />
        </section>

        <section className="space-y-6">
          <div className="space-y-3">
            <Text variant="body" className="text-text-main font-bold">
              목격 시간
            </Text>
            <input
              type="datetime-local"
              name="time"
              value={formData.time}
              max={new Date().toISOString().slice(0, 16)}
              onChange={handleChange}
              className="border-border-subtle focus:border-primary focus:ring-primary/10 w-full rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2"
            />
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
              className="border-border-subtle focus:border-primary focus:ring-primary/10 w-full resize-none rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2"
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
