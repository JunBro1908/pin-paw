"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { Loading } from "@/shared/ui/Loading";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";
import Image from "next/image";

interface NaverMapProps {
  clientId: string;
}

export function NaverMap({ clientId }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 맵 인스턴스와 마커를 ref로 관리하여 리렌더링 시에도 유지
  const mapInstanceRef = useRef<any>(null);
  const myLocationMarkerRef = useRef<any>(null);

  // 로딩 및 피드백 상태
  const [isLocating, setIsLocating] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  /**
   * 지도 초기화 함수
   */
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.naver?.maps || mapInstanceRef.current)
      return;

    try {
      // 1. 기본 옵션으로 지도 생성 (일단 시청역 중심)
      const mapOptions = {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 13,
        zoomControl: true,
        zoomControlOptions: {
          position: window.naver.maps.Position.RIGHT_CENTER,
        },
      };

      mapInstanceRef.current = new window.naver.maps.Map(
        mapRef.current,
        mapOptions
      );
      setIsLoaded(true);

      // 2. 지도가 로드되면 즉시 내 위치 찾기 시도
      handleCurrentLocation();
    } catch (err) {
      console.error("Naver Map Init Error:", err);
      setError("지도를 초기화하는 중 오류가 발생했습니다.");
    }
  }, []); // handleCurrentLocation을 dependency에 넣으면 순환 참조가 생길 수 있으므로 주의

  useEffect(() => {
    if (window.naver?.maps && !mapInstanceRef.current) {
      initMap();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [initMap]);

  /**
   * 현재 위치 찾기 및 지도 이동
   */
  const handleCurrentLocation = useCallback(() => {
    console.log("handleCurrentLocation called"); // 디버깅용 로그

    if (!navigator.geolocation) {
      setToast({
        message: "위치 정보를 지원하지 않는 브라우저입니다.",
        type: "error",
      });
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log("Location found:", latitude, longitude); // 디버깅용 로그

        const currentLatLng = new window.naver.maps.LatLng(latitude, longitude);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(currentLatLng);
          mapInstanceRef.current.setZoom(16);
        }

        if (myLocationMarkerRef.current) {
          myLocationMarkerRef.current.setPosition(currentLatLng);
        } else if (window.naver?.maps) {
          myLocationMarkerRef.current = new window.naver.maps.Marker({
            position: currentLatLng,
            map: mapInstanceRef.current,
            icon: {
              content: `
                <div style="width: 22px; height: 22px; background: #4285F4; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3); position: relative;">
                  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #4285F4; border-radius: 50%; animation: pulse 2s infinite;"></div>
                </div>
                <style>
                  @keyframes pulse {
                    0% { transform: scale(1); opacity: 0.8; }
                    100% { transform: scale(2.5); opacity: 0; }
                  }
                </style>
              `,
              anchor: new window.naver.maps.Point(11, 11),
            },
          });
        }
        setIsLocating(false);
      },
      (err) => {
        console.error("Geolocation Error Code:", err.code);
        console.error("Geolocation Error Message:", err.message);
        setIsLocating(false);

        let msg = "위치 정보를 가져오지 못했습니다.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "위치 권한을 허용해주세요.";
        } else if (err.code === err.TIMEOUT) {
          msg = "측정 시간이 초과되었습니다. 다시 시도해주세요.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "현재 위치 정보를 사용할 수 없습니다.";
        }
        setToast({ message: msg, type: "error" });
      },
      {
        enableHighAccuracy: false, // 정확도를 살짝 낮추면 훨씬 빠르게 잡히는 경우가 많습니다.
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  if (error) {
    return (
      <div className="bg-surface flex h-full items-center justify-center">
        <Text color="error">{error}</Text>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
        onLoad={initMap}
      />

      <div className="bg-surface relative h-full w-full">
        <div ref={mapRef} className="h-full w-full" />

        {/* 현재 위치 버튼 */}
        {isLoaded && (
          <button
            onClick={handleCurrentLocation}
            disabled={isLocating}
            className="absolute right-5 bottom-24 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xl active:scale-95 disabled:opacity-50 dark:bg-gray-800"
          >
            {isLocating ? (
              <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
            ) : (
              <div className="relative h-1/2 w-1/2">
                <Image
                  src="/icons/my_location.svg"
                  alt="Location"
                  fill
                  className="object-contain"
                />
              </div>
            )}
          </button>
        )}

        {/* 로딩 오버레이 */}
        {!isLoaded && (
          <div className="bg-surface/50 absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loading />
            <Text variant="caption" className="mt-2">
              지도를 준비 중입니다...
            </Text>
          </div>
        )}

        {/* 토스트 알림 */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </>
  );
}
