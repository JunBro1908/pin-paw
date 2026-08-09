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
import { MapDetailSheet, trapDialogTab } from "./MapDetailSheet";
import { MapLegend } from "./MapLegend";
import { MapToolbar } from "./MapToolbar";
import type { LostPostMapItem } from "../lib/map-data-state";
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
  buildFocusedSightingFromDetail,
  DEEP_LINK_FOCUS_ZOOM,
  resolveDeepLinkCenter,
  type SightingDetailPayload,
} from "../lib/map-deep-link-focus";
import {
  createNaverMapAdapter,
  type NaverMapAdapter,
} from "../lib/naver-map-adapter";
import {
  createBrowserAnimationScheduler,
  createMapLayerRenderer,
  type MapLayerRenderer,
} from "../lib/map-layer-renderer";
import {
  getMapMarkerPresentation,
  getSightingPinStatusColor,
} from "../lib/map-marker-presentation";
import { useMapData } from "../hooks/use-map-data";
import {
  getCachedUserMapCenter,
  setCachedUserMapCenter,
  warmUserMapCenter,
} from "../lib/map-user-center-cache";

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

type PendingDeepLinkFocus = {
  center: { lat: number; lng: number };
  sighting: MapItem;
};

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
  /** Detail and map movement complete together once the SDK map is available. */
  const pendingDeepLinkFocusRef = useRef<PendingDeepLinkFocus | null>(null);
  const isAuthenticated = Boolean(accessToken);

  // 맵 인스턴스와 마커를 ref로 관리하여 리렌더링 시에도 유지
  const mapInstanceRef = useRef<NaverMapInstance>(null);
  const mapAdapterRef = useRef<NaverMapAdapter>(null);
  const mapLayerRendererRef = useRef<MapLayerRenderer>(null);
  const myLocationMarkerRef = useRef<NaverMarkerInstance>(null);
  /** 경로 선이 '내 위치'로 연결되지 않도록, 마지막으로 아는 현재 위치 저장 */
  const lastMyPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  /** 사용자가 지도를 직접 움직이면 자동 위치 이동을 덮어쓰지 않음 */
  const userMovedMapRef = useRef(false);
  const autoLocateAttemptedRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const applyPendingDeepLinkFocus = useCallback(() => {
    const pending = pendingDeepLinkFocusRef.current;
    if (!pending || !mapInstanceRef.current || !window.naver?.maps) {
      return false;
    }

    const latLng = new window.naver.maps.LatLng(
      pending.center.lat,
      pending.center.lng
    );
    mapInstanceRef.current.panTo(latLng);
    mapInstanceRef.current.setZoom(DEEP_LINK_FOCUS_ZOOM);
    setSelectedSighting(pending.sighting);
    hasAutoFocusedRef.current = true;
    hasCenteredSightingRef.current = true;
    pendingDeepLinkFocusRef.current = null;
    return true;
  }, []);

  const queueDeepLinkFocus = useCallback(
    (center: { lat: number; lng: number }, sighting: MapItem) => {
      pendingDeepLinkFocusRef.current = { center, sighting };
      return applyPendingDeepLinkFocus();
    },
    [applyPendingDeepLinkFocus]
  );

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
  const bookmarkDialogRef = useRef<HTMLDivElement>(null);
  const bookmarkCloseButtonRef = useRef<HTMLButtonElement>(null);
  const bookmarkOpenerRef = useRef<HTMLElement | null>(null);
  const closeBookmarkModal = useCallback(() => {
    setBookmarkModalOpen(false);
    setClaimedLostPostsForSighting(null);
  }, []);

  /** 지도 마커 레이어 필터 (전체 / 안 본 것 / 북마크) — localStorage로 유지.
   * 추천 「지도에서 보기」진입 시에는 북마크/신규 레이어면 제보가 안 보이므로 ALL로 강제. */
  const [mapLayer, setMapLayer] = useState<MapLayer>(() => {
    if (initialFocusSightingId) {
      writeStoredMapLayer("default");
      return "default";
    }
    return readStoredMapLayer();
  });
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
  // Guests cannot use unseen/bookmark; restore public clusters after logout.
  if (!isAuthLoading) {
    const nextLayer = resolveMapLayerForSession(mapLayer, isAuthenticated);
    if (nextLayer !== mapLayer) {
      setMapLayer(nextLayer);
    }
  }

  /** fetchClusters가 mapLayer에 의존하지 않도록 ref 사용 → 레이어 변경 시 지도 인스턴스/불필요 재요청 방지 */
  const mapLayerRef = useRef<MapLayer>(mapLayer);
  const prevMapLayerRef = useRef<MapLayer>(mapLayer);
  useEffect(() => {
    mapLayerRef.current = mapLayer;
    writeStoredMapLayer(mapLayer);
  }, [mapLayer]);

  /** 유실글 마커 터치 시 카드용 (제보 카드와 별도) */
  const [selectedLostPostForCard, setSelectedLostPostForCard] =
    useState<LostPostMapItem | null>(null);

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
   * 현재 위치 찾기 및 지도 이동 (locate 버튼 — 실패 시 toast)
   */
  const placeMyLocationMarker = useCallback(
    (latitude: number, longitude: number) => {
      if (!window.naver?.maps || !mapInstanceRef.current) return;
      const currentLatLng = new window.naver.maps.LatLng(latitude, longitude);
      lastMyPositionRef.current = { lat: latitude, lng: longitude };
      setCachedUserMapCenter(latitude, longitude);

      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.setPosition(currentLatLng);
        return;
      }
      if (!mapAdapterRef.current) return;

      myLocationMarkerRef.current = mapAdapterRef.current.createMarker({
        position: currentLatLng,
        map: mapInstanceRef.current,
        zIndex: 300,
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
    },
    []
  );

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
      const currentLatLng = new window.naver.maps.LatLng(latitude, longitude);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(currentLatLng);
        mapInstanceRef.current.setZoom(16);
      }
      placeMyLocationMarker(latitude, longitude);
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
  }, [placeMyLocationMarker]);

  /**
   * Cache miss 시 한 번만 조용히 이동. 권한 거부/타임아웃은 toast 없이 기본 유지.
   * 사용자가 이미 지도를 움직였으면 덮어쓰지 않음.
   */
  const silentFollowUserLocation = useCallback(() => {
    if (autoLocateAttemptedRef.current) return;
    autoLocateAttemptedRef.current = true;

    void warmUserMapCenter().then((center) => {
      if (!center || !mapInstanceRef.current || !window.naver?.maps) return;
      if (userMovedMapRef.current) return;
      if (
        initialCenter ||
        initialCenterSightingId ||
        initialFocusSightingId ||
        pendingDeepLinkFocusRef.current ||
        hasAutoFocusedRef.current
      ) {
        return;
      }

      const latLng = new window.naver.maps.LatLng(center.lat, center.lng);
      if (typeof mapInstanceRef.current.morph === "function") {
        mapInstanceRef.current.morph(latLng, 15);
      } else {
        mapInstanceRef.current.panTo(latLng);
        mapInstanceRef.current.setZoom(15);
      }
      placeMyLocationMarker(center.lat, center.lng);
    });
  }, [
    initialCenter,
    initialCenterSightingId,
    initialFocusSightingId,
    placeMyLocationMarker,
  ]);

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
  /** 7-5: 북마크 모달이 열리면 하위 상세 시트 대신 키보드 포커스를 소유 */
  useEffect(() => {
    if (!bookmarkModalOpen) return;
    bookmarkOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    bookmarkCloseButtonRef.current?.focus();

    const handleBookmarkKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBookmarkModal();
        return;
      }
      const dialog = bookmarkDialogRef.current;
      if (dialog) trapDialogTab(event, dialog);
    };
    document.addEventListener("keydown", handleBookmarkKeyDown);
    return () => {
      document.removeEventListener("keydown", handleBookmarkKeyDown);
      bookmarkOpenerRef.current?.focus();
    };
  }, [bookmarkModalOpen, closeBookmarkModal]);

  /**
   * 지도 초기화 함수 (싱글톤 — 한 번만 생성)
   */
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.naver?.maps || mapInstanceRef.current)
      return;

    try {
      const warmedCenter = getCachedUserMapCenter();
      const deepLinkCenter =
        pendingDeepLinkFocusRef.current?.center ?? initialCenter ?? null;
      const center = deepLinkCenter ?? warmedCenter ?? DEFAULT_MAP_CENTER;
      const mapOptions = {
        center: new window.naver.maps.LatLng(center.lat, center.lng),
        zoom: deepLinkCenter
          ? DEEP_LINK_FOCUS_ZOOM
          : warmedCenter
            ? 15
            : DEFAULT_MAP_WARM_ZOOM,
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
        getMapMarkerPresentation,
        getSightingPinStatusColor,
      });

      adapter.listen(mapInstanceRef.current, "idle", handleMapIdle);

      adapter.listen(mapInstanceRef.current, "dragstart", () => {
        userMovedMapRef.current = true;
      });

      adapter.listen(mapInstanceRef.current, "click", () => {
        setSelectedSighting(null);
      });

      setIsLoaded(true);

      if (pendingDeepLinkFocusRef.current) {
        applyPendingDeepLinkFocus();
      } else if (warmedCenter && !initialCenter) {
        placeMyLocationMarker(warmedCenter.lat, warmedCenter.lng);
      } else if (!initialCenter && !initialCenterSightingId) {
        // Cache miss: keep Seoul (or default) until a quiet one-shot fix arrives.
        silentFollowUserLocation();
      }
    } catch (err) {
      console.error("Naver Map Init Error:", err);
      setError("지도를 초기화하는 중 오류가 발생했습니다.");
    }
  }, [
    handleMapIdle,
    silentFollowUserLocation,
    placeMyLocationMarker,
    applyPendingDeepLinkFocus,
    initialCenter,
    initialCenterSightingId,
  ]);

  // Keep the latest initMap without re-running the mount bootstrap whenever
  // idle/geolocation callbacks change identity (which would otherwise race
  // Strict Mode remounts and leave isLoaded stuck on false).
  const initMapRef = useRef(initMap);
  useEffect(() => {
    initMapRef.current = initMap;
  }, [initMap]);

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
    pendingDeepLinkFocusRef.current = null;
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

  // 추천 「지도에서 보기」: auth 상세로 시트 오픈 + 정밀 좌표 중앙 정렬.
  // URL lat/lng는 추천 approximate grid일 수 있으므로 detail.lat/lng를 우선한다.
  // hasAutoFocusedRef는 성공 후에만 잠가서 fetch 실패 시 viewport 폴백이 가능하다.
  useEffect(() => {
    if (
      !initialFocusSightingId ||
      isAuthLoading ||
      !accessToken ||
      hasAutoFocusedRef.current
    ) {
      return;
    }

    let cancelled = false;
    const focusId = initialFocusSightingId;
    const urlCenter = initialCenter ?? null;

    fetch(`/api/v1/auth/sightings/${encodeURIComponent(focusId)}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.success || !json?.data) return;
        const detail = json.data as SightingDetailPayload;
        const center = resolveDeepLinkCenter(detail, urlCenter);
        if (!center) return;
        const focused = buildFocusedSightingFromDetail(detail, center);
        if (!focused) return;
        queueDeepLinkFocus(center, focused);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    initialFocusSightingId,
    initialCenter,
    accessToken,
    isAuthLoading,
    queueDeepLinkFocus,
  ]);

  // URL lat/lng만으로 먼저 들어온 경우 맵이 준비되면 provisional pan (정밀 좌표로 덮어쓸 수 있음).
  // 추천 「지도에서 보기」는 sightingId만 전달하고 auth detail로 정밀 좌표를 받는다.
  useEffect(() => {
    if (
      initialFocusSightingId ||
      !initialCenter ||
      !mapInstanceRef.current ||
      !window.naver?.maps ||
      pendingDeepLinkFocusRef.current ||
      hasCenteredSightingRef.current
    ) {
      return;
    }
    const center = new window.naver.maps.LatLng(
      initialCenter.lat,
      initialCenter.lng
    );
    mapInstanceRef.current.panTo(center);
    mapInstanceRef.current.setZoom(DEEP_LINK_FOCUS_ZOOM);
  }, [initialCenter, isLoaded, initialFocusSightingId]);

  // 폴백: lat/lng 없이 제보 ID만 있을 때 — 소유 제보면 me API로 중심 이동
  // (추천 딥링크는 위 auth detail effect가 담당)
  useEffect(() => {
    if (
      !isLoaded ||
      !initialCenterSightingId ||
      initialFocusSightingId ||
      !mapInstanceRef.current ||
      !window.naver?.maps ||
      hasCenteredSightingRef.current
    )
      return;

    const mapRefCurrent = mapInstanceRef.current;
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
          mapRefCurrent
        ) {
          const { lat, lng } = json.data;
          const center = new window.naver.maps.LatLng(lat, lng);
          // 지도가 완전히 준비된 뒤 이동 (한 프레임 대기)
          requestAnimationFrame(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.panTo(center);
              mapInstanceRef.current.setZoom(DEEP_LINK_FOCUS_ZOOM);
              hasCenteredSightingRef.current = true;
            }
          });
        }
      })
      .catch(() => {});
  }, [isLoaded, initialCenterSightingId, initialFocusSightingId, accessToken]);

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

  // Own lost posts load on bookmark only; trail animation is bookmark-only.
  // Lost-post pins stay outside sighting clusters (separate marker group + zIndex).
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    if (mapLayer !== "bookmark") return;
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

  // 북마크 레이어에서만 내 유실글 마커 표시 (클러스터 그룹과 분리; ALL에는 없음)
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

  // ALL/New에서는 유실글 핀이 없으므로 시트 선택도 숨긴다.
  const activeLostPostForCard =
    mapLayer === "bookmark" ? selectedLostPostForCard : null;

  const mapDetailSelection = activeLostPostForCard
    ? ({ kind: "lost", item: activeLostPostForCard } as const)
    : selectedSighting?.type === "point"
      ? ({ kind: "sighting", item: selectedSighting } as const)
      : null;

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
        <MapLegend />

        {/* 상세 카드 열렸을 때 지도 영역 음영 (클릭 시 카드 닫기) */}
        {(selectedSighting?.type === "point" || activeLostPostForCard) && (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => {
              setSelectedSighting(null);
              setSelectedLostPostForCard(null);
            }}
            className="absolute inset-0 z-40 bg-black/30 transition-opacity duration-200"
          />
        )}

        {mapDetailSelection && (
          <MapDetailSheet
            selection={mapDetailSelection}
            keyboardActive={!bookmarkModalOpen}
            onClose={() => {
              setSelectedSighting(null);
              setSelectedLostPostForCard(null);
            }}
            getLostPostImageUrl={getLostPostImageUrl}
          >
            {selectedSighting?.type === "point" && (
              <SightingDetailCard
                sighting={selectedSighting as SightingDetailData}
                getImageUrl={getImageUrl}
                onClose={() => setSelectedSighting(null)}
                showCloseButton={false}
                className="!rounded-2xl !shadow-none !ring-0"
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
                          sightingFeedbackMap[normalizeSightingId(sid)]
                            ?.claimed;
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
                            .then((response) => response.json())
                            .then((result) => {
                              if (
                                result?.success &&
                                Array.isArray(result.data?.lostPosts)
                              ) {
                                setClaimedLostPostsForSighting(
                                  result.data.lostPosts
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
                      className="hover:bg-surface-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
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
                          aria-hidden="true"
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
                          aria-hidden="true"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 20.27 12 17.77 5.82 20.27 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      )}
                    </button>
                  ) : undefined
                }
              />
            )}
          </MapDetailSheet>
        )}

        {/* 7-5: 북마크 등록/해제 — 유실글 선택 모달 */}
        {bookmarkModalOpen &&
          selectedSighting &&
          "id" in selectedSighting &&
          accessToken && (
            <div
              ref={bookmarkDialogRef}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
              onClick={closeBookmarkModal}
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
                    ref={bookmarkCloseButtonRef}
                    type="button"
                    className="hover:bg-surface-soft flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300"
                    onClick={closeBookmarkModal}
                    aria-label="북마크 선택 닫기"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-6 [-webkit-overflow-scrolling:touch]">
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
                                  closeBookmarkModal();
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
                                    const data = await res
                                      .json()
                                      .catch(() => null);
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
                                closeBookmarkModal();
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
            <div className="bg-surface animate-in slide-in-from-bottom-full relative flex max-h-[min(calc(85vh-var(--bottom-nav-height)-env(safe-area-inset-bottom,0px)),36rem)] w-full flex-col rounded-t-[32px] pb-[env(safe-area-inset-bottom)] shadow-2xl duration-500">
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

              <div className="scrollable-sheet flex-1 overflow-y-auto overscroll-contain px-6 pb-10 [-webkit-overflow-scrolling:touch]">
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

        <MapToolbar
          layer={mapLayer}
          authenticated={isAuthenticated}
          listOpen={isListViewOpen}
          locating={isLocating}
          onLayerChange={setMapLayer}
          onLocate={handleCurrentLocation}
          onToggleList={() => setIsListViewOpen((open) => !open)}
        />

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
