"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostCaseCarousel } from "@/features/lost-posts/components/LostCaseCarousel";
import { selectActiveLostCase } from "@/features/lost-posts/lib/active-lost-case";
import { useMyLostPosts } from "@/features/lost-posts/hooks/useMyLostPosts";
import type { LostPostItem } from "@/features/lost-posts/model/types";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";
import { MySightingList } from "@/features/sightings/components/MySightingList";
import { useMySightings } from "@/features/sightings/hooks/useMySightings";

function sortLostCasesForCarousel(items: LostPostItem[]): LostPostItem[] {
  return items.toSorted((a, b) => {
    const rank = (status: LostPostItem["status"]) =>
      status === "searching" ? 0 : status === "found" ? 1 : 2;
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

function NewLostPostButton({ className }: { className?: string }) {
  return (
    <Link
      href="/my/lost-posts/new"
      aria-label="유실글 올리기"
      className={cn(
        "text-text-main hover:text-action-primary focus-visible:outline-action-primary inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-2xl font-light leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className
      )}
    >
      <span aria-hidden="true">+</span>
    </Link>
  );
}

function MyPageContent() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { items, loading, refreshing, error, reload } = useMyLostPosts();
  useMySightings();
  const [sightingsOpen, setSightingsOpen] = useState(false);
  const carouselItems = useMemo(
    () => sortLostCasesForCarousel(items),
    [items]
  );
  const defaultActive = selectActiveLostCase(items);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCase =
    carouselItems.find((item) => item.id === selectedId) ??
    defaultActive ??
    carouselItems[0] ??
    null;

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <Container className="py-8">
      <header className="mb-8">
        <div className="flex items-center justify-between gap-3">
          <Text as="h1" variant="title" color="main">
            내 정보
          </Text>
          <Link
            href="/my/settings"
            aria-label="설정"
            className="text-action-primary focus-visible:outline-action-primary inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon name="settings" size={22} />
          </Link>
        </div>
        <Text variant="body" color="sub" className="mt-1">
          올린 유실글과 제보를 이어서 관리하세요.
        </Text>
      </header>

      <AccountSurface user={user} onSignOut={handleSignOut} />

      {loading && carouselItems.length === 0 ? (
        <div className="mb-6 space-y-3">
          <div className="bg-border-subtle h-3 w-40 animate-pulse rounded-full" />
          <div className="bg-border-subtle h-3 w-28 animate-pulse rounded-full" />
          <Text variant="caption" color="caption">
            유실글을 불러오는 중...
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

      {!loading && !error && carouselItems.length === 0 ? (
        <div className="border-border-subtle bg-surface mb-6 flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-5 py-10 text-center shadow-sm">
          <Text as="h2" variant="title" color="main">
            아직 올린 유실글이 없어요
          </Text>
          <Text variant="body" color="sub" className="max-w-sm">
            가족을 찾고 있다면, 유실글 하나로 PinPaw 찾기를 시작해 보세요.
          </Text>
          <Link href="/my/lost-posts/new" className="mt-1">
            <Button variant="primary" className="min-h-11">
              유실글 올리기
            </Button>
          </Link>
        </div>
      ) : null}

      {carouselItems.length > 0 ? (
        <LostCaseCarousel
          items={carouselItems}
          refreshing={refreshing}
          selectedId={selectedCase?.id ?? null}
          onSelect={(item) => setSelectedId(item.id)}
          primaryAction="detail"
          heading="내 유실글"
          headingAction={<NewLostPostButton />}
        />
      ) : null}

      <section className="border-border-subtle bg-surface mb-4 overflow-hidden rounded-2xl border shadow-sm">
        <button
          type="button"
          onClick={() => setSightingsOpen((o) => !o)}
          className="hover:bg-surface-soft flex w-full items-center justify-between px-5 py-4 text-left transition-colors"
          aria-expanded={sightingsOpen}
          aria-controls="my-sightings-content"
          id="my-sightings-heading"
        >
          <Text variant="title" color="main">
            내 제보
          </Text>
          <span
            className={cn(
              "text-text-caption inline-block transition-transform",
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
            "border-border-subtle border-t",
            !sightingsOpen && "hidden"
          )}
        >
          <ScrollablePanel variant="list" className="px-5 pt-3 pb-5">
            {sightingsOpen ? <MySightingList /> : null}
          </ScrollablePanel>
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
          <Text variant="body" color="main" className="font-semibold">
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
          className="text-action-primary text-sm font-medium hover:underline"
        >
          로그아웃
        </button>
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
