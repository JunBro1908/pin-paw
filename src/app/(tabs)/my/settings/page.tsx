"use client";

import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { NotificationPreferencesForm } from "@/features/notifications/components/NotificationPreferencesForm";

function SettingsPageContent() {
  return (
    <Container className="py-8">
      <BackLink href="/my">내 정보</BackLink>
      <Text as="h1" variant="title" color="main" className="mb-6">
        설정
      </Text>
      <NotificationPreferencesForm />
    </Container>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsPageContent />
    </AuthGuard>
  );
}
