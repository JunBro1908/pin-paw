"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ActiveLostCaseCard } from "@/features/lost-posts/components/ActiveLostCaseCard";
import { LostCaseNextActions } from "@/features/lost-posts/components/LostCaseNextActions";
import { LostPostList } from "@/features/lost-posts/components/LostPostList";
import { selectActiveLostCase } from "@/features/lost-posts/lib/active-lost-case";
import { useMyLostPosts } from "@/features/lost-posts/hooks/useMyLostPosts";
import { MySightingList } from "@/features/sightings/components/MySightingList";
import { cn } from "@/shared/lib/cn";

function MyPageContent() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { items, loading, refreshing, error, reload } = useMyLostPosts();
  const [lostPostsOpen, setLostPostsOpen] = useState(false);
  const [sightingsOpen, setSightingsOpen] = useState(false);

  const activeCase = selectActiveLostCase(items);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <Container className="py-10">
      <Text as="h1" variant="title" className="mb-6">
        내 활동
      </Text>

      {loading && !activeCase ? (
        <div className="mb-6 space-y-3">
          <div className="bg-border-subtle h-3 w-40 animate-pulse rounded-full" />
          <div className="bg-border-subtle h-3 w-28 animate-pulse rounded-full" />
          <Text variant="caption" color="caption">
            활성 사건을 불러오는 중...
          </Text>
        </div>
      ) : null}

      {error && items.length === 0 ? (
        <div className="border-border-subtle bg-surface mb-6 rounded-2xl border p-5 text-center shadow-sm">
          <Text variant="body" color="error" className="mb-3 block">
            {error}
          </Text>
          <Button variant="secondary" onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      ) : null}

      {!loading && !error && !activeCase ? (
        <div className="border-border-subtle bg-surface mb-6 rounded-2xl border border-dashed p-6 text-center shadow-sm">
          <Text variant="body" className="mb-2 font-medium">
            찾는 중인 유실 사건이 없어요
          </Text>
          <Text variant="caption" color="caption" className="mb-4 block">
            유실 사건을 등록하면 확인할 제보와 지도 흔적을 여기서 이어서 볼 수
            있어요.
          </Text>
          <Link href="/my/lost-posts/new">
            <Button variant="primary">유실 사건 등록하기</Button>
          </Link>
        </div>
      ) : null}

      {activeCase ? (
        <>
          <ActiveLostCaseCard item={activeCase} refreshing={refreshing} />
          <LostCaseNextActions lostPostId={activeCase.id} />
        </>
      ) : null}

      <AccountSurface user={user} onSignOut={handleSignOut} />

      <section className="border-border-subtle bg-surface mb-4 overflow-hidden rounded-2xl border shadow-sm">
        <button
          type="button"
          onClick={() => setLostPostsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
          aria-expanded={lostPostsOpen}
          aria-controls="my-lost-posts-content"
          id="my-lost-posts-heading"
        >
          <Text variant="title" className="font-semibold">
            지난 유실글
          </Text>
          <span
            className={cn(
              "inline-block text-gray-500 transition-transform",
              !lostPostsOpen && "rotate-90"
            )}
            aria-hidden
          >
            ▼
          </span>
        </button>
        <div
          id="my-lost-posts-content"
          role="region"
          aria-labelledby="my-lost-posts-heading"
          className={cn(
            "border-t border-gray-100 dark:border-gray-800",
            !lostPostsOpen && "hidden"
          )}
        >
          <div className="flex justify-end px-5 pt-3 pb-1">
            <Link
              href="/my/lost-posts/new"
              className="text-primary text-sm font-medium hover:underline"
            >
              + 등록
            </Link>
          </div>
          <div className="px-5 pb-5">
            {lostPostsOpen ? (
              <LostPostList
                items={items}
                loading={loading}
                refreshing={refreshing}
                error={error}
              />
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-border-subtle bg-surface mb-4 overflow-hidden rounded-2xl border shadow-sm">
        <button
          type="button"
          onClick={() => setSightingsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
          aria-expanded={sightingsOpen}
          aria-controls="my-sightings-content"
          id="my-sightings-heading"
        >
          <Text variant="title" className="font-semibold">
            내 제보
          </Text>
          <span
            className={cn(
              "inline-block text-gray-500 transition-transform",
              !sightingsOpen && "rotate-90"
            )}
            aria-hidden
          >
            ▼
          </span>
        </button>
        <div
          id="my-sightings-content"
          role="region"
          aria-labelledby="my-sightings-heading"
          className={cn(
            "border-t border-gray-100 dark:border-gray-800",
            !sightingsOpen && "hidden"
          )}
        >
          <div className="px-5 pt-3 pb-5">
            {sightingsOpen ? <MySightingList /> : null}
          </div>
        </div>
      </section>
    </Container>
  );
}

function AccountSurface({
  user,
  onSignOut,
}: {
  user: User | null;
  onSignOut: () => void | Promise<void>;
}) {
  const displayName =
    user?.user_metadata?.name ??
    user?.user_metadata?.nickname ??
    user?.email?.split("@")[0] ??
    "사용자";
  const displayEmail = user?.email ?? "";

  return (
    <div className="border-border-subtle bg-surface mb-6 rounded-2xl border p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="bg-primary-soft h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Text variant="body" className="font-bold">
            {displayName}님
          </Text>
          {displayEmail ? (
            <Text variant="caption" color="caption" className="block truncate">
              {displayEmail}
            </Text>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="text-primary text-sm font-medium hover:underline"
        >
          로그아웃
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/my/notifications"
          className="text-primary text-sm font-medium hover:underline"
        >
          알림
        </Link>
        <Link
          href="/my/settings"
          className="text-primary text-sm font-medium hover:underline"
        >
          설정
        </Link>
      </div>
    </div>
  );
}

export default function MyPage() {
  return (
    <AuthGuard>
      <MyPageContent />
    </AuthGuard>
  );
}
