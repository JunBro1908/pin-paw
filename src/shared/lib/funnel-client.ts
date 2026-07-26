"use client";

import type { FunnelEventInput } from "@/shared/lib/funnel-events";

/**
 * first-party 퍼널 이벤트 전송. 실패해도 UX를 막지 않는다.
 */
export async function trackFunnelEvent(
  accessToken: string | undefined,
  event: FunnelEventInput
): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch("/api/v1/me/funnel-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget analytics must never block product flows.
  }
}
