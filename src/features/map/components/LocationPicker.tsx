"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Script from "next/script";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

interface LocationPickerProps {
  clientId: string;
  initialLat: number;
  initialLng: number;
  onSelect: (lat: number, lng: number) => void;
  onClose: () => void;
}

export function LocationPicker({
  clientId,
  initialLat,
  initialLng,
  onSelect,
  onClose,
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  // 1. 컴포넌트 마운트 및 스크롤 잠금 처리
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "unset";
      // 2. 언마운트 시 지도 인스턴스 확실히 파괴
      if (mapInstanceRef.current) {
        if (window.naver?.maps?.Event) {
          window.naver.maps.Event.clearInstanceListeners(
            mapInstanceRef.current
          );
        }
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initMap = useCallback(() => {
    // 3. 지도가 초기화될 조건 확인 (DOM 존재 여부 및 중복 초기화 방지)
    if (!mapRef.current || !window.naver?.maps || mapInstanceRef.current)
      return;

    try {
      const mapOptions = {
        center: new window.naver.maps.LatLng(initialLat, initialLng),
        zoom: 16,
        zoomControl: false,
      };

      const map = new window.naver.maps.Map(mapRef.current, mapOptions);
      mapInstanceRef.current = map;

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(initialLat, initialLng),
        map: map,
        draggable: true,
        icon: {
          url: "/icons/marker.png",
          size: new window.naver.maps.Size(56, 56),
          scaledSize: new window.naver.maps.Size(56, 56),
          anchor: new window.naver.maps.Point(28, 56),
        },
      });
      markerRef.current = marker;

      window.naver.maps.Event.addListener(map, "click", (e: any) => {
        marker.setPosition(e.coord);
      });
    } catch (error) {
      console.error("Naver Map init error:", error);
    }
  }, [initialLat, initialLng]);

  // 4. 스크립트가 이미 로드된 경우를 위한 초기화 체크
  useEffect(() => {
    if (mounted && window.naver?.maps && !mapInstanceRef.current) {
      // DOM이 완전히 그려진 후 초기화되도록 약간의 지연을 줌
      const timer = setTimeout(initMap, 0);
      return () => clearTimeout(timer);
    }
  }, [mounted, initMap]);

  const handleConfirm = () => {
    if (markerRef.current) {
      const position = markerRef.current.getPosition();
      onSelect(position.lat(), position.lng());
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/40 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative flex h-[90vh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl transition-all">
        <Script
          src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
          onLoad={initMap}
        />

        <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-200" />

        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <button onClick={onClose} className="text-text-sub p-2 text-xl">
            ✕
          </button>
          <Text variant="body" className="font-bold">
            목격 위치 선택
          </Text>
          <div className="w-10" />
        </header>

        <div className="relative flex-1">
          <div ref={mapRef} className="h-full w-full" />

          <div className="pb-safe pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-6">
            <Button
              onClick={handleConfirm}
              className="bg-primary pointer-events-auto h-14 w-full max-w-md rounded-2xl text-white shadow-xl transition-transform active:scale-[0.98]"
            >
              이 위치로 선택
            </Button>
          </div>

          {/* 가이드 메시지 */}
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4">
            <div className="text-text-main flex items-center gap-2 rounded-full border border-gray-100 bg-white px-6 py-3 text-[14px] font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <div className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
              지도를 클릭하여 핀을 꽂아 목격 위치를 선택하세요
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
