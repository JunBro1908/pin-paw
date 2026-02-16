"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/lib/cn";
import { Toast } from "@/shared/ui/Toast";
import { LocationPicker } from "@/features/map/components/LocationPicker";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { LostPostFormData } from "../model/types";

const naverMapsClientId = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID || "";

const initialFormData: LostPostFormData = {
  photo: null,
  photoUrl: null,
  lat: 37.5665,
  lng: 126.978,
  lostAt: new Date().toISOString().slice(0, 16),
  traitColor: "",
  traitSize: "",
  traitState: "",
};

export function LostPostForm() {
  const router = useRouter();
  const { session } = useAuth();
  const [formData, setFormData] = useState<LostPostFormData>(initialFormData);
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
        () => setIsLocating(false),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({
        ...prev,
        photo: file,
        photoUrl: URL.createObjectURL(file),
      }));
    }
  };

  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (formData.photoUrl) URL.revokeObjectURL(formData.photoUrl);
    setFormData((prev) => ({ ...prev, photo: null, photoUrl: null }));
    fileInputRef.current && (fileInputRef.current.value = "");
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
    !!formData.photo && isLocationSet && !!formData.lostAt?.trim();

  const uploadCover = async (file: File): Promise<string> => {
    const token = session?.access_token;
    const presignRes = await fetch("/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        purpose: "lost_cover",
        files: [{ contentType: file.type, sizeBytes: file.size }],
      }),
    });
    if (!presignRes.ok) {
      const err = await presignRes.json();
      throw new Error(err.error?.message || "이미지 업로드에 실패했습니다.");
    }
    const { data } = await presignRes.json();
    if (!data?.uploads?.[0]) throw new Error("이미지 업로드에 실패했습니다.");
    const { uploadUrl, fileKey } = data.uploads[0];

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("이미지 업로드에 실패했습니다.");
    return fileKey;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !formData.photo || !session?.access_token) {
      setShowErrors(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const fileKey = await uploadCover(formData.photo);
      const res = await fetch("/api/v1/lost-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          coverPhotoKey: fileKey,
          lostAt: new Date(formData.lostAt).toISOString(),
          lostLocation: { lat: formData.lat, lng: formData.lng },
          traitColor: formData.traitColor.trim() || undefined,
          traitSize: formData.traitSize.trim() || undefined,
          traitState: formData.traitState.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "유실글 등록에 실패했습니다.");
      }

      setToast({ message: "유실글이 등록되었습니다.", type: "success" });
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
              "border-border-subtle bg-surface flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all",
              "hover:border-primary/50 hover:bg-primary-soft/30"
            )}
          >
            {formData.photoUrl ? (
              <>
                <img
                  src={formData.photoUrl}
                  alt="미리보기"
                  className="h-full w-full object-cover"
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
              accept="image/*"
              hidden
              ref={fileInputRef}
              onChange={handlePhotoChange}
            />
          </div>
        </section>

        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            유실 위치 <span className="text-primary">*</span>
          </Text>
          <button
            type="button"
            onClick={() => setIsMapOpen(true)}
            className="border-border-subtle hover:border-primary/50 w-full rounded-xl border bg-white px-4 py-4 text-left"
          >
            <Text variant="body">
              {isLocating
                ? "위치 확인 중..."
                : isLocationSet
                  ? `${formData.lat.toFixed(5)}, ${formData.lng.toFixed(5)}`
                  : "지도에서 위치 선택"}
            </Text>
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

        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            유실 일시 <span className="text-primary">*</span>
          </Text>
          <input
            type="datetime-local"
            name="lostAt"
            value={formData.lostAt}
            max={new Date().toISOString().slice(0, 16)}
            onChange={handleChange}
            className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-4 outline-none focus:ring-2"
          />
        </section>

        <section className="space-y-3">
          <Text variant="body" className="font-bold">
            특징 (선택)
          </Text>
          <input
            type="text"
            name="traitColor"
            value={formData.traitColor}
            onChange={handleChange}
            placeholder="색상"
            className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
          />
          <input
            type="text"
            name="traitSize"
            value={formData.traitSize}
            onChange={handleChange}
            placeholder="크기"
            className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
          />
          <input
            type="text"
            name="traitState"
            value={formData.traitState}
            onChange={handleChange}
            placeholder="특징 (예: 목걸이 착용)"
            className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
          />
        </section>

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
