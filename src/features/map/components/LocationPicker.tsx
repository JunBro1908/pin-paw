"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Script from "next/script";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/lib/cn";
import { scrollablePanelClass } from "@/shared/ui/ScrollablePanel";
import type {
  NaverGeocodeResponse,
  NaverMapClickEvent,
  NaverMapInstance,
  NaverMarkerInstance,
} from "@/features/map/types/naver";

const MIN_SEARCH_LENGTH = 2;

interface GeocodeItem {
  lat: number;
  lng: number;
  label: string;
}

interface NaverLocalSearchItem {
  title?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string | number;
  mapy?: string | number;
}

const subscribeToClientRuntime = () => () => {};

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
  const mapInstanceRef = useRef<NaverMapInstance>(null);
  const markerRef = useRef<NaverMarkerInstance>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(
    subscribeToClientRuntime,
    () => true,
    () => false
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [currentLocationError, setCurrentLocationError] = useState<
    string | null
  >(null);
  const [isLocating, setIsLocating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 1. 컴포넌트 마운트 및 스크롤 잠금 처리
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getClientRects().length > 0);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      const activeElement = document.activeElement;
      const focusTarget = !dialogRef.current.contains(activeElement)
        ? event.shiftKey
          ? lastElement
          : firstElement
        : event.shiftKey && activeElement === firstElement
          ? lastElement
          : !event.shiftKey && activeElement === lastElement
            ? firstElement
            : null;
      if (focusTarget) {
        event.preventDefault();
        focusTarget.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
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

      window.naver.maps.Event.addListener(
        map,
        "click",
        (e: NaverMapClickEvent) => {
          marker.setPosition(e.coord);
        }
      );
    } catch (error) {
      console.error("LocationPicker map init failed:", error);
    }
  }, [initialLat, initialLng]);

  useEffect(() => {
    initMap();
  }, [initMap]);

  useEffect(() => {
    return () => {
      mapInstanceRef.current?.destroy?.();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

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
        (status: string, response: NaverGeocodeResponse) => {
          if (status !== window.naver.maps.Service.Status.OK) {
            resolve([]);
            return;
          }
          const result = response?.result;
          const items = result?.items ?? [];
          resolve(
            items.map((item) => ({
              lat: item.point?.y ?? 0,
              lng: item.point?.x ?? 0,
              label: item.address ?? "",
            }))
          );
        }
      );
    });
  }, []);

  /** 장소 검색 (지역 API). 2023-08 이후 mapx/mapy는 WGS84*1e7. */
  const localSearchPromise = useCallback(
    (q: string): Promise<{ items: GeocodeItem[]; error: string | null }> => {
      return fetch(`/api/v1/search/local?query=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as {
            items?: NaverLocalSearchItem[];
            error?: { message?: string };
          } | null;
          if (!res.ok) {
            return {
              items: [] as GeocodeItem[],
              error:
                data?.error?.message ??
                "장소 검색에 실패했습니다. 검색 API 설정을 확인해주세요.",
            };
          }
          const items = data?.items ?? [];
          const nm = window.naver?.maps;
          return {
            items: items
              .map((item) => {
                const mapx = Number(item.mapx);
                const mapy = Number(item.mapy);
                if (!Number.isFinite(mapx) || !Number.isFinite(mapy)) {
                  return null;
                }

                let lat: number | null = null;
                let lng: number | null = null;

                // Current Local Search API: integer microdegrees (WGS84 * 1e7).
                if (Math.abs(mapx) > 1_000_000 && Math.abs(mapy) > 1_000_000) {
                  lng = mapx / 1e7;
                  lat = mapy / 1e7;
                } else if (nm?.TransCoord && nm.Point) {
                  // Legacy TM128 fallback (pre-2023 responses).
                  try {
                    const point = new nm.Point(mapx, mapy);
                    const latLng = nm.TransCoord.fromTM128ToLatLng(point);
                    lat = "lat" in latLng ? latLng.lat() : latLng.y;
                    lng = "lng" in latLng ? latLng.lng() : latLng.x;
                  } catch {
                    return null;
                  }
                } else {
                  return null;
                }

                if (
                  lat == null ||
                  lng == null ||
                  !Number.isFinite(lat) ||
                  !Number.isFinite(lng) ||
                  lat < -90 ||
                  lat > 90 ||
                  lng < -180 ||
                  lng > 180
                ) {
                  return null;
                }

                const sub =
                  item.roadAddress || item.address
                    ? ` · ${item.roadAddress || item.address}`
                    : "";
                return {
                  lat,
                  lng,
                  label: `${item.title ?? ""}${sub}`.trim(),
                };
              })
              .filter((x): x is GeocodeItem => x != null),
            error: null,
          };
        })
        .catch(() => ({
          items: [] as GeocodeItem[],
          error: "장소 검색 중 네트워크 오류가 발생했습니다.",
        }));
    },
    []
  );

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (query.length < MIN_SEARCH_LENGTH) return;
    setCurrentLocationError(null);
    setIsSearching(true);
    setSearchResults([]);

    const addressPromise = window.naver?.maps?.Service
      ? geocodePromise(query)
      : Promise.resolve([] as GeocodeItem[]);

    Promise.all([addressPromise, localSearchPromise(query)])
      .then(([addressList, placeResult]) => {
        setSearchResults([...addressList, ...placeResult.items]);
        setShowDropdown(true);
        if (placeResult.error && addressList.length === 0) {
          setCurrentLocationError(placeResult.error);
        }
        setIsSearching(false);
      })
      .catch(() => {
        setCurrentLocationError("검색에 실패했습니다. 다시 시도해주세요.");
        setIsSearching(false);
      });
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

    const onSuccess = (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      moveMapAndMarker(lat, lng);
      setIsLocating(false);
    };

    const onError = (err: GeolocationPositionError, retried: boolean) => {
      if (err.code === err.TIMEOUT && !retried) {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (retryErr) => onError(retryErr, true),
          { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
        );
        return;
      }
      setCurrentLocationError(
        err.code === err.PERMISSION_DENIED
          ? "위치 권한이 거부되었습니다. 브라우저 설정을 확인해주세요."
          : "위치를 가져올 수 없습니다. Wi-Fi/GPS를 켠 뒤 다시 시도해주세요."
      );
      setIsLocating(false);
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => onError(err, false),
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      }
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
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/40">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface text-text-main relative flex h-[90vh] w-full flex-col overflow-hidden rounded-t-[32px] shadow-2xl transition-all"
      >
        <Script
          src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`}
          onLoad={initMap}
          onReady={initMap}
        />
        <div className="bg-border-subtle mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full" />

        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="위치 선택 닫기"
            className="text-text-sub hover:bg-surface-soft focus-visible:outline-action-primary flex min-h-11 min-w-11 items-center justify-center rounded-xl text-xl focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span aria-hidden="true">×</span>
          </button>
          <Text as="h2" id={titleId} variant="body" className="font-bold">
            {title}
          </Text>
          <div className="w-11" />
        </header>

        {/* 주소 검색 */}
        <div className="shrink-0 px-4 pb-3">
          <div className="relative">
            <label htmlFor="location-search" className="sr-only">
              주소 또는 장소 검색
            </label>
            <input
              ref={searchInputRef}
              id="location-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={`주소 또는 장소 검색 (${MIN_SEARCH_LENGTH}글자 이상)`}
              className="border-border-subtle bg-surface text-text-main focus:border-action-primary focus:ring-action-primary/20 w-full rounded-xl border px-4 py-3 pr-24 outline-none focus:ring-2"
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
                className={cn(
                  "border-border-subtle bg-surface absolute top-full right-0 left-0 z-20 mt-1 rounded-xl border shadow-lg",
                  scrollablePanelClass.dropdown
                )}
              >
                {searchResults.length === 0 ? (
                  <div className="text-text-caption px-4 py-3 text-sm">
                    {isSearching ? "검색 중..." : "검색 결과가 없습니다."}
                  </div>
                ) : (
                  <ul className="py-1">
                    {searchResults.map((item, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => handleSelectResult(item)}
                          className="hover:bg-surface-soft min-h-11 w-full px-4 py-3 text-left text-sm"
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
            <p role="alert" className="text-danger-text mt-1 text-sm">
              {currentLocationError}
            </p>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={mapRef} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute top-2 right-4 left-4 flex justify-center">
              <div className="border-border-subtle bg-surface text-text-main flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] font-medium shadow-[0_4px_20px_rgb(0,0,0,0.08)]">
                <div className="bg-action-primary h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
                <span>{guideMessage}</span>
              </div>
            </div>
            {/* 현재 위치 버튼 (지도 맵뷰와 동일·오른쪽 하단) */}
            <div className="absolute right-4 bottom-24">
              <button
                type="button"
                onClick={handleCurrentLocation}
                disabled={isLocating}
                aria-label="현재 위치로 이동"
                className="bg-surface focus-visible:outline-action-primary pointer-events-auto flex h-12 min-h-11 w-12 min-w-11 items-center justify-center rounded-2xl shadow-xl transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-50"
              >
                {isLocating ? (
                  <div className="border-action-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                ) : (
                  <div className="relative h-1/2 w-1/2">
                    <Image
                      src="/icons/my_location.svg"
                      alt=""
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </button>
            </div>
            <div className="pb-safe absolute inset-x-0 bottom-8 flex justify-center px-6">
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirm}
                className="pointer-events-auto h-14 w-full max-w-md rounded-2xl shadow-xl transition-transform active:scale-[0.98]"
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
