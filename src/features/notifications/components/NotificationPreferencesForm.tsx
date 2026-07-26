"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/shared/ui/Button";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";

type Preferences = {
  new_recommendation_enabled: boolean;
  claim_updates_enabled: boolean;
  lost_post_status_enabled: boolean;
  analytics_opt_in: boolean;
};

export function NotificationPreferencesForm() {
  const { session, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    setLoadError(null);
    fetch("/api/v1/me/notification-preferences", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message ?? "설정을 불러오지 못했습니다.");
        }
        const row = result.data ?? {};
        setPrefs({
          new_recommendation_enabled: row.new_recommendation_enabled !== false,
          claim_updates_enabled: row.claim_updates_enabled !== false,
          lost_post_status_enabled: row.lost_post_status_enabled !== false,
          analytics_opt_in: row.analytics_opt_in !== false,
        });
      })
      .catch((cause) => {
        const message =
          cause instanceof Error ? cause.message : "설정 조회에 실패했습니다.";
        setLoadError(message);
        setToast({ message, type: "error" });
      });
  }, [session?.access_token, reloadKey]);

  const save = async () => {
    if (!session?.access_token || !prefs) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/me/notification-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          newRecommendationEnabled: prefs.new_recommendation_enabled,
          claimUpdatesEnabled: prefs.claim_updates_enabled,
          lostPostStatusEnabled: prefs.lost_post_status_enabled,
          analyticsOptIn: prefs.analytics_opt_in,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? "저장에 실패했습니다.");
      }
      setToast({ message: "설정을 저장했습니다.", type: "success" });
    } catch (cause) {
      setToast({
        message: cause instanceof Error ? cause.message : "저장 실패",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!session?.access_token || confirmDelete !== "DELETE") return;
    setDeleting(true);
    try {
      const response = await fetch("/api/v1/me/account/deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "계정 삭제 요청에 실패했습니다.");
      }
      setToast({
        message: "계정 삭제가 접수되었습니다. 곧 로그아웃됩니다.",
        type: "success",
      });
      await signOut();
    } catch (cause) {
      setToast({
        message:
          cause instanceof Error ? cause.message : "계정 삭제에 실패했습니다.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loadError && !prefs) {
    return (
      <div className="space-y-3">
        <Text color="error">{loadError}</Text>
        <Button
          variant="secondary"
          onClick={() => {
            setPrefs(null);
            setLoadError(null);
            setReloadKey((key) => key + 1);
          }}
        >
          다시 시도
        </Button>
      </div>
    );
  }

  if (!prefs) {
    return <Text color="caption">설정을 불러오는 중...</Text>;
  }

  const toggles: {
    key: keyof Preferences;
    label: string;
    description: string;
  }[] = [
    {
      key: "new_recommendation_enabled",
      label: "새 추천 후보 알림",
      description: "유실글에 새 추천이 생기면 알립니다.",
    },
    {
      key: "claim_updates_enabled",
      label: "클레임/북마크 알림",
      description: "관련 클레임 변경을 알립니다.",
    },
    {
      key: "lost_post_status_enabled",
      label: "유실글 상태 알림",
      description: "찾음/마감 등 상태 변경을 알립니다.",
    },
    {
      key: "analytics_opt_in",
      label: "이용 지표 수집",
      description: "위치·메모·토큰 없이 퍼널 이벤트만 기록합니다.",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Text variant="title">수신 설정</Text>
        {toggles.map((toggle) => (
          <label
            key={toggle.key}
            className="border-border-subtle bg-surface flex items-start justify-between gap-4 rounded-2xl border p-4"
          >
            <span>
              <Text variant="body" className="font-semibold">
                {toggle.label}
              </Text>
              <Text variant="caption" color="caption" className="mt-1 block">
                {toggle.description}
              </Text>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={prefs[toggle.key]}
              onChange={(event) =>
                setPrefs((current) =>
                  current
                    ? { ...current, [toggle.key]: event.target.checked }
                    : current
                )
              }
            />
          </label>
        ))}
        <Button
          type="button"
          variant="primary"
          className="w-full"
          isLoading={saving}
          onClick={() => void save()}
        >
          설정 저장
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
        <Text variant="title" className="text-red-700 dark:text-red-300">
          계정 삭제
        </Text>
        <Text variant="caption" color="caption">
          확인을 위해 DELETE를 입력하세요. 접수 후 접근이 차단되고 삭제가
          진행됩니다.
        </Text>
        <input
          className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 dark:border-red-800 dark:bg-gray-900"
          value={confirmDelete}
          onChange={(event) => setConfirmDelete(event.target.value)}
          placeholder="DELETE"
          aria-label="계정 삭제 확인 문구"
        />
        <Button
          type="button"
          className="w-full bg-red-600 text-white"
          isLoading={deleting}
          disabled={confirmDelete !== "DELETE"}
          onClick={() => void deleteAccount()}
        >
          계정 삭제 요청
        </Button>
      </section>

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
