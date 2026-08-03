"use client";

import { useEffect, useState } from "react";
import { toLocalDatetimeLocalString } from "@/shared/lib/date";

/**
 * datetime-local max를 클라이언트 마운트 이후에만 세팅한다.
 * SSR/UTC 호스트에서 박힌 max로 저녁 서울 시각이 거절되는 문제를 막는다.
 */
export function useSeoulDatetimeLocalMax(refreshMs = 15_000): string | undefined {
  const [max, setMax] = useState<string | undefined>(undefined);

  useEffect(() => {
    const tick = () => setMax(toLocalDatetimeLocalString(new Date()));
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  return max;
}
