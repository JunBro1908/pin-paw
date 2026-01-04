"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Loading } from "@/shared/ui/Loading";
import { Text } from "@/shared/ui/Text";

interface NaverMapProps {
  clientId: string;
}

export function NaverMap({ clientId }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    // If naver is already loaded, initialize the map
    if (window.naver && window.naver.maps && !mapInstanceRef.current) {
      initMap();
    }

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || !window.naver?.maps || mapInstanceRef.current)
      return;

    try {
      const mapOptions = {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 13,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position.RIGHT_CENTER,
        },
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: window.naver.maps.Position.TOP_RIGHT,
        },
      };

      mapInstanceRef.current = new window.naver.maps.Map(
        mapRef.current,
        mapOptions
      );
      setIsLoaded(true);
    } catch (err) {
      console.error("Failed to initialize Naver Map:", err);
      setError("지도를 초기화하는 중 오류가 발생했습니다.");
    }
  };

  if (error) {
    return (
      <div className="bg-surface flex h-full w-full items-center justify-center">
        <Text color="error">{error}</Text>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
        onLoad={initMap}
        onError={() => setError("Naver Maps SDK를 불러오는 데 실패했습니다.")}
      />
      <div className="bg-surface relative h-full w-full overflow-hidden">
        <div ref={mapRef} className="h-full w-full" />
        {!isLoaded && (
          <div className="bg-surface/50 absolute inset-0 flex flex-col items-center justify-center">
            <Loading />
            <Text variant="caption" className="mt-2">
              지도를 불러오는 중...
            </Text>
          </div>
        )}
      </div>
    </>
  );
}
