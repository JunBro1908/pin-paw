"use client";

import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { NotificationPreferencesForm } from "@/features/notifications/components/NotificationPreferencesForm";

function SettingsPageContent() {
  return (
    <Container className="py-8">
      <Link
        href="/my"
        className="text-primary mb-6 inline-block text-sm font-medium hover:underline"
      >
        ← 내정보
      </Link>
      <Text variant="title" className="mb-6">
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
