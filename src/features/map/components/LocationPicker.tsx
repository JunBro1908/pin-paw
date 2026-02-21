"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Script from "next/script";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

const MIN_SEARCH_LENGTH = 2;

interface GeocodeItem {
  lat: number;
  lng: number;
  label: string;
}

interface LocationPickerProps {
  clientId: string;
  initialLat: number;
  initialLng: number;
  onSelect: (lat: number, lng: number) => void;
  onClose: () => void;
  /** 모달 헤더 제목 (예: "유실 위치 선택", "목격 위치 선택") */
  title?: string;
  /** 가이드 문구 (예: "지도를 클릭하여 핀을 꽂아 유실 위치를 선택하세요") */
  guideMessage?: string;
}

export function LocationPicker({
  clientId,
  initialLat,
  initialLng,
  onSelect,
  onClose,
  title = "위치 선택",
  guideMessage = "지도를 클릭하여 핀을 꽂아 위치를 선택하세요",
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [currentLocationError, setCurrentLocationError] = useState<
    string | null
  >(null);
  const [isLocating, setIsLocating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. 컴포넌트 마운트 및 스크롤 잠금 처리
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
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

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        showDropdown &&
        dropdownRef.current &&
        searchInputRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const initMap = useCallback(() => {
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

  useEffect(() => {
    if (mounted && window.naver?.maps && !mapInstanceRef.current) {
      const timer = setTimeout(initMap, 0);
      return () => clearTimeout(timer);
    }
  }, [mounted, initMap]);

  const moveMapAndMarker = useCallback((lat: number, lng: number) => {
    if (!mapInstanceRef.current || !markerRef.current || !window.naver?.maps)
      return;
    const latLng = new window.naver.maps.LatLng(lat, lng);
    mapInstanceRef.current.panTo(latLng);
    markerRef.current.setPosition(latLng);
  }, []);

  /** 주소 검색 (Geocoder) → 결과만 반환 */
  const geocodePromise = useCallback((q: string): Promise<GeocodeItem[]> => {
    return new Promise((resolve) => {
      if (!window.naver?.maps?.Service) {
        resolve([]);
        return;
      }
      window.naver.maps.Service.geocode(
        { address: q },
        (status: string, response: any) => {
          if (status !== window.naver.maps.Service.Status.OK) {
            resolve([]);
            return;
          }
          const result = response?.result;
          const items = result?.items ?? [];
          resolve(
            items.map((item: any) => ({
              lat: item.point?.y ?? 0,
              lng: item.point?.x ?? 0,
              label: item.address ?? "",
            }))
          );
        }
      );
    });
  }, []);

  /** 장소 검색 (지역 API) → mapx, mapy를 TM128→WGS84 변환 */
  const localSearchPromise = useCallback(
    (q: string): Promise<GeocodeItem[]> => {
      return fetch(`/api/v1/search/local?query=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items?: any[] }) => {
          const items = data.items ?? [];
          const nm = window.naver?.maps;
          if (!nm?.TransCoord) return [];
          return items
            .map((item: any) => {
              try {
                const point = new nm.Point(
                  Number(item.mapx),
                  Number(item.mapy)
                );
                const latLng = nm.TransCoord.fromTM128ToLatLng(point);
                const lat =
                  typeof latLng.lat === "function"
                    ? latLng.lat()
                    : (latLng as { y: number }).y;
                const lng =
                  typeof latLng.lng === "function"
                    ? latLng.lng()
                    : (latLng as { x: number }).x;
                const sub =
                  item.roadAddress || item.address
                    ? ` · ${item.roadAddress || item.address}`
                    : "";
                return {
                  lat,
                  lng,
                  label: `${item.title ?? ""}${sub}`.trim(),
                };
              } catch {
                return null;
              }
            })
            .filter(
              (x): x is GeocodeItem =>
                x != null && Number.isFinite(x.lat) && Number.isFinite(x.lng)
            );
        })
        .catch(() => []);
    },
    []
  );

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (query.length < MIN_SEARCH_LENGTH) return;
    if (!window.naver?.maps?.Service) {
      setCurrentLocationError(
        "주소 검색 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요."
      );
      return;
    }
    setCurrentLocationError(null);
    setIsSearching(true);
    setSearchResults([]);

    Promise.all([geocodePromise(query), localSearchPromise(query)]).then(
      ([addressList, placeList]) => {
        setSearchResults([...addressList, ...placeList]);
        setShowDropdown(true);
        setIsSearching(false);
      }
    );
  }, [searchQuery, geocodePromise, localSearchPromise]);

  const handleSelectResult = useCallback(
    (item: GeocodeItem) => {
      moveMapAndMarker(item.lat, item.lng);
      setShowDropdown(false);
      setSearchQuery("");
      setSearchResults([]);
    },
    [moveMapAndMarker]
  );

  const handleCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setCurrentLocationError("이 기기에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setCurrentLocationError(null);
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        moveMapAndMarker(lat, lng);
        setIsLocating(false);
      },
      () => {
        setCurrentLocationError(
          "위치를 가져올 수 없습니다. 권한을 확인해주세요."
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [moveMapAndMarker]);

  const handleConfirm = () => {
    if (markerRef.current) {
      const position = markerRef.current.getPosition();
      onSelect(position.lat(), position.lng());
      onClose();
    }
  };

  const canSearch = searchQuery.trim().length >= MIN_SEARCH_LENGTH;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/40 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-[90vh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl transition-all">
        <Script
          src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`}
          onLoad={initMap}
        />
        <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-200" />

        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <button onClick={onClose} className="text-text-sub p-2 text-xl">
            ✕
          </button>
          <Text variant="body" className="font-bold">
            {title}
          </Text>
          <div className="w-10" />
        </header>

        {/* 주소 검색 */}
        <div className="shrink-0 px-4 pb-3">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={`주소 또는 장소 검색 (${MIN_SEARCH_LENGTH}글자 이상)`}
              className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 pr-24 outline-none focus:ring-2"
            />
            <Button
              type="button"
              variant="primary"
              onClick={handleSearch}
              disabled={!canSearch || isSearching}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg px-3 py-2 text-sm"
            >
              {isSearching ? "검색 중..." : "검색"}
            </Button>
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="border-border-subtle bg-surface absolute top-full right-0 left-0 z-20 mt-1 max-h-48 overflow-auto rounded-xl border shadow-lg"
              >
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    {isSearching ? "검색 중..." : "검색 결과가 없습니다."}
                  </div>
                ) : (
                  <ul className="py-1">
                    {searchResults.map((item, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => handleSelectResult(item)}
                          className="w-full px-4 py-3 text-left text-sm hover:bg-gray-100"
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {currentLocationError && (
            <p className="mt-1 text-sm text-red-500">{currentLocationError}</p>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={mapRef} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute top-2 right-4 left-4 flex justify-center">
              <div className="text-text-main flex items-center gap-2 rounded-full border border-gray-100 bg-white px-5 py-2.5 text-[13px] font-medium shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
                <div className="bg-primary h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
                <span>{guideMessage}</span>
              </div>
            </div>
            {/* 현재 위치 버튼 (지도 맵뷰와 동일·오른쪽 하단) */}
            <div className="absolute right-4 bottom-24">
              <button
                type="button"
                onClick={handleCurrentLocation}
                disabled={isLocating}
                className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 dark:bg-gray-800"
              >
                {isLocating ? (
                  <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                ) : (
                  <div className="relative h-1/2 w-1/2">
                    <Image
                      src="/icons/my_location.svg"
                      alt="현재 위치"
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </button>
            </div>
            <div className="pb-safe absolute inset-x-0 bottom-8 flex justify-center px-6">
              <Button
                onClick={handleConfirm}
                className="bg-primary pointer-events-auto h-14 w-full max-w-md rounded-2xl text-white shadow-xl transition-transform active:scale-[0.98]"
              >
                이 위치로 선택
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
