"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";

interface PhotoCarouselProps {
  urls: string[];
  alt: string;
  className?: string;
  aspectClassName?: string;
  swipe?: boolean;
  autoPlay?: boolean;
  intervalMs?: number;
  showIndicators?: boolean;
}

export function PhotoCarousel({
  urls,
  alt,
  className,
  aspectClassName = "aspect-[4/3]",
  swipe = true,
  autoPlay = false,
  intervalMs = 1000,
  showIndicators = true,
}: PhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const current = Math.min(index, urls.length - 1);

  useEffect(() => {
    if (!autoPlay || urls.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % urls.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoPlay, intervalMs, urls.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    viewport.scrollTo({
      left: current * viewport.clientWidth,
      behavior: autoPlay ? "smooth" : "auto",
    });
  }, [autoPlay, current, swipe]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    setIndex(
      Math.max(
        0,
        Math.min(
          urls.length - 1,
          Math.round(viewport.scrollLeft / viewport.clientWidth)
        )
      )
    );
  };

  if (!urls.length) return null;

  return (
    <div
      className={cn(
        "border-border-subtle bg-surface-soft relative overflow-hidden border",
        className
      )}
    >
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        aria-label={`${alt} 사진 갤러리`}
        className={cn(
          "flex w-full snap-x snap-mandatory overscroll-x-contain",
          swipe
            ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "overflow-hidden"
        )}
      >
        {urls.map((url, photoIndex) => (
          <div
            key={`${url}-${photoIndex}`}
            className={cn(
              "relative w-full shrink-0 snap-center",
              aspectClassName
            )}
          >
            <Image
              src={url}
              alt={`${alt} ${photoIndex + 1}/${urls.length}`}
              fill
              sizes="(max-width: 768px) 100vw, 28rem"
              className="object-cover"
              priority={photoIndex === 0}
            />
          </div>
        ))}
      </div>
      {urls.length > 1 && showIndicators ? (
        <div
          className="absolute right-0 bottom-2 left-0 flex justify-center gap-1.5"
          aria-label={`${current + 1}번째 사진 선택됨`}
        >
          {urls.map((url, dotIndex) => (
            <span
              key={`${url}-dot-${dotIndex}`}
              aria-current={dotIndex === current}
              className={cn(
                "h-1.5 rounded-full shadow-sm transition-[width,background-color]",
                dotIndex === current ? "w-5 bg-white" : "w-1.5 bg-white/65"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
