"use client";

import { useCallback } from "react";

interface SightingDetailSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  /** 지도 컨트롤 등 하단 여백(px) */
  bottomOffset?: number;
}

/**
 * 지도 위 제보 상세 카드 래퍼 (absolute 하단 고정, 터치/스크롤 시 지도 이벤트 전파 차단).
 * 추천 페이지 등은 팝업 모달(중앙 배치)을 사용하면 됨.
 */
export function SightingDetailSheet({
  onClose,
  children,
  bottomOffset = 104,
}: SightingDetailSheetProps) {
  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className="animate-in slide-in-from-bottom-6 absolute inset-x-0 z-50 px-4 duration-300"
      style={{ bottom: `${bottomOffset}px` }}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onMouseMove={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchMove={stopPropagation}
      onTouchEnd={stopPropagation}
      onWheel={stopPropagation}
      onClick={stopPropagation}
    >
      {children}
    </div>
  );
}
