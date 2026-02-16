"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { LostPostList } from "@/features/lost-posts/components/LostPostList";

function LostPostsPageContent() {
  return (
    <Container className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <Text variant="title">내 유실글</Text>
        <Link href="/my/lost-posts/new">
          <Button variant="primary">+ 등록</Button>
        </Link>
      </div>
      <LostPostList />
    </Container>
  );
}

export default function LostPostsPage() {
  return (
    <AuthGuard>
      <LostPostsPageContent />
    </AuthGuard>
  );
}
