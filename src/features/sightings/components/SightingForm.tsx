"use client";

import { useState, useRef } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { SightingFormData } from "../model/types";
import { validateSightingForm } from "../lib/validators";
import { cn } from "@/shared/lib/cn";

/**
 * 목격 제보를 위한 메인 폼 컴포넌트입니다.
 */
export function SightingForm() {
  // 1. 초기 상태 설정
  const [formData, setFormData] = useState<SightingFormData>({
    photo: null,
    photoUrl: null,
    location: "",
    time: new Date().toISOString().slice(0, 16),
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false); // 에러 표시 여부 상태
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2. 입력값 변경 핸들러
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, photo: file, photoUrl: url }));
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 3. 사진 제거 핸들러
  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (formData.photoUrl) {
      URL.revokeObjectURL(formData.photoUrl);
    }
    setFormData((prev) => ({ ...prev, photo: null, photoUrl: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 4. 유효성 검사
  const errors = validateSightingForm(formData);
  const isValid = Object.keys(errors).length === 0;

  // 5. 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효하지 않으면 에러 표시 활성화
    if (!isValid) {
      setShowErrors(true);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      alert("제보가 성공적으로 등록되었습니다!");
      setIsSubmitting(false);
      setShowErrors(false);
    }, 1500);
  };

  const maxDateTime = new Date().toISOString().slice(0, 16);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 사진 업로드 섹션 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Text variant="body" className="text-text-main font-bold">
            목격 사진 <span className="text-primary">*</span>
          </Text>
          {showErrors && formData.photo === null && (
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
                className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
              >
                <span className="text-lg">✕</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 transition-transform group-hover:scale-105">
              <div className="bg-primary-soft text-primary flex h-16 w-16 items-center justify-center rounded-full shadow-sm">
                <span className="text-3xl">➕</span>
              </div>
              <div className="text-center">
                <Text variant="body" className="text-text-sub font-medium">
                  촬영 및 앨범 선택
                </Text>
                <Text variant="caption" className="mt-1 opacity-60">
                  동물의 특징이 잘 보이게 찍어주세요
                </Text>
              </div>
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

      {/* 위치 정보 섹션 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Text variant="body" className="text-text-main font-bold">
            목격 위치 <span className="text-primary">*</span>
          </Text>
          {showErrors && !formData.location.trim() && (
            <span className="animate-pulse text-[11px] font-medium text-red-500">
              위치를 입력해주세요
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-2 rounded-xl py-3 text-sm shadow-sm"
          >
            📍 현재 위치
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-2 rounded-xl py-3 text-sm shadow-sm"
          >
            🗺️ 지도 선택
          </Button>
        </div>
        <input
          name="location"
          value={formData.location}
          onChange={handleChange}
          placeholder="상세 위치를 입력해주세요"
          className="border-border-subtle focus:border-primary focus:ring-primary/10 w-full rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2"
        />
      </section>

      {/* 시간 및 설명 섹션 */}
      <section className="space-y-6">
        <div className="space-y-3">
          <Text variant="body" className="text-text-main font-bold">
            목격 시간
          </Text>
          <input
            type="datetime-local"
            name="time"
            value={formData.time}
            max={maxDateTime}
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
            placeholder="동물의 특징이나 상황을 알려주세요 (털 색깔, 목줄 여부 등)"
            rows={4}
            className="border-border-subtle focus:border-primary focus:ring-primary/10 w-full resize-none rounded-xl border bg-white px-4 py-4 text-base shadow-sm transition-all outline-none focus:ring-2"
          />
        </div>
      </section>

      {/* 최종 등록 버튼 */}
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
  );
}
