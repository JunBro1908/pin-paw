"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";

interface PhotoCarouselProps {
  urls: string[];
  alt: string;
  className?: string;
  aspectClassName?: string;
}

export function PhotoCarousel({
  urls,
  alt,
  className,
  aspectClassName = "aspect-[4/3]",
}: PhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  if (!urls.length) return null;
  const current = Math.min(index, urls.length - 1);

  return (
    <div className={cn("relative overflow-hidden bg-gray-100", className)}>
      <div className={cn("relative w-full", aspectClassName)}>
        <Image
          src={urls[current]}
          alt={`${alt} ${current + 1}/${urls.length}`}
          fill
          sizes="(max-width: 768px) 100vw, 28rem"
          className="object-cover"
          priority={current === 0}
        />
        {urls.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="이전 사진"
              onClick={(event) => {
                event.preventDefault();
                setIndex((value) => (value - 1 + urls.length) % urls.length);
              }}
              className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white backdrop-blur-sm"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={(event) => {
                event.preventDefault();
                setIndex((value) => (value + 1) % urls.length);
              }}
              className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white backdrop-blur-sm"
            >
              ›
            </button>
            <div className="absolute right-0 bottom-2 left-0 flex justify-center gap-1.5">
              {urls.map((url, dotIndex) => (
                <button
                  type="button"
                  key={`${url}-${dotIndex}`}
                  aria-label={`${dotIndex + 1}번째 사진 보기`}
                  aria-current={dotIndex === current}
                  onClick={(event) => {
                    event.preventDefault();
                    setIndex(dotIndex);
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color]",
                    dotIndex === current
                      ? "bg-white w-5"
                      : "bg-white/65 w-1.5"
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
