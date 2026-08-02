"use client";

import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { MySightingList } from "@/features/sightings/components/MySightingList";

/**
 * 내 제보 목록 전용 페이지 (딥링크용). 내 정보에서도 동일 리스트를 인라인 표시.
 */
function MySightingsContent() {
  return (
    <Container className="py-10">
      <BackLink href="/my">내 정보</BackLink>
      <Text as="h1" variant="title" color="main" className="mb-4">
        내 제보
      </Text>
      <MySightingList />
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
