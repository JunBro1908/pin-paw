"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { Loading } from "@/shared/ui/Loading";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";
import Image from "next/image";
import { MapItem, ClusterResponse } from "../types/naver";
import { ApiResponse } from "@/shared/types/api";
import { supabase } from "@/shared/supabase/client";

interface NaverMapProps {
  clientId: string;
}

// 클라이언트 캐시 타입
interface CacheValue {
  etag: string;
  items: MapItem[];
}

export function NaverMap({ clientId }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 인증 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();
  }, []);

  // 맵 인스턴스와 마커를 ref로 관리하여 리렌더링 시에도 유지
  const mapInstanceRef = useRef<any>(null);
  const myLocationMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const cacheRef = useRef<Map<string, CacheValue>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  /**
   * 마커 및 클러스터 렌더링 함수
   */
  const renderClusters = useCallback((items: MapItem[]) => {
    if (!mapInstanceRef.current || !window.naver?.maps) return;

    // 1. 기존 마커 제거
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    // 2. 새 마커 생성
    const newMarkers = items.map((item) => {
      let content = "";

      if (item.type === "cluster") {
        // 클러스터: 숫자와 함께 원형 표시
        const size = 30 + Math.min(item.count * 2, 20); // 데이터 수에 따라 크기 조절
        content = `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: #FF4D4D;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">
            ${item.count}
          </div>
        `;
      } else {
        // 포인트: 핀 형태의 마커
        content = `
          <div style="position: relative; width: 30px; height: 30px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21C16 17.5 19 14.4183 19 10C19 6.13401 15.866 3 12 3C8.13401 3 5 6.13401 5 10C5 14.4183 8 17.5 12 21Z" fill="#FF4D4D" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="10" r="3" fill="white"/>
            </svg>
          </div>
        `;
      }

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(item.lat, item.lng),
        map: mapInstanceRef.current,
        icon: {
          content,
          anchor: new window.naver.maps.Point(15, 15),
        },
      });

      return marker;
    });

    markersRef.current = newMarkers;
  }, []);

  /**
   * 클러스터 데이터 가져오기
   */
  const fetchClusters = useCallback(async () => {
    if (!mapInstanceRef.current) return;

    const bounds = mapInstanceRef.current.getBounds();
    const zoom = mapInstanceRef.current.getZoom();
    const sw = bounds.getSW();
    const ne = bounds.getNE();

    const minLat = sw.lat();
    const minLng = sw.lng();
    const maxLat = ne.lat();
    const maxLng = ne.lng();

    // 1. 서버(SQL)의 클러스터링 격자 크기와 동일하게 정의
    const getGridSize = (z: number, isAuth: boolean) => {
      const effectiveZoom = isAuth ? z : Math.min(z, 14);
      if (effectiveZoom >= 17) return 0.001;
      if (effectiveZoom >= 16) return 0.003;
      if (effectiveZoom >= 15) return 0.006;
      if (effectiveZoom >= 14) return 0.01;
      if (effectiveZoom >= 13) return 0.03;
      if (effectiveZoom >= 11) return 0.05;
      if (effectiveZoom >= 9) return 0.1;
      return 0.5;
    };

    // 2. 좌표를 특정 격자 인덱스로
    const gridSize = getGridSize(zoom, isAuthenticated);
    const snap = (num: number) => Math.floor(num / gridSize);

    // 3. Grid ID 기반의 캐시 키 생성
    const cacheKey = `${snap(minLat)},${snap(minLng)},${snap(maxLat)},${snap(maxLng)},${zoom}`;
    const cached = cacheRef.current.get(cacheKey);

    // 캐시가 있으면 즉시 렌더링 (SWR 패턴)
    if (cached) {
      renderClusters(cached.items);
    }

    try {
      const params = new URLSearchParams({
        minLat: minLat.toString(),
        minLng: minLng.toString(),
        maxLat: maxLat.toString(),
        maxLng: maxLng.toString(),
        zoom: zoom.toString(),
      });

      const headers: Record<string, string> = {};
      if (cached?.etag) {
        headers["If-None-Match"] = cached.etag;
      }

      const endpoint = isAuthenticated
        ? "/api/v1/auth/map/markers"
        : "/api/v1/public/map/clusters";

      const response = await fetch(`${endpoint}?${params}`, {
        headers,
      });

      if (response.status === 304) {
        return;
      }

      if (!response.ok) throw new Error("데이터를 가져오는데 실패했습니다.");

      const result: ApiResponse<ClusterResponse> = await response.json();
      if (result.ok && result.data) {
        const etag = response.headers.get("ETag") || "";
        const items = result.data.clusters;

        // 캐시 업데이트 및 렌더링
        cacheRef.current.set(cacheKey, { etag, items });
        renderClusters(items);
      }
    } catch (err) {
      console.error("Fetch clusters error:", err);
      setToast({
        message: "주변 데이터를 불러오는 데 실패했습니다.",
        type: "error",
      });
    }
  }, [renderClusters]);

  /**
   * 지도의 idle 이벤트 핸들러 (이동/줌 완료 시 발생)
   */
  const handleMapIdle = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchClusters();
    }, 300);
  }, [fetchClusters]);

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

      // 2. 이벤트 리스너 등록
      window.naver.maps.Event.addListener(
        mapInstanceRef.current,
        "idle",
        handleMapIdle
      );

      setIsLoaded(true);

      // 3. 지도가 로드되면 즉시 내 위치 찾기 시도
      handleCurrentLocation();
    } catch (err) {
      console.error("Naver Map Init Error:", err);
      setError("지도를 초기화하는 중 오류가 발생했습니다.");
    }
  }, [handleMapIdle, handleCurrentLocation]); // handleCurrentLocation을 dependency에 넣음

  useEffect(() => {
    if (window.naver?.maps && !mapInstanceRef.current) {
      initMap();
    }

    return () => {
      if (mapInstanceRef.current) {
        // 이벤트 리스너 제거는 destroy()에서 자동으로 처리될 수 있지만 명시적으로 관리하는 것이 좋음
        if (window.naver?.maps?.Event) {
          window.naver.maps.Event.clearInstanceListeners(
            mapInstanceRef.current
          );
        }
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [initMap]);

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
