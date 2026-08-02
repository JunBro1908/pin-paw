"use client";

import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { LostPostForm } from "@/features/lost-posts/components/LostPostForm";

function NewLostPostPageContent() {
  return (
    <Container className="py-8">
      <BackLink href="/my">내 정보</BackLink>
      <Text as="h1" variant="title" color="main" className="mb-6">
        유실글 등록
      </Text>
      <LostPostForm />
    </Container>
  );
}

export default function NewLostPostPage() {
  return (
    <AuthGuard>
      <NewLostPostPageContent />
    </AuthGuard>
  );
}
