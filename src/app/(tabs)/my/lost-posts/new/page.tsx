"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { LostPostForm } from "@/features/lost-posts/components/LostPostForm";

function NewLostPostPageContent() {
  return (
    <Container className="py-8">
      <Link
        href="/my"
        className="text-primary mb-6 inline-block text-sm font-medium"
      >
        ← 내 활동으로
      </Link>
      <Text variant="title" className="mb-6">
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
