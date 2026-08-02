"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Text } from "@/shared/ui/Text";

type HistoryItem = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
};

export function LostPostStatusHistory({ lostPostId }: { lostPostId: string }) {
  const { session } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch(`/api/v1/me/lost-posts/${lostPostId}/status-history?limit=20`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(
            result.error?.message ?? "이력을 불러오지 못했습니다."
          );
        }
        setItems((result.data?.items ?? result.data ?? []) as HistoryItem[]);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "이력 조회 실패")
      );
  }, [session?.access_token, lostPostId]);

  if (error) {
    return (
      <div className="border-border-subtle bg-surface-soft rounded-xl border px-3 py-3">
        <Text variant="caption" color="caption" className="block">
          상태 이력을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.
        </Text>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <Text variant="caption" color="caption">
        상태 이력이 아직 없습니다.
      </Text>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-border-subtle bg-surface-soft rounded-xl border px-3 py-2 text-sm"
        >
          <span className="text-text-main font-medium">
            {item.from_status ?? "—"} → {item.to_status}
          </span>
          <span className="text-text-caption ml-2">
            {new Date(item.changed_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
