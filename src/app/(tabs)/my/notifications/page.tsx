"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { NotificationList } from "@/features/notifications/components/NotificationList";

function NotificationsPageContent() {
  return (
    <Container className="py-8">
      <Link
        href="/my"
        className="text-primary mb-6 inline-block text-sm font-medium hover:underline"
      >
        ← 내정보
      </Link>
      <Text variant="title" className="mb-4">
        알림
      </Text>
      <NotificationList />
    </Container>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsPageContent />
    </AuthGuard>
  );
}
