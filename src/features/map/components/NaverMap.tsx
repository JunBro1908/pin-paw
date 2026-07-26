"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Script from "next/script";
import { Loading } from "@/shared/ui/Loading";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";
import Image from "next/image";
import { MapItem } from "../types/naver";
import type { NaverMapInstance, NaverMarkerInstance } from "../types/naver";
import { createClient } from "@/shared/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useMyLostPosts } from "@/features/lost-posts/hooks/useMyLostPosts";
import { SightingDetailCard } from "@/features/sightings/components/SightingDetailCard";
import type { SightingDetailData } from "@/features/sightings/components/SightingDetailCard";
import { SightingDetailSheet } from "@/features/sightings/components/SightingDetailSheet";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_WARM_ZOOM,
  getBookmarkPathCoordinates,
  interpolatePath,
  normalizeSightingId,
  readStoredMapLayer,
  resolveMapLayerForSession,
  writeStoredMapLayer,
} from "../lib/map-domain";
import type { MapLayer, SightingFeedbackMap } from "../lib/map-domain";
import {
  createNaverMapAdapter,
  type NaverMapAdapter,
} from "../lib/naver-map-adapter";
import {
  createBrowserAnimationScheduler,
  createMapLayerRenderer,
  type MapLayerRenderer,
} from "../lib/map-layer-renderer";
import { useMapData } from "../hooks/use-map-data";

interface NaverMapProps {
  clientId: string;
  /** 마이페이지 등에서 전달한 초기 중심 좌표 (API 호출 없이 사용) */
  initialCenter?: { lat: number; lng: number };
  /** lat/lng 없이 제보 ID만 있을 때만 사용 — 단건 조회 후 중심 이동 (폴백) */
  initialCenterSightingId?: string;
  /** 이 ID에 해당하는 제보 상세 카드를 기본으로 열어 둠 (지도에서 보기 진입 시) */
  initialFocusSightingId?: string;
  /** 7-5: 유실글 컨텍스트 — 이 ID가 있으면 "내 강아지 인정" 제보를 초록 마커로 표시 */
  initialLostPostId?: string;
}

export function NaverMap({
  clientId,
  initialCenter,
  initialCenterSightingId,
  initialFocusSightingId,
  initialLostPostId,
}: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const { session, isLoading: isAuthLoading } = useAuth();
  const accessToken = session?.access_token;
  const hasCenteredSightingRef = useRef(false);
  const hasAutoFocusedRef = useRef(false);
  const isAuthenticated = Boolean(accessToken);

  // 맵 인스턴스와 마커를 ref로 관리하여 리렌더링 시에도 유지
  const mapInstanceRef = useRef<NaverMapInstance>(null);
  const mapAdapterRef = useRef<NaverMapAdapter>(null);
  const mapLayerRendererRef = useRef<MapLayerRenderer>(null);
  const myLocationMarkerRef = useRef<NaverMarkerInstance>(null);
  /** 경로 선이 '내 위치'로 연결되지 않도록, 마지막으로 아는 현재 위치 저장 */
  const lastMyPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 선택된 제보 정보 (팝업용)
  const [selectedSighting, setSelectedSighting] = useState<MapItem | null>(
    null
  );

  /**
   * 이벤트 전파를 중단하여 지도가 반응하지 않도록 합니다.
   * 모바일 환경에서 상세 창 스크롤 시 지도가 함께 움직이는 문제를 해결합니다.
   */
  const stopPropagation = useCallback((e: React.UIEvent | React.WheelEvent) => {
    e.stopPropagation();
  }, []);

  // 목록 보기 상태
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  /** 7-5: 북마크 등록/해제 시 유실글 선택 모달 */
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const [bookmarkModalMode, setBookmarkModalMode] = useState<
    "register" | "unregister"
  >("register");
  /** 7-5: 북마크 해제 모달에서만 사용 — 이 제보를 북마크한 내 유실글 목록 */
  const [claimedLostPostsForSighting, setClaimedLostPostsForSighting] =
    useState<
      { id: string; pet_name?: string; lost_at?: string | null }[] | null
    >(null);

  /** 지도 마커 레이어 필터 (전체 / 안 본 것 / 북마크) — localStorage로 유지 */
  const [mapLayer, setMapLayer] = useState<MapLayer>(() => readStoredMapLayer());
  const {
    items: itemsInView,
    feedback: sightingFeedbackMap,
    lostPosts: lostPostsForMap,
    paths: pathData,
    loading: mapDataLoading,
    error: mapDataError,
    loadViewport,
    reloadBookmark: fetchBookmarkLayerData,
    patchFeedback,
    reset: resetMapData,
  } = useMapData({
    accessToken,
    authLoading: isAuthLoading,
    layer: mapLayer,
    initialLostPostId,
  });
  const { items: cachedLostPosts } = useMyLostPosts({
    enabled: isAuthenticated,
  });
  const myLostPosts = useMemo(() => {
    type LostPostSummary = {
      id: string;
      pet_name?: string;
      lost_at?: string;
    };
    if (initialLostPostId) {
      const focused = cachedLostPosts.find((p) => p.id === initialLostPostId);
      if (focused) {
        return [
          {
            id: focused.id,
            pet_name: focused.pet_name,
            lost_at: focused.lost_at,
          } satisfies LostPostSummary,
        ];
      }
      return [{ id: initialLostPostId } satisfies LostPostSummary];
    }
    return cachedLostPosts.map(
      (p): LostPostSummary => ({
        id: p.id,
        pet_name: p.pet_name,
        lost_at: p.lost_at,
      })
    );
  }, [cachedLostPosts, initialLostPostId]);
  /** 레이어 선택 메뉴 열림 */
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  /** fetchClusters가 mapLayer에 의존하지 않도록 ref 사용 → 레이어 변경 시 지도 인스턴스/불필요 재요청 방지 */
  const mapLayerRef = useRef<MapLayer>(mapLayer);
  const prevMapLayerRef = useRef<MapLayer>(mapLayer);
  useEffect(() => {
    mapLayerRef.current = mapLayer;
    writeStoredMapLayer(mapLayer);
  }, [mapLayer]);

  // Guests cannot use unseen/bookmark; restore public clusters after logout.
  useEffect(() => {
    if (isAuthLoading) return;
    const nextLayer = resolveMapLayerForSession(mapLayer, isAuthenticated);
    if (nextLayer !== mapLayer) {
      setMapLayer(nextLayer);
    }
  }, [isAuthLoading, isAuthenticated, mapLayer]);

  /** 유실글 마커 터치 시 카드용 (제보 카드와 별도) */
  const [selectedLostPostForCard, setSelectedLostPostForCard] = useState<{
    id: string;
    pet_name?: string;
    lost_at?: string;
    cover_photo_key?: string;
    trait_color?: string;
    trait_size?: string;
    trait_species?: string;
    note?: string;
    lat: number;
    lng: number;
  } | null>(null);

  /** 7-5: 지도에서 제보(마커) 클릭 시 "본 적 있음" 기록 */
  const recordSeen = useCallback(
    (sightingId: string) => {
      if (!accessToken) return;
      fetch("/api/v1/me/sighting-views", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sightingId }),
      }).catch(() => {});
    },
    [accessToken]
  );

  /**
   * 이미지 URL 생성 헬퍼 (제보)
   */
  const getImageUrl = useCallback((key: string) => {
    const client = createClient();
    if (!client?.storage) return "";
    const { data } = client.storage.from("sightings").getPublicUrl(key);
    return data.publicUrl;
  }, []);

  /** 유실글 커버 이미지 URL — 유실글 상세페이지와 동일: lost 버킷 getPublicUrl */
  const getLostPostImageUrl = useCallback((key: string) => {
    const client = createClient();
    const ref = client?.storage?.from("lost");
    if (!ref) return "";
    return ref.getPublicUrl(key).data.publicUrl;
  }, []);

  /**
   * 현재 위치 찾기 및 지도 이동
   */
  const handleCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setToast({
        message: "위치 정보를 지원하지 않는 브라우저입니다.",
        type: "error",
      });
      return;
    }

    setIsLocating(true);

    const applyPosition = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const pos = { lat: latitude, lng: longitude };
      lastMyPositionRef.current = pos;
      const currentLatLng = new window.naver.maps.LatLng(latitude, longitude);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(currentLatLng);
        mapInstanceRef.current.setZoom(16);
      }

      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.setPosition(currentLatLng);
      } else if (window.naver?.maps && mapAdapterRef.current) {
        myLocationMarkerRef.current = mapAdapterRef.current.createMarker({
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
        mapAdapterRef.current.replaceMarkers(
          [myLocationMarkerRef.current],
          "my-location"
        );
      }
      setIsLocating(false);
    };

    const failWith = (err: GeolocationPositionError, retried: boolean) => {
      // First timeout: retry once with a longer window and cached fix allowed.
      if (err.code === err.TIMEOUT && !retried) {
        navigator.geolocation.getCurrentPosition(
          applyPosition,
          (retryErr) => failWith(retryErr, true),
          {
            enableHighAccuracy: false,
            timeout: 30000,
            maximumAge: 120000,
          }
        );
        return;
      }

      console.error("Geolocation Error Code:", err.code);
      console.error("Geolocation Error Message:", err.message);
      setIsLocating(false);

      let msg = "위치 정보를 가져오지 못했습니다.";
      if (err.code === err.PERMISSION_DENIED) {
        msg =
          "위치 권한이 거부되었습니다. 브라우저/OS 설정에서 위치 접근을 허용해주세요.";
      } else if (err.code === err.TIMEOUT) {
        msg =
          "위치 측정 시간이 초과되었습니다. Wi-Fi/GPS를 켠 뒤 다시 시도해주세요.";
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        msg = "현재 위치 정보를 사용할 수 없습니다.";
      }
      setToast({ message: msg, type: "error" });
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (err) => failWith(err, false),
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      }
    );
  }, []);

  /**
   * 마커 및 클러스터 렌더링 함수
   * 7-5: feedback 있으면 포인트별 본/인정 상태에 따라 테두리 색상 적용 (빨강/회색/초록)
   */
  const renderClusters = useCallback(
    (items: MapItem[], feedback?: SightingFeedbackMap) => {
      const map = mapInstanceRef.current;
      const renderer = mapLayerRendererRef.current;
      if (!map || !renderer) return;

      renderer.renderSightings({
        map,
        items,
        feedback: feedback ?? {},
        getImageUrl,
        onItemClick(item, marker) {
          if (item.type === "cluster") {
            const currentZoom = map.getZoom();
            if (currentZoom >= 16) {
              // Guests only receive masked clusters — opening the point list is empty/noise.
              if (isAuthenticated) {
                setIsListViewOpen(true);
              }
              map.panTo(marker.getPosition());
            } else {
              map.morph(marker.getPosition(), currentZoom + 2);
            }
            return;
          }

          recordSeen(item.id);
          setSelectedLostPostForCard(null);
          setSelectedSighting(item);
          map.panTo(marker.getPosition());
        },
      });
    },
    [
      getImageUrl,
      isAuthenticated,
      setSelectedSighting,
      setSelectedLostPostForCard,
      recordSeen,
    ]
  );

  /**
   * 클러스터 데이터 가져오기
   */
  const fetchClusters = useCallback(async () => {
    if (!mapInstanceRef.current) return;
    if (isAuthLoading) return;

    const bounds = mapInstanceRef.current.getBounds();
    const zoom = mapInstanceRef.current.getZoom();
    const sw = bounds.getSW();
    const ne = bounds.getNE();

    await loadViewport(
      {
        minLat: sw.lat(),
        minLng: sw.lng(),
        maxLat: ne.lat(),
        maxLng: ne.lng(),
      },
      zoom
    );
  }, [isAuthLoading, loadViewport]);

  /**
   * 지도의 idle 이벤트 핸들러 (이동/줌 완료 시 발생). 북마크 레이어는 뷰포트 무관 전체 데이터라 재요청 안 함.
   */
  const handleMapIdle = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (mapLayerRef.current === "bookmark") return;
      fetchClusters();
    }, 300);
  }, [fetchClusters]);

  /** 7-5: 북마크 버튼에 사용할 유실글 ID (URL 기준 또는 내 유실글 1개 또는 선택값) */
  /** 7-5: 북마크 모달 열려 있을 때 Escape로 닫기 */
  useEffect(() => {
    if (!bookmarkModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBookmarkModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookmarkModalOpen]);

  /**
   * 지도 초기화 함수 (싱글톤 — 한 번만 생성)
   */
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.naver?.maps || mapInstanceRef.current)
      return;

    try {
      const center = initialCenter ?? DEFAULT_MAP_CENTER;
      const mapOptions = {
        center: new window.naver.maps.LatLng(center.lat, center.lng),
        zoom: initialCenter ? 16 : DEFAULT_MAP_WARM_ZOOM,
        zoomControl: false,
      };

      const adapter = createNaverMapAdapter(window.naver.maps);
      mapAdapterRef.current = adapter;
      mapInstanceRef.current = adapter.createMap(mapRef.current, mapOptions);
      mapLayerRendererRef.current = createMapLayerRenderer({
        adapter,
        scheduler: createBrowserAnimationScheduler(),
        toLatLng: ({ lat, lng }) => new window.naver.maps.LatLng(lat, lng),
        toPoint: (x, y) => new window.naver.maps.Point(x, y),
        normalizeId: normalizeSightingId,
        getPathCoordinates: getBookmarkPathCoordinates,
        interpolatePath,
      });

      adapter.listen(mapInstanceRef.current, "idle", handleMapIdle);

      adapter.listen(mapInstanceRef.current, "click", () => {
        setSelectedSighting(null);
      });

      setIsLoaded(true);

      if (!initialCenter && !initialCenterSightingId) {
        handleCurrentLocation();
      }
    } catch (err) {
      console.error("Naver Map Init Error:", err);
      setError("지도를 초기화하는 중 오류가 발생했습니다.");
    }
  }, [
    handleMapIdle,
    handleCurrentLocation,
    initialCenter,
    initialCenterSightingId,
  ]);

  // Keep the latest initMap without re-running the mount bootstrap whenever
  // idle/geolocation callbacks change identity (which would otherwise race
  // Strict Mode remounts and leave isLoaded stuck on false).
  const initMapRef = useRef(initMap);
  initMapRef.current = initMap;

  // Script may already be cached after tab navigation, so onLoad might not
  // re-fire. Retry until the Maps API + container are ready, then dispose once.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryInit = () => {
      if (cancelled || mapInstanceRef.current) return;
      initMapRef.current();
      if (mapInstanceRef.current || attempts >= 50) return;
      attempts += 1;
      retryTimer = setTimeout(tryInit, 100);
    };

    tryInit();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      mapLayerRendererRef.current?.dispose();
      mapLayerRendererRef.current = null;
      mapAdapterRef.current?.dispose();
      mapAdapterRef.current = null;
      mapInstanceRef.current = null;
      myLocationMarkerRef.current = null;
    };
  }, []);

  // initialCenter / initialCenterSightingId 변경 시 중심 이동 허용
  useEffect(() => {
    hasCenteredSightingRef.current = false;
  }, [initialCenter, initialCenterSightingId]);
  // initialFocusSightingId 변경 시 자동 포커스 리셋
  useEffect(() => {
    hasAutoFocusedRef.current = false;
  }, [initialFocusSightingId]);

  // 7-5: 지도에서 제보 링크로 진입 시 "본 적 있음" 기록
  useEffect(() => {
    if (!initialFocusSightingId || !accessToken) return;
    fetch("/api/v1/me/sighting-views", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sightingId: initialFocusSightingId }),
    }).catch(() => {});
  }, [initialFocusSightingId, accessToken]);

  // 추천 "지도에서 보기" 진입 시(initialCenter+initialFocusSightingId): 클러스터 대기 없이 상세 조회로 카드 바로 열기
  useEffect(() => {
    if (
      !initialFocusSightingId ||
      !initialCenter ||
      hasAutoFocusedRef.current ||
      !accessToken
    )
      return;
    hasAutoFocusedRef.current = true;
    fetch(
      `/api/v1/auth/sightings/${encodeURIComponent(initialFocusSightingId)}`,
      {
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          const d = json.data as Record<string, unknown>;
          setSelectedSighting({
            id: d.id as string,
            lat: initialCenter.lat,
            lng: initialCenter.lng,
            type: "point",
            photo_keys: d.photo_keys as string[] | undefined,
            occurred_at: d.occurred_at as string | undefined,
            author_type: d.author_type as "anon" | "user" | undefined,
            trait_color: d.trait_color as string | undefined,
            trait_size: d.trait_size as string | undefined,
            trait_species: d.trait_species as string | undefined,
            note: d.note as string | undefined,
          });
        }
      })
      .catch(() => {});
  }, [initialFocusSightingId, initialCenter, accessToken]);

  // 마커 로드 후 해당 제보 상세 카드를 기본으로 열기 (lat/lng 없이 sightingId만 있을 때)
  useEffect(() => {
    if (
      !initialFocusSightingId ||
      hasAutoFocusedRef.current ||
      itemsInView.length === 0 ||
      initialCenter
    )
      return;
    const wantId = normalizeSightingId(initialFocusSightingId);
    const point = itemsInView.find(
      (item): item is MapItem & { type: "point"; id: string } =>
        item.type === "point" &&
        "id" in item &&
        typeof item.id === "string" &&
        normalizeSightingId(item.id) === wantId
    );
    if (point) {
      const frameId = requestAnimationFrame(() => {
        setSelectedSighting(point);
        hasAutoFocusedRef.current = true;
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [initialFocusSightingId, initialCenter, itemsInView]);

  // initialCenter가 URL 등으로 바뀌면 기존 맵 인스턴스만 pan (추가 API 없음)
  useEffect(() => {
    if (!initialCenter || !mapInstanceRef.current || !window.naver?.maps)
      return;
    const center = new window.naver.maps.LatLng(
      initialCenter.lat,
      initialCenter.lng
    );
    mapInstanceRef.current.panTo(center);
    mapInstanceRef.current.setZoom(16);
  }, [initialCenter]);

  // 폴백: lat/lng 없이 제보 ID만 있을 때 단건 조회 후 중심 이동
  useEffect(() => {
    if (
      !isLoaded ||
      !initialCenterSightingId ||
      !mapInstanceRef.current ||
      !window.naver?.maps ||
      hasCenteredSightingRef.current
    )
      return;

    const mapRef = mapInstanceRef.current;
    const headers: HeadersInit = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    fetch(`/api/v1/me/sightings/${initialCenterSightingId}`, {
      credentials: "include",
      headers,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (
          json?.success &&
          json?.data?.lat != null &&
          json?.data?.lng != null &&
          mapRef
        ) {
          const { lat, lng } = json.data;
          const center = new window.naver.maps.LatLng(lat, lng);
          // 지도가 완전히 준비된 뒤 이동 (한 프레임 대기)
          requestAnimationFrame(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo(center);
              mapInstanceRef.current.setZoom(16);
              hasCenteredSightingRef.current = true;
            }
          });
        }
      })
      .catch(() => {});
  }, [isLoaded, initialCenterSightingId, accessToken]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 인증/로드 상태 변경 시 마커·클러스터 재요청 (북마크 레이어는 fetchBookmarkLayerData로 별도 처리)
  useEffect(() => {
    if (
      mapInstanceRef.current &&
      isLoaded &&
      mapLayerRef.current !== "bookmark"
    ) {
      fetchClusters();
    }
  }, [isAuthenticated, isAuthLoading, fetchClusters, isLoaded]);

  useEffect(() => {
    if (!isLoaded || mapLayer === "bookmark") return;
    renderClusters(itemsInView, sightingFeedbackMap);
  }, [isLoaded, itemsInView, mapLayer, renderClusters, sightingFeedbackMap]);

  // 북마크에서 일반 레이어로 돌아올 때 현재 viewport를 다시 조회한다.
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const prev = prevMapLayerRef.current;
    prevMapLayerRef.current = mapLayer;

    if (mapLayer !== "bookmark" && prev === "bookmark") fetchClusters();
  }, [mapLayer, isLoaded, fetchClusters]);

  // "내 유실글 + 북마크" 레이어 선택 시 유실글·경로 한 번에 조회 (동시 표시)
  useEffect(() => {
    if (mapLayer !== "bookmark" || !isAuthenticated || !accessToken) return;
    fetchBookmarkLayerData();
  }, [mapLayer, isAuthenticated, accessToken, fetchBookmarkLayerData]);

  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !mapLayerRendererRef.current)
      return;

    const renderer = mapLayerRendererRef.current;
    renderer.renderPaths({
      map: mapInstanceRef.current,
      paths: pathData,
      enabled: mapLayer === "bookmark",
    });
    return () => renderer.clearPaths();
  }, [isLoaded, mapLayer, pathData]);

  // 북마크 레이어: pathData에서 제보(북마크) 마커만 그리기 (뷰포트/클러스터 없음, 유실글·선과 동시 표시)
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLayerRendererRef.current) return;
    // default/unseen 레이어에서는 이 effect가 빈 paths로 sightings 그룹을
    // 비우면 클러스터/포인트 마커가 바로 사라진다.
    if (mapLayer !== "bookmark") return;

    const renderer = mapLayerRendererRef.current;
    const activeMap = mapInstanceRef.current;

    renderer.renderBookmarkSightings({
      map: activeMap,
      paths: pathData,
      getImageUrl,
      onSightingClick(item, marker) {
        if (item.type !== "point") return;
        recordSeen(item.id);
        setSelectedLostPostForCard(null);
        setSelectedSighting(item);
        activeMap.panTo(marker.getPosition());
      },
    });
  }, [
    mapLayer,
    pathData,
    getImageUrl,
    recordSeen,
    setSelectedSighting,
    setSelectedLostPostForCard,
  ]);

  // 북마크 레이어일 때만 유실글 마커 표시, 해제 시 제거
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLayerRendererRef.current) return;

    const renderer = mapLayerRendererRef.current;
    const activeMap = mapInstanceRef.current;

    renderer.renderLostPosts({
      map: activeMap,
      lostPosts: mapLayer === "bookmark" ? lostPostsForMap : [],
      getImageUrl: getLostPostImageUrl,
      onLostPostClick(lostPost, marker) {
        activeMap.panTo(marker.getPosition());
        setSelectedSighting(null);
        setSelectedLostPostForCard(lostPost);
      },
    });
  }, [mapLayer, lostPostsForMap, getLostPostImageUrl]);

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
        onReady={initMap}
      />

      <div className="bg-surface relative h-full w-full">
        <div ref={mapRef} className="h-full w-full" />

        {/* 상세 카드 열렸을 때 지도 영역 음영 (클릭 시 카드 닫기) */}
        {(selectedSighting?.type === "point" || selectedLostPostForCard) && (
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={() => {
              setSelectedSighting(null);
              setSelectedLostPostForCard(null);
            }}
            className="absolute inset-0 z-40 bg-black/30 transition-opacity duration-200"
          />
        )}

        {/* 유실글 카드 (제보 카드와 동일 레이아웃: 사진 + 정보) */}
        {selectedLostPostForCard && (
          <div
            className="animate-in slide-in-from-bottom-6 absolute inset-x-0 bottom-[104px] z-50 flex justify-center px-4 duration-300 sm:px-6"
            onMouseDown={stopPropagation}
            onMouseUp={stopPropagation}
            onMouseMove={stopPropagation}
            onTouchStart={stopPropagation}
            onTouchMove={stopPropagation}
            onTouchEnd={stopPropagation}
            onWheel={stopPropagation}
          >
            <div className="bg-surface relative mx-auto w-full max-w-md overflow-hidden rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/10">
              <button
                onClick={() => setSelectedLostPostForCard(null)}
                className="absolute top-3 right-3 z-30 rounded-full bg-black/25 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/40"
                aria-label="닫기"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <div className="max-h-[min(70vh,640px)] overflow-y-auto">
                <div className="flex flex-col">
                  {/* 유실글 대표 사진 영역 — 항상 표시(없으면 플레이스홀더) */}
                  <div className="relative aspect-[4/3] w-full max-h-56 overflow-hidden bg-gray-100 sm:max-h-64 dark:bg-gray-800">
                    {selectedLostPostForCard.cover_photo_key ? (
                      <>
                        <Image
                          src={getLostPostImageUrl(
                            selectedLostPostForCard.cover_photo_key
                          )}
                          alt="유실글 대표 사진"
                          fill
                          sizes="(max-width: 768px) 100vw, 28rem"
                          className="object-cover"
                          priority
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400 dark:text-gray-500">
                        <svg
                          className="h-16 w-16"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="sr-only">대표 사진 없음</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
                    <div>
                      <Text
                        variant="title"
                        className="text-lg font-bold text-amber-600 sm:text-xl dark:text-amber-400"
                      >
                        유실글
                      </Text>
                      <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                        {selectedLostPostForCard.pet_name?.trim() ||
                          "이름 없음"}
                      </p>
                      {selectedLostPostForCard.lost_at && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          유실일:{" "}
                          {new Date(
                            selectedLostPostForCard.lost_at
                          ).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                    {(selectedLostPostForCard.trait_color ||
                      selectedLostPostForCard.trait_size ||
                      selectedLostPostForCard.trait_species) && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedLostPostForCard.trait_color && (
                          <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            {selectedLostPostForCard.trait_color}
                          </span>
                        )}
                        {selectedLostPostForCard.trait_size && (
                          <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {selectedLostPostForCard.trait_size}
                          </span>
                        )}
                        {selectedLostPostForCard.trait_species && (
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                            {selectedLostPostForCard.trait_species}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedLostPostForCard.note?.trim() && (
                      <p className="text-sm break-words text-gray-600 dark:text-gray-400">
                        {selectedLostPostForCard.note}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 제보 상세 정보 카드 (공통 SightingDetailSheet + SightingDetailCard) */}
        {selectedSighting && selectedSighting.type === "point" && (
          <SightingDetailSheet bottomOffset={104}>
            <SightingDetailCard
              sighting={selectedSighting as SightingDetailData}
              getImageUrl={getImageUrl}
              onClose={() => setSelectedSighting(null)}
              rightSlot={
                isAuthenticated &&
                accessToken &&
                "id" in selectedSighting &&
                myLostPosts.length > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const sid = selectedSighting.id as string;
                      const isClaimed =
                        sightingFeedbackMap[normalizeSightingId(sid)]?.claimed;
                      if (isClaimed) {
                        setBookmarkModalMode("unregister");
                        setBookmarkModalOpen(true);
                        setClaimedLostPostsForSighting(null);
                        fetch(
                          `/api/v1/me/sighting-claims/${encodeURIComponent(sid)}`,
                          {
                            credentials: "include",
                            headers: {
                              Authorization: `Bearer ${accessToken}`,
                            },
                          }
                        )
                          .then((r) => r.json())
                          .then((res) => {
                            if (
                              res?.success &&
                              Array.isArray(res.data?.lostPosts)
                            ) {
                              setClaimedLostPostsForSighting(
                                res.data.lostPosts
                              );
                            } else {
                              setClaimedLostPostsForSighting([]);
                            }
                          })
                          .catch(() => setClaimedLostPostsForSighting([]));
                      } else {
                        setBookmarkModalMode("register");
                        setClaimedLostPostsForSighting(null);
                        setBookmarkModalOpen(true);
                      }
                    }}
                    className="shrink-0 rounded-full p-2 transition-transform active:scale-95"
                    aria-label={
                      sightingFeedbackMap[
                        normalizeSightingId(selectedSighting.id as string)
                      ]?.claimed
                        ? "북마크 해제"
                        : "북마크 등록"
                    }
                  >
                    {sightingFeedbackMap[
                      normalizeSightingId(selectedSighting.id as string)
                    ]?.claimed ? (
                      <svg
                        className="h-8 w-8 text-yellow-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ) : (
                      <svg
                        className="h-8 w-8 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 20.27 12 17.77 5.82 20.27 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    )}
                  </button>
                ) : undefined
              }
            />
          </SightingDetailSheet>
        )}

        {/* 7-5: 북마크 등록/해제 — 유실글 선택 모달 */}
        {bookmarkModalOpen &&
          selectedSighting &&
          "id" in selectedSighting &&
          accessToken && (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
              onClick={() => {
                setBookmarkModalOpen(false);
                setClaimedLostPostsForSighting(null);
              }}
              role="dialog"
              aria-modal="true"
              aria-label="유실글 선택"
            >
              <div
                className="bg-surface flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-gray-200 shadow-xl dark:border-gray-700"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-border-subtle flex items-center justify-between border-b px-6 py-5">
                  <Text variant="title" className="text-lg">
                    {bookmarkModalMode === "unregister"
                      ? "해제할 대상을 선택하세요"
                      : "등록할 대상을 선택하세요"}
                  </Text>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    onClick={() => {
                      setBookmarkModalOpen(false);
                      setClaimedLostPostsForSighting(null);
                    }}
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {bookmarkModalMode === "unregister" ? (
                    <ul className="flex flex-col gap-3">
                      {claimedLostPostsForSighting === null ? (
                        <li className="py-4 text-center text-gray-500 dark:text-gray-400">
                          불러오는 중…
                        </li>
                      ) : claimedLostPostsForSighting.length === 0 ? (
                        <li className="py-4 text-center text-gray-500 dark:text-gray-400">
                          이 제보를 북마크한 유실글이 없습니다.
                        </li>
                      ) : (
                        claimedLostPostsForSighting.map((p) => (
                          <li key={p.id}>
                            <div className="bg-muted/50 hover:bg-muted flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 px-5 py-4 dark:border-gray-600 dark:hover:bg-gray-700/50">
                              <span className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="text-xl">🐕</span>
                                <span className="text-base font-medium text-gray-800 dark:text-gray-200">
                                  <span className="text-gray-500 dark:text-gray-400">
                                    강아지 이름{" "}
                                  </span>
                                  {p.pet_name?.trim() || "미입력"}
                                  {p.lost_at ? (
                                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                                      ·{" "}
                                      {new Date(p.lost_at).toLocaleDateString(
                                        "ko-KR",
                                        {
                                          timeZone: "Asia/Seoul",
                                        }
                                      )}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="text-primary hover:bg-primary/10 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
                                onClick={async () => {
                                  const sid = selectedSighting.id as string;
                                  const previousClaimed =
                                    sightingFeedbackMap[
                                      normalizeSightingId(sid)
                                    ]?.claimed ?? false;
                                  const previousList =
                                    claimedLostPostsForSighting;

                                  // Optimistic: update star + close modal first.
                                  setClaimedLostPostsForSighting((prev) =>
                                    prev
                                      ? prev.filter((x) => x.id !== p.id)
                                      : []
                                  );
                                  const remaining =
                                    (previousList?.length ?? 1) - 1;
                                  if (remaining <= 0) {
                                    patchFeedback(sid, { claimed: false });
                                  }
                                  setBookmarkModalOpen(false);
                                  setClaimedLostPostsForSighting(null);
                                  setToast({
                                    message: "북마크를 해제했습니다.",
                                    type: "success",
                                  });

                                  try {
                                    const res = await fetch(
                                      `/api/v1/me/lost-posts/${encodeURIComponent(p.id)}/sighting-claims/${encodeURIComponent(sid)}`,
                                      {
                                        method: "DELETE",
                                        credentials: "include",
                                        headers: {
                                          Authorization: `Bearer ${accessToken}`,
                                        },
                                      }
                                    );
                                    const data = await res.json().catch(() => null);
                                    if (!res.ok || !data?.success) {
                                      patchFeedback(sid, {
                                        claimed: previousClaimed,
                                      });
                                      setClaimedLostPostsForSighting(
                                        previousList
                                      );
                                      setToast({
                                        message:
                                          data?.error?.message ??
                                          "북마크 해제에 실패했습니다.",
                                        type: "error",
                                      });
                                      if (mapLayer === "bookmark") {
                                        void fetchBookmarkLayerData();
                                      }
                                      return;
                                    }
                                    // Refetch after mutation succeeds so paths/markers match DB.
                                    if (mapLayer === "bookmark") {
                                      void fetchBookmarkLayerData();
                                    }
                                  } catch {
                                    patchFeedback(sid, {
                                      claimed: previousClaimed,
                                    });
                                    setClaimedLostPostsForSighting(
                                      previousList
                                    );
                                    setToast({
                                      message: "북마크 해제에 실패했습니다.",
                                      type: "error",
                                    });
                                    if (mapLayer === "bookmark") {
                                      void fetchBookmarkLayerData();
                                    }
                                  }
                                }}
                              >
                                해제
                              </button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {(() => {
                        const registerableLostPosts = myLostPosts.filter(
                          (p) => {
                            const sightingOccurredAt =
                              selectedSighting &&
                              "occurred_at" in selectedSighting
                                ? selectedSighting.occurred_at
                                : null;
                            if (!sightingOccurredAt || !p.lost_at) return true;
                            return (
                              new Date(p.lost_at).getTime() <=
                              new Date(sightingOccurredAt).getTime()
                            );
                          }
                        );
                        if (registerableLostPosts.length === 0) {
                          return (
                            <li className="py-4 text-center text-gray-500 dark:text-gray-400">
                              조회 가능한 유실글이 없습니다.
                            </li>
                          );
                        }
                        return registerableLostPosts.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="bg-muted/50 hover:bg-muted flex w-full items-center gap-4 rounded-xl border border-gray-200 px-5 py-4 text-left transition-colors dark:border-gray-600 dark:hover:bg-gray-700/50"
                              onClick={async () => {
                                const sid = selectedSighting.id as string;
                                const switchToBookmark =
                                  mapLayer !== "bookmark";

                                // Optimistic: fill star and close modal immediately.
                                patchFeedback(sid, { claimed: true });
                                setBookmarkModalOpen(false);
                                setClaimedLostPostsForSighting(null);
                                if (switchToBookmark) {
                                  setMapLayer("bookmark");
                                }
                                setToast({
                                  message:
                                    "북마크에 등록했습니다. 이동 경로 애니메이션을 표시합니다.",
                                  type: "success",
                                });

                                try {
                                  const res = await fetch(
                                    `/api/v1/me/lost-posts/${p.id}/sighting-claims`,
                                    {
                                      method: "POST",
                                      credentials: "include",
                                      headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${accessToken}`,
                                      },
                                      body: JSON.stringify({
                                        sightingId: sid,
                                      }),
                                    }
                                  );
                                  const json = (await res
                                    .json()
                                    .catch(() => null)) as {
                                    success?: boolean;
                                    error?: { message?: string };
                                  } | null;
                                  if (!res.ok || !json?.success) {
                                    patchFeedback(sid, { claimed: false });
                                    setToast({
                                      message:
                                        json?.error?.message ??
                                        "북마크 등록에 실패했습니다.",
                                      type: "error",
                                    });
                                    // Layer may already be bookmark; resync to drop optimistic state.
                                    void fetchBookmarkLayerData();
                                    return;
                                  }
                                  // Always refetch after success — layer switch effect can race before POST.
                                  void fetchBookmarkLayerData();
                                } catch {
                                  patchFeedback(sid, { claimed: false });
                                  setToast({
                                    message: "북마크 등록에 실패했습니다.",
                                    type: "error",
                                  });
                                  void fetchBookmarkLayerData();
                                }
                              }}
                            >
                              <span className="text-xl">🐕</span>
                              <span className="text-base font-medium text-gray-800 dark:text-gray-200">
                                <span className="text-gray-500 dark:text-gray-400">
                                  강아지 이름{" "}
                                </span>
                                {p.pet_name?.trim() || "미입력"}
                                {p.lost_at ? (
                                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                                    ·{" "}
                                    {new Date(p.lost_at).toLocaleDateString(
                                      "ko-KR",
                                      {
                                        timeZone: "Asia/Seoul",
                                      }
                                    )}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ));
                      })()}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* 목록 보기 하단 시트 */}
        {isAuthenticated && isListViewOpen && (
          <div
            className="animate-in fade-in fixed inset-0 z-[110] flex flex-col justify-end bg-black/40 backdrop-blur-sm transition-all duration-300"
            onMouseDown={stopPropagation}
            onMouseUp={stopPropagation}
            onMouseMove={stopPropagation}
            onTouchStart={stopPropagation}
            onTouchMove={stopPropagation}
            onTouchEnd={stopPropagation}
            onWheel={stopPropagation}
          >
            <div
              className="absolute inset-0"
              onClick={() => setIsListViewOpen(false)}
            />
            <div className="bg-surface animate-in slide-in-from-bottom-full relative flex max-h-[85vh] w-full flex-col rounded-t-[32px] shadow-2xl duration-500">
              <div className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Text variant="title" className="text-2xl">
                      제보 목록
                    </Text>
                    <span className="bg-primary/10 text-primary rounded-full px-3 py-0.5 text-sm font-bold">
                      {itemsInView.filter((i) => i.type === "point").length}건
                    </span>
                  </div>
                  <Text variant="caption" color="caption">
                    현재 화면에 보이는 제보 정보입니다.
                  </Text>
                </div>
                <button
                  onClick={() => setIsListViewOpen(false)}
                  className="bg-muted rounded-full p-2 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-10">
                {itemsInView.filter((i) => i.type === "point").length === 0 ? (
                  <div className="flex h-60 flex-col items-center justify-center space-y-4 text-center">
                    <div className="rounded-full bg-gray-100 p-6 dark:bg-gray-800">
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-gray-400"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <Text variant="body" color="caption" className="text-lg">
                      상세 정보가 있는 제보가 없습니다.
                      <br />
                      지도를 확대하여 개별 핀을 확인해주세요.
                    </Text>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {itemsInView
                      .filter((i) => i.type === "point")
                      .map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedSighting(item);
                            setIsListViewOpen(false);
                            if (mapInstanceRef.current) {
                              mapInstanceRef.current.panTo(
                                new window.naver.maps.LatLng(item.lat, item.lng)
                              );
                            }
                          }}
                          className="bg-muted/50 hover:bg-muted group flex gap-4 rounded-3xl p-4 transition-all active:scale-[0.98]"
                        >
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-200">
                            {item.photo_keys?.[0] ? (
                              <Image
                                src={getImageUrl(item.photo_keys[0])}
                                alt="Sighting"
                                fill
                                className="object-cover transition-transform group-hover:scale-110"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-400">
                                <svg
                                  width="24"
                                  height="24"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="3"
                                    y="3"
                                    width="18"
                                    height="18"
                                    rx="2"
                                    ry="2"
                                  ></rect>
                                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                  <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                            <div>
                              <div className="mb-0.5 flex items-center justify-between">
                                <Text className="truncate font-bold">
                                  {item.author_type === "anon"
                                    ? "익명 제보자"
                                    : "회원 제보"}
                                </Text>
                                <Text
                                  variant="caption"
                                  color="caption"
                                  className="shrink-0 text-[10px]"
                                >
                                  {item.occurred_at
                                    ? new Date(
                                        item.occurred_at
                                      ).toLocaleDateString("ko-KR", {
                                        timeZone: "Asia/Seoul",
                                      })
                                    : "날짜 정보 없음"}
                                </Text>
                              </div>
                              <Text
                                variant="caption"
                                className="mb-2 line-clamp-1 text-xs opacity-70"
                              >
                                {item.note || "상세 설명 없음"}
                              </Text>
                            </div>
                            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                              {item.trait_color && (
                                <span className="bg-primary/10 text-primary rounded-lg px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                                  {item.trait_color}
                                </span>
                              )}
                              {item.trait_size && (
                                <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-gray-500 dark:bg-gray-800">
                                  {item.trait_size}
                                </span>
                              )}
                              {item.trait_species && (
                                <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  {item.trait_species}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 하단 컨트롤러 */}
        <div className="absolute right-5 bottom-24 z-10 flex flex-col gap-3">
          {/* 레이어 필터 (로그인 시에만) */}
          {isAuthenticated && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setLayerMenuOpen((o) => !o)}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-xl transition-transform active:scale-95 ${
                  mapLayer !== "default"
                    ? "bg-primary text-white"
                    : "bg-white dark:bg-gray-800"
                }`}
                aria-expanded={layerMenuOpen}
                aria-haspopup="true"
                aria-label="표시 레이어 선택"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                </svg>
              </button>
              {layerMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[5]"
                    aria-hidden="true"
                    onClick={() => setLayerMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 bottom-full z-10 mb-2 w-52 rounded-2xl border border-gray-200 bg-white py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
                    role="menu"
                  >
                    {(
                      [
                        { value: "default" as MapLayer, label: "전체" },
                        { value: "unseen" as MapLayer, label: "안 본 제보" },
                        {
                          value: "bookmark" as MapLayer,
                          label: "내 유실글 + 이동 경로",
                        },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={mapLayer === value}
                        onClick={() => {
                          setMapLayer(value);
                          setLayerMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {mapLayer === value && (
                          <span className="text-primary">●</span>
                        )}
                        <span
                          className={
                            mapLayer === value
                              ? "font-semibold text-gray-900 dark:text-white"
                              : "text-gray-600 dark:text-gray-300"
                          }
                        >
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 목록 보기 버튼 — 로그인 사용자만 (게스트는 point 상세가 없음) */}
          {isAuthenticated && (
            <button
              onClick={() => setIsListViewOpen(true)}
              className="bg-primary flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-xl transition-transform active:scale-95"
              aria-label="제보 목록 보기"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
          )}

          {/* 현재 위치 버튼 */}
          <button
            onClick={handleCurrentLocation}
            disabled={isLocating}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xl transition-transform active:scale-95 disabled:opacity-50 dark:bg-gray-800"
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
        </div>

        {/* 로딩 오버레이 */}
        {!isLoaded && (
          <div className="bg-surface/50 absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loading />
            <Text variant="caption" className="mt-2">
              지도를 준비 중입니다...
            </Text>
          </div>
        )}

        {/* 지도 상태: 로딩/실패를 같은 상단 토스트 결로 표시 */}
        {toast ? (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        ) : mapDataLoading ? (
          <Toast
            message={
              itemsInView.length > 0 || lostPostsForMap.length > 0
                ? "지도 업데이트 중..."
                : "제보 불러오는 중..."
            }
            type="loading"
          />
        ) : mapDataError ? (
          <Toast message={mapDataError} type="error" onClose={resetMapData} />
        ) : null}
      </div>
    </>
  );
}
