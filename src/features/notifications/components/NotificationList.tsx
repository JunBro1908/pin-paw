"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Text } from "@/shared/ui/Text";
import { Loading } from "@/shared/ui/Loading";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";
import {
  notificationHref,
  notificationTitle,
  type AppNotification,
} from "../model/types";

export function NotificationList() {
  const { session } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/me/notifications?limit=50", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? "알림을 불러오지 못했습니다.");
      }
      setItems((result.data?.items ?? []) as AppNotification[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item: AppNotification) => {
    if (!session?.access_token || item.read_at) return;
    try {
      const response = await fetch(`/api/v1/me/notifications/${item.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, read_at: new Date().toISOString() }
            : entry
        )
      );
    } catch {
      // Read-state sync must not block navigation.
    }
  };

  if (loading) return <Loading label="알림 불러오는 중" />;
  if (error) return <Text color="error">{error}</Text>;
  if (items.length === 0) {
    return (
      <Text variant="body" color="caption">
        아직 알림이 없습니다.
      </Text>
    );
  }

  return (
    <ScrollablePanel variant="list">
      <ul className="space-y-3">
        {items.map((item) => {
          const href = notificationHref(item);
          const unread = !item.read_at;
          const body = (
            <div
              className={`rounded-2xl border p-4 ${
                unread
                  ? "border-primary/30 bg-primary-soft/40"
                  : "border-border-subtle bg-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <Text variant="body" className="font-semibold">
                  {notificationTitle(item)}
                </Text>
                {unread ? (
                  <span className="bg-primary mt-1 h-2 w-2 shrink-0 rounded-full" />
                ) : null}
              </div>
              {item.display_metadata?.petName ? (
                <Text variant="caption" color="caption" className="mt-1 block">
                  {item.display_metadata.petName}
                  {item.display_metadata.status
                    ? ` · ${item.display_metadata.status}`
                    : ""}
                </Text>
              ) : null}
              <Text variant="caption" color="caption" className="mt-2 block">
                {new Date(item.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </Text>
            </div>
          );

          if (!href) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => void markRead(item)}
                >
                  {body}
                </button>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <Link
                href={href}
                className="block"
                onClick={() => void markRead(item)}
              >
                {body}
              </Link>
            </li>
          );
        })}
      </ul>
    </ScrollablePanel>
  );
}
