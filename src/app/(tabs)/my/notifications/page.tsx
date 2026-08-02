"use client";

import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { NotificationList } from "@/features/notifications/components/NotificationList";

function NotificationsPageContent() {
  return (
    <Container className="py-8">
      <BackLink href="/my">내 정보</BackLink>
      <Text as="h1" variant="title" color="main" className="mb-4">
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
