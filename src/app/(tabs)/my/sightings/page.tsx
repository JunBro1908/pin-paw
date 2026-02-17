"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";

/**
 * 내 제보 목록 페이지. Commit 5-2에서 API·UI 구현 예정.
 */
function MySightingsContent() {
  return (
    <Container className="py-10">
      <Link
        href="/my"
        className="text-primary mb-6 inline-block text-sm font-medium"
      >
        ← 내 정보
      </Link>
      <Text variant="title" className="mb-2">
        내 제보
      </Text>
      <Text variant="caption" color="caption" className="mb-6 block">
        내가 등록한 목격 제보 목록입니다. (준비 중)
      </Text>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/30">
        <Text variant="body" color="caption" className="mb-4 block">
          아직 작성한 제보가 없습니다.
        </Text>
        <Link href="/">
          <Button variant="primary">제보하러 가기</Button>
        </Link>
      </div>
    </Container>
  );
}

export default function MySightingsPage() {
  return (
    <AuthGuard>
      <MySightingsContent />
    </AuthGuard>
  );
}
