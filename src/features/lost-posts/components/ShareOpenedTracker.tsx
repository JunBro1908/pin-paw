"use client";

import { useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";

export function ShareOpenedTracker({ lostPostId }: { lostPostId: string }) {
  const { session } = useAuth();

  useEffect(() => {
    void trackFunnelEvent(session?.access_token, {
      name: "share_link_opened",
      lostPostId,
      properties: { surface: "share_page" },
    });
  }, [session?.access_token, lostPostId]);

  return null;
}
