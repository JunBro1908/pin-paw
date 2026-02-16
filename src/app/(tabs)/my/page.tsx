"use client";

import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Divider } from "@/shared/ui/Divider";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";

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
      <Text variant="title">내 정보</Text>
      <Divider />
      <div className="mb-8 flex items-center gap-4">
        <div className="bg-primary-soft h-16 w-16 rounded-full" />
        <div>
          <Text variant="body" className="font-bold">
            {displayName}님
          </Text>
          {displayEmail ? <Text variant="caption">{displayEmail}</Text> : null}
        </div>
      </div>
      <Button variant="primary" className="w-full" disabled>
        프로필 수정하기 (준비 중)
      </Button>
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => signOut()}
      >
        로그아웃
      </Button>
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
