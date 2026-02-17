"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostPostList } from "@/features/lost-posts/components/LostPostList";
import { cn } from "@/shared/lib/cn";

function MyPageContent() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [lostPostsOpen, setLostPostsOpen] = useState(true);
  const [sightingsOpen, setSightingsOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const displayName =
    user?.user_metadata?.name ??
    user?.user_metadata?.nickname ??
    user?.email?.split("@")[0] ??
    "사용자";
  const displayEmail = user?.email ?? "";

  return (
    <Container className="py-10">
      <div className="border-border-subtle bg-surface mb-6 rounded-2xl border p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-primary-soft h-14 w-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Text variant="body" className="font-bold">
              {displayName}님
            </Text>
            {displayEmail ? (
              <Text
                variant="caption"
                color="caption"
                className="block truncate"
              >
                {displayEmail}
              </Text>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-primary text-sm font-medium hover:underline"
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* 내 유실글 — 드롭다운 */}
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
            내 유실글
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
            <LostPostList />
          </div>
        </div>
      </section>

      {/* 내 제보 — 드롭다운 */}
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
          <div className="px-5 py-6">
            <Text
              variant="body"
              color="caption"
              className="mb-2 block text-center"
            >
              아직 작성한 제보가 없습니다.
            </Text>
            <Link
              href="/"
              className="text-primary block text-center text-sm font-medium hover:underline"
            >
              제보하러 가기
            </Link>
          </div>
        </div>
      </section>
    </Container>
  );
}

export default function MyPage() {
  return (
    <AuthGuard>
      <MyPageContent />
    </AuthGuard>
  );
}
