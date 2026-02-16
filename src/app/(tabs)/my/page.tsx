"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostPostList } from "@/features/lost-posts/components/LostPostList";

function MyPageContent() {
  const { user, signOut } = useAuth();

  const displayName =
    user?.user_metadata?.name ??
    user?.user_metadata?.nickname ??
    user?.email?.split("@")[0] ??
    "사용자";
  const displayEmail = user?.email ?? "";

  return (
    <Container className="py-10">
      <div className="border-border-subtle bg-surface mb-8 rounded-2xl border p-5 shadow-sm">
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
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => signOut()}
          >
            로그아웃
          </Button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <Text variant="title">내 유실글</Text>
        <Link href="/my/lost-posts/new">
          <Button variant="primary">+ 등록</Button>
        </Link>
      </div>
      <LostPostList />
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
