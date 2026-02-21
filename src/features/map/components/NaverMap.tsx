"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { Loading } from "@/shared/ui/Loading";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";
import { Button } from "@/shared/ui/Button";
import Image from "next/image";
import { MapItem, ClusterResponse } from "../types/naver";
import {
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@/shared/lib/api-response";
import { createClient, supabase } from "@/shared/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SightingDetailCard } from "@/features/sightings/components/SightingDetailCard";
import type { SightingDetailData } from "@/features/sightings/components/SightingDetailCard";
import { SightingDetailSheet } from "@/features/sightings/components/SightingDetailSheet";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

/** 7-5: 지도 마커 테두리 색상용 피드백 (본/인정) */
export type SightingFeedbackMap = Record<
  string,
  { seen: boolean; claimed: boolean }
>;

/** UUID/ID 비교 시 대소문자·공백 통일 (API/DB 포맷 차이 대비) */
function normalizeSightingId(id: string): string {
  return String(id).toLowerCase().trim();
}

/** 지도 마커 레이어 필터 */
export type MapLayer =
  | "default" // 전체
  | "unseen" // 제보 중 안 본 것
  | "bookmark"; // 내 유실글 + 그 유실글에 해당하는 북마크

function getFilteredItems(
  rawItems: MapItem[],
  feedbackMap: SightingFeedbackMap,
  layer: MapLayer
): MapItem[] {
  if (layer === "default") return rawItems;
  return rawItems.filter((item) => {
    if (item.type !== "point" || !("id" in item)) return false;
    const n = normalizeSightingId(item.id as string);
    const fb = feedbackMap[n];
    switch (layer) {
      case "unseen":
        return fb ? !fb.seen : true; // 피드백 없으면 미확인으로 간주
      case "bookmark":
        return fb?.claimed ?? false;
      default:
        return true;
    }
  });
}

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

// 클라이언트 캐시 타입
interface CacheValue {
  etag: string;
  items: MapItem[];
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

  const { session, isLoading: isAuthLoading } = useAuth();
  const hasCenteredSightingRef = useRef(false);
  const hasAutoFocusedRef = useRef(false);
  const isAuthenticated = !!session;

  // 맵 인스턴스와 마커를 ref로 관리하여 리렌더링 시에도 유지
  const mapInstanceRef = useRef<any>(null);
  const myLocationMarkerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const cacheRef = useRef<Map<string, CacheValue>>(new Map());
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
  const [itemsInView, setItemsInView] = useState<MapItem[]>([]);
  /** 7-5: 지도 상세 카드에서 인정/해제 버튼 상태 표시용 (포인트 id → 피드백) */
  const [sightingFeedbackMap, setSightingFeedbackMap] =
    useState<SightingFeedbackMap>({});
  /** 7-5: lostPostId 없이 지도 진입 시, 내 유실글 목록 (북마크 모달에서 강아지 이름 표시) */
  const [myLostPosts, setMyLostPosts] = useState<
    { id: string; pet_name?: string; lost_at?: string }[]
  >([]);
  const [selectedLostPostIdForClaim, setSelectedLostPostIdForClaim] = useState<
    string | null
  >(null);
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

  /** 지도 마커 레이어 필터 (전체 / 안 본 것 / 북마크 / 북마크+안 본 것) */
  const [mapLayer, setMapLayer] = useState<MapLayer>("default");
  /** 레이어 선택 메뉴 열림 */
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  /** 필터 재적용용: 마지막으로 받은 원본 아이템 (mapLayer 변경 시 재필터) */
  const lastRawItemsRef = useRef<MapItem[]>([]);
  /** fetchClusters가 mapLayer에 의존하지 않도록 ref 사용 → 레이어 변경 시 지도 인스턴스/불필요 재요청 방지 */
  const mapLayerRef = useRef<MapLayer>(mapLayer);
  const prevMapLayerRef = useRef<MapLayer>(mapLayer);
  useEffect(() => {
    mapLayerRef.current = mapLayer;
  }, [mapLayer]);
  /** "내 유실글 + 북마크" 레이어용: 유실글 목록(위치·표시용 필드) */
  const [lostPostsForMap, setLostPostsForMap] = useState<
    {
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
    }[]
  >([]);
  /** 유실글 마커 (북마크 레이어에서만 표시) */
  const lostPostMarkersRef = useRef<any[]>([]);
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
      if (!session?.access_token) return;
      fetch("/api/v1/me/sighting-views", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ sightingId }),
      }).catch(() => {});
    },
    [session?.access_token]
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

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
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
   * 7-5: feedback 있으면 포인트별 본/인정 상태에 따라 테두리 색상 적용 (빨강/회색/초록)
   */
  const renderClusters = useCallback(
    (items: MapItem[], feedback?: SightingFeedbackMap) => {
      if (!mapInstanceRef.current || !window.naver?.maps) return;

      // 1. 기존 마커 제거
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

      // 2. 새 마커 생성
      const newMarkers = items.map((item) => {
        let content = "";

        if (item.type === "cluster") {
          // 클러스터: 네이버 지도 스타일 (초록색 원형)
          const size = 32 + Math.min(item.count * 1.5, 20);
          content = `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: #00C73C;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            cursor: pointer;
            transition: all 0.2s ease-out;
          " 
          onmouseover="this.style.transform='scale(1.05)'; this.style.backgroundColor='#00B336'" 
          onmouseout="this.style.transform='scale(1)'; this.style.backgroundColor='#00C73C'">
            ${item.count}
          </div>
        `;
        } else {
          // 포인트: 7-5 피드백에 따라 테두리 색상 — 인정=초록, 본=회색, 기본=빨강 (ID 정규화로 API/DB 포맷 차이 대비)
          const pointId = "id" in item ? (item.id as string) : "";
          const fb = pointId
            ? feedback?.[normalizeSightingId(pointId)]
            : undefined;
          const borderColor = fb?.claimed
            ? "#22c55e"
            : fb?.seen
              ? "#6b7280"
              : "#FF4D4D";
          const thumbnailUrl = item.photo_keys?.[0]
            ? getImageUrl(item.photo_keys[0])
            : "/icons/marker.png";

          content = `
          <div style="cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">
            <div style="
              width: 44px;
              height: 44px;
              background: white;
              border: 2.5px solid ${borderColor};
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            ">
              <div style="
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background-image: url('${thumbnailUrl}');
                background-size: cover;
                background-position: center;
                transform: rotate(45deg);
                border: 1px solid rgba(0,0,0,0.1);
              "></div>
            </div>
            <div style="
              width: 2px;
              height: 6px;
              background: ${borderColor};
              margin-top: -2px;
            "></div>
          </div>
        `;
        }

        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(item.lat, item.lng),
          map: mapInstanceRef.current,
          icon: {
            content,
            anchor: new window.naver.maps.Point(22, 50), // 커진 사이즈에 맞춰 앵커 조정
          },
          title: item.type === "point" ? item.note : `클러스터 (${item.count})`,
        });

        // 클릭 이벤트 등록
        window.naver.maps.Event.addListener(marker, "click", () => {
          if (item.type === "cluster") {
            // 클러스터 클릭 시: 줌 레벨에 따라 확대하거나 목록 표시
            const currentZoom = mapInstanceRef.current.getZoom();
            if (currentZoom >= 16) {
              // 충분히 확대된 상태에서 클러스터 클릭 시 목록 보기 열기
              setIsListViewOpen(true);
              // 선택된 마커가 중앙에 오도록 이동 (부드럽게)
              mapInstanceRef.current.panTo(marker.getPosition());
            } else {
              // 그 외에는 더 확대
              mapInstanceRef.current.morph(
                marker.getPosition(),
                currentZoom + 2
              );
            }
          } else {
            // 포인트 클릭 시 "본 적 있음" 기록 후 정보 팝업 표시
            if ("id" in item && typeof item.id === "string")
              recordSeen(item.id);
            setSelectedLostPostForCard(null);
            setSelectedSighting(item);
            mapInstanceRef.current.panTo(marker.getPosition());
          }
        });

        return marker;
      });

      markersRef.current = newMarkers;
    },
    [getImageUrl, setSelectedSighting, setSelectedLostPostForCard, recordSeen]
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

    const minLat = sw.lat();
    const minLng = sw.lng();
    const maxLat = ne.lat();
    const maxLng = ne.lng();

    // 북마크 레이어: 클러스터 없이 포인트만 필요 → 서버에 zoom 17로 요청해 포인트 단위 응답 받음
    const layer = mapLayerRef.current;
    const requestZoom = layer === "bookmark" ? Math.max(zoom, 17) : zoom;

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
    const gridSize = getGridSize(requestZoom, isAuthenticated);
    const snap = (num: number) => Math.floor(num / gridSize);

    // 3. Grid ID 기반의 캐시 키 생성 (인증·레이어별 분리; 북마크는 포인트 전용 요청이라 별도 캐시)
    const cacheKey = `${isAuthenticated}:${layer}:${snap(minLat)},${snap(minLng)},${snap(maxLat)},${snap(maxLng)},${requestZoom}`;
    const cached = cacheRef.current.get(cacheKey);

    const applyFeedbackAndRender = async (rawItems: MapItem[]) => {
      if (!isAuthenticated || !session?.access_token) {
        setSightingFeedbackMap({});
        lastRawItemsRef.current = rawItems;
        const filtered = getFilteredItems(rawItems, {}, layer);
        renderClusters(filtered, {});
        setItemsInView(filtered);
        return;
      }
      const pointItems = rawItems.filter(
        (i): i is MapItem & { type: "point"; id: string } =>
          i.type === "point" && "id" in i && typeof i.id === "string"
      );
      const pointIds = pointItems.map((i) => i.id);
      if (pointIds.length === 0) {
        setSightingFeedbackMap({});
        lastRawItemsRef.current = rawItems;
        const filtered = getFilteredItems(rawItems, {}, layer);
        renderClusters(filtered, {});
        setItemsInView(filtered);
        return;
      }
      try {
        const claimsUrl = initialLostPostId
          ? `/api/v1/me/lost-posts/${initialLostPostId}/sighting-claims`
          : "/api/v1/me/sighting-claims";
        const [viewsRes, claimsRes] = await Promise.all([
          fetch(`/api/v1/me/sighting-views?sightingIds=${pointIds.join(",")}`, {
            credentials: "include",
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).then((r) => r.json()),
          fetch(claimsUrl, {
            credentials: "include",
            headers: { Authorization: `Bearer ${session.access_token}` },
          }).then((r) => r.json()),
        ]);
        const views: Record<string, { seen: boolean }> =
          viewsRes.success && viewsRes.data?.views ? viewsRes.data.views : {};
        const claimedIds =
          claimsRes.success && claimsRes.data?.sightingIds
            ? new Set(
                (claimsRes.data.sightingIds as string[]).map(
                  normalizeSightingId
                )
              )
            : new Set<string>();
        const feedbackMap: SightingFeedbackMap = {};
        pointIds.forEach((id) => {
          const n = normalizeSightingId(id);
          const v = views[id] ?? views[n];
          feedbackMap[n] = {
            seen: v?.seen ?? false,
            claimed: claimedIds.has(n),
          };
        });
        setSightingFeedbackMap(feedbackMap);
        lastRawItemsRef.current = rawItems;
        const filtered = getFilteredItems(rawItems, feedbackMap, layer);
        renderClusters(filtered, feedbackMap);
        setItemsInView(filtered);
      } catch (e) {
        console.error("Feedback fetch error:", e);
        setSightingFeedbackMap({});
        lastRawItemsRef.current = rawItems;
        const filtered = getFilteredItems(rawItems, {}, layer);
        renderClusters(filtered, {});
        setItemsInView(filtered);
      }
    };

    if (cached) {
      applyFeedbackAndRender(cached.items);
    }

    try {
      const params = new URLSearchParams({
        minLat: minLat.toString(),
        minLng: minLng.toString(),
        maxLat: maxLat.toString(),
        maxLng: maxLng.toString(),
        zoom: requestZoom.toString(),
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
        credentials: "include",
      });

      if (response.status === 304) {
        return;
      }

      const result: ApiSuccessResponse<ClusterResponse> | ApiErrorResponse =
        await response.json();

      if (result.success && result.data) {
        const etag = response.headers.get("ETag") || "";
        const items = result.data.clusters;

        cacheRef.current.set(cacheKey, { etag, items });
        await applyFeedbackAndRender(items);
      }
    } catch (err) {
      console.error("Fetch clusters error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "주변 데이터를 불러오는 데 실패했습니다.";
      setToast({
        message,
        type: "error",
      });
    }
  }, [
    renderClusters,
    isAuthenticated,
    isAuthLoading,
    session?.access_token,
    initialLostPostId,
  ]);

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

  /** 7-5: 지도 상세 열림 + URL에 lostPostId 없을 때 내 유실글 목록 조회 (버튼 표시용) */
  useEffect(() => {
    if (
      !isAuthenticated ||
      !session?.access_token ||
      !selectedSighting ||
      initialLostPostId
    )
      return;
    fetch("/api/v1/lost-posts?limit=50", {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setMyLostPosts(
            res.data.map(
              (p: { id: string; pet_name?: string; lost_at?: string }) => ({
                id: p.id,
                pet_name: p.pet_name,
                lost_at: p.lost_at,
              })
            )
          );
          if (res.data.length >= 1) {
            setSelectedLostPostIdForClaim((prev) => prev || res.data[0].id);
          }
        }
      })
      .catch(() => setMyLostPosts([]));
  }, [
    isAuthenticated,
    session?.access_token,
    selectedSighting,
    initialLostPostId,
  ]);

  /** 7-5.6.1: 추천 페이지 "지도에서 보기" 진입 시(initialLostPostId 있음) 해당 유실글 1건만 로드 → 북마크 별 노출 */
  useEffect(() => {
    if (
      !initialLostPostId ||
      !isAuthenticated ||
      !session?.access_token ||
      !selectedSighting
    )
      return;
    fetch(`/api/v1/lost-posts/${initialLostPostId}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data?.id) {
          const p = res.data as {
            id: string;
            pet_name?: string;
            lost_at?: string;
          };
          setMyLostPosts([
            { id: p.id, pet_name: p.pet_name, lost_at: p.lost_at },
          ]);
          setSelectedLostPostIdForClaim((prev) => prev || p.id);
        }
      })
      .catch(() => {});
  }, [
    initialLostPostId,
    isAuthenticated,
    session?.access_token,
    selectedSighting,
  ]);

  /** 7-5: 북마크 버튼에 사용할 유실글 ID (URL 기준 또는 내 유실글 1개 또는 선택값) */
  const effectiveLostPostId =
    initialLostPostId ??
    (myLostPosts.length === 1
      ? myLostPosts[0].id
      : (selectedLostPostIdForClaim ?? myLostPosts[0]?.id));

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
      const center = initialCenter ?? DEFAULT_CENTER;
      const mapOptions = {
        center: new window.naver.maps.LatLng(center.lat, center.lng),
        zoom: initialCenter ? 16 : 13,
        zoomControl: false,
      };

      mapInstanceRef.current = new window.naver.maps.Map(
        mapRef.current,
        mapOptions
      );

      window.naver.maps.Event.addListener(
        mapInstanceRef.current,
        "idle",
        handleMapIdle
      );

      window.naver.maps.Event.addListener(
        mapInstanceRef.current,
        "click",
        () => {
          setSelectedSighting(null);
        }
      );

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
    if (!initialFocusSightingId || !session?.access_token) return;
    fetch("/api/v1/me/sighting-views", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ sightingId: initialFocusSightingId }),
    }).catch(() => {});
  }, [initialFocusSightingId, session?.access_token]);

  // 마커 로드 후 해당 제보 상세 카드를 기본으로 열기
  useEffect(() => {
    if (
      !initialFocusSightingId ||
      hasAutoFocusedRef.current ||
      itemsInView.length === 0
    )
      return;
    const point = itemsInView.find(
      (item): item is MapItem & { type: "point"; id: string } =>
        item.type === "point" && item.id === initialFocusSightingId
    );
    if (point) {
      setSelectedSighting(point);
      hasAutoFocusedRef.current = true;
    }
  }, [initialFocusSightingId, itemsInView]);

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
    if (session?.access_token)
      headers["Authorization"] = `Bearer ${session.access_token}`;

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
  }, [isLoaded, initialCenterSightingId, session?.access_token]);

  useEffect(() => {
    if (window.naver?.maps && !mapInstanceRef.current) {
      initMap();
    }

    return () => {
      if (mapInstanceRef.current) {
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

  // 인증/로드 상태 변경 시 마커·클러스터 재요청 (전역 AuthContext 사용)
  useEffect(() => {
    if (mapInstanceRef.current && isLoaded) {
      fetchClusters();
    }
  }, [isAuthenticated, isAuthLoading, fetchClusters, isLoaded]);

  // 레이어 필터 변경 시: 북마크 진입/이탈이면 API 재요청, default↔unseen은 재필터만 (지도 인스턴스 유지)
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    const prev = prevMapLayerRef.current;
    prevMapLayerRef.current = mapLayer;

    const enteringOrLeavingBookmark =
      mapLayer === "bookmark" || prev === "bookmark";
    if (enteringOrLeavingBookmark) {
      fetchClusters();
      return;
    }
    // default ↔ unseen: 재요청 없이 마지막 raw로 재필터만
    if (lastRawItemsRef.current.length === 0) return;
    const raw = lastRawItemsRef.current;
    const filtered = getFilteredItems(raw, sightingFeedbackMap, mapLayer);
    renderClusters(filtered, sightingFeedbackMap);
    setItemsInView(filtered);
  }, [mapLayer]); // eslint-disable-line react-hooks/exhaustive-deps -- sightingFeedbackMap/renderClusters/fetchClusters는 최신 클로저로 사용

  // "내 유실글 + 북마크" 레이어 선택 시 유실글 목록(위치) 조회.
  // 지도 RPC에 cover_photo_key가 없을 수 있으므로, 내 유실글 목록 API(GET /api/v1/lost-posts)로 보강해 이미지/특징을 채운다.
  useEffect(() => {
    if (mapLayer !== "bookmark" || !isAuthenticated || !session?.access_token) {
      if (mapLayer !== "bookmark") setLostPostsForMap([]);
      return;
    }
    const token = session.access_token;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/v1/me/lost-posts/map?limit=50", {
        credentials: "include",
        headers,
      }).then((r) => r.json()),
      fetch("/api/v1/lost-posts?limit=100", {
        credentials: "include",
        headers,
      }).then((r) => r.json()),
    ])
      .then(([mapRes, listRes]) => {
        const mapData =
          mapRes?.success && Array.isArray(mapRes.data) ? mapRes.data : [];
        const listRows =
          listRes?.success && Array.isArray(listRes.data) ? listRes.data : [];
        const listById: Record<
          string,
          {
            cover_photo_key?: string;
            trait_color?: string;
            trait_size?: string;
            trait_species?: string;
            note?: string;
            pet_name?: string;
            lost_at?: string;
          }
        > = {};
        listRows.forEach(
          (row: {
            id: string;
            cover_photo_key?: string;
            trait_color?: string;
            trait_size?: string;
            trait_species?: string;
            note?: string;
            pet_name?: string;
            lost_at?: string;
          }) => {
            listById[row.id] = {
              cover_photo_key: row.cover_photo_key,
              trait_color: row.trait_color,
              trait_size: row.trait_size,
              trait_species: row.trait_species,
              note: row.note,
              pet_name: row.pet_name,
              lost_at: row.lost_at,
            };
          }
        );
        setLostPostsForMap(
          mapData.map(
            (p: {
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
            }) => {
              const fromList = listById[p.id];
              return {
                id: p.id,
                pet_name: p.pet_name ?? fromList?.pet_name,
                lost_at: p.lost_at ?? fromList?.lost_at,
                cover_photo_key: p.cover_photo_key ?? fromList?.cover_photo_key,
                trait_color: p.trait_color ?? fromList?.trait_color,
                trait_size: p.trait_size ?? fromList?.trait_size,
                trait_species: p.trait_species ?? fromList?.trait_species,
                note: p.note ?? fromList?.note,
                lat: p.lat,
                lng: p.lng,
              };
            }
          )
        );
      })
      .catch(() => setLostPostsForMap([]));
  }, [mapLayer, isAuthenticated, session?.access_token]);

  // 북마크 레이어일 때만 유실글 마커 표시, 해제 시 제거
  useEffect(() => {
    if (!window.naver?.maps || !mapInstanceRef.current) return;
    lostPostMarkersRef.current.forEach((m) => m.setMap(null));
    lostPostMarkersRef.current = [];
    if (mapLayer !== "bookmark" || lostPostsForMap.length === 0) return;
    const map = mapInstanceRef.current;
    const newMarkers = lostPostsForMap.map((lp) => {
      const borderColor = "#f59e0b";
      const thumbnailUrl = lp.cover_photo_key
        ? getLostPostImageUrl(lp.cover_photo_key)
        : "/icons/marker.png";
      const content = `
        <div style="cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">
          <div style="
            width: 44px;
            height: 44px;
            background: white;
            border: 2.5px solid ${borderColor};
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            box-sizing: border-box;
          ">
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 8px;
              background-image: url('${thumbnailUrl}');
              background-size: cover;
              background-position: center;
              border: 1px solid rgba(0,0,0,0.08);
            "></div>
          </div>
        </div>
      `;
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(lp.lat, lp.lng),
        map,
        icon: {
          content,
          anchor: new window.naver.maps.Point(22, 44),
        },
        title: lp.pet_name?.trim() || "유실 장소",
      });
      window.naver.maps.Event.addListener(marker, "click", () => {
        map.panTo(marker.getPosition());
        setSelectedSighting(null);
        setSelectedLostPostForCard(lp);
      });
      return marker;
    });
    lostPostMarkersRef.current = newMarkers;
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
            className="animate-in slide-in-from-bottom-6 absolute inset-x-0 bottom-[104px] z-50 px-4 duration-300"
            onMouseDown={stopPropagation}
            onMouseUp={stopPropagation}
            onMouseMove={stopPropagation}
            onTouchStart={stopPropagation}
            onTouchMove={stopPropagation}
            onTouchEnd={stopPropagation}
            onWheel={stopPropagation}
          >
            <div className="bg-surface relative overflow-hidden rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/10">
              <button
                onClick={() => setSelectedLostPostForCard(null)}
                className="absolute top-4 right-4 z-30 rounded-full bg-black/20 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/40"
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
              <div className="max-h-[60vh] overflow-y-auto">
                <div className="flex flex-col">
                  {/* 유실글 대표 사진 영역 — 항상 표시(없으면 플레이스홀더) */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {selectedLostPostForCard.cover_photo_key ? (
                      <>
                        <Image
                          src={getLostPostImageUrl(
                            selectedLostPostForCard.cover_photo_key
                          )}
                          alt="유실글 대표 사진"
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover transition-transform duration-500 hover:scale-105"
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
                  <div className="space-y-5 p-6">
                    <div>
                      <Text
                        variant="title"
                        className="text-xl font-bold text-amber-600 dark:text-amber-400"
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
                      <p className="text-sm text-gray-600 dark:text-gray-400">
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
          <SightingDetailSheet
            onClose={() => setSelectedSighting(null)}
            bottomOffset={104}
          >
            <SightingDetailCard
              sighting={selectedSighting as SightingDetailData}
              getImageUrl={getImageUrl}
              onClose={() => setSelectedSighting(null)}
              rightSlot={
                isAuthenticated &&
                session?.access_token &&
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
                              Authorization: `Bearer ${session.access_token}`,
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
          session?.access_token && (
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
                                  const res = await fetch(
                                    `/api/v1/me/lost-posts/${encodeURIComponent(p.id)}/sighting-claims/${encodeURIComponent(sid)}`,
                                    {
                                      method: "DELETE",
                                      credentials: "include",
                                      headers: {
                                        Authorization: `Bearer ${session.access_token}`,
                                      },
                                    }
                                  );
                                  const data = await res.json();
                                  if (data?.success) {
                                    setClaimedLostPostsForSighting((prev) =>
                                      prev
                                        ? prev.filter((x) => x.id !== p.id)
                                        : []
                                    );
                                    fetchClusters();
                                    if (
                                      claimedLostPostsForSighting?.length <= 1
                                    ) {
                                      setBookmarkModalOpen(false);
                                      setClaimedLostPostsForSighting(null);
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
                      {myLostPosts
                        .filter((p) => {
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
                        })
                        .map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="bg-muted/50 hover:bg-muted flex w-full items-center gap-4 rounded-xl border border-gray-200 px-5 py-4 text-left transition-colors dark:border-gray-600 dark:hover:bg-gray-700/50"
                              onClick={async () => {
                                const sid = selectedSighting.id as string;
                                await fetch(
                                  `/api/v1/me/lost-posts/${p.id}/sighting-claims`,
                                  {
                                    method: "POST",
                                    credentials: "include",
                                    headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${session.access_token}`,
                                    },
                                    body: JSON.stringify({ sightingId: sid }),
                                  }
                                );
                                setBookmarkModalOpen(false);
                                setClaimedLostPostsForSighting(null);
                                fetchClusters();
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
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* 목록 보기 하단 시트 */}
        {isListViewOpen && (
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
                          label: "내 유실글 + 북마크",
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

          {/* 목록 보기 버튼 */}
          <button
            onClick={() => setIsListViewOpen(true)}
            className="bg-primary flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-xl transition-transform active:scale-95"
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
