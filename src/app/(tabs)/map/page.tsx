"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { NaverMap } from "@/features/map/components/NaverMap";

function MapPageContent() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const searchParams = useSearchParams();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const sightingId = searchParams.get("sightingId");

  const initialCenter = useMemo(() => {
    if (
      latParam == null ||
      lngParam == null ||
      Number.isNaN(Number(latParam)) ||
      Number.isNaN(Number(lngParam))
    )
      return undefined;
    return { lat: Number(latParam), lng: Number(lngParam) };
  }, [latParam, lngParam]);

  const initialFocusSightingId = searchParams.get("sightingId") ?? undefined;
  const initialLostPostId = searchParams.get("lostPostId") ?? undefined;

  return (
    <div className="relative h-[calc(100dvh-80px)] w-full overflow-hidden">
      {!clientId ? (
        <div className="bg-surface flex h-full items-center justify-center p-10 text-center">
          <Text color="error">
            Naver Client ID가 설정되지 않았습니다. <br />
            .env 파일에 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID를 설정해주세요.
          </Text>
        </div>
      ) : (
        <NaverMap
          clientId={clientId}
          initialCenter={initialCenter ?? undefined}
          initialCenterSightingId={
            initialCenter ? undefined : (sightingId ?? undefined)
          }
          initialFocusSightingId={initialFocusSightingId}
          initialLostPostId={initialLostPostId}
        />
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-surface flex h-[calc(100dvh-80px)] items-center justify-center">
          <Text variant="caption">지도를 준비 중입니다...</Text>
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
