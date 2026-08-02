import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { SightingForm } from "@/features/sightings/components/SightingForm";
import { AuthFeedbackBanner } from "@/features/auth/components/AuthFeedbackBanner";

/**
 * 홈 페이지: 가장 빠른 목격 제보(10초 제보) 흐름을 제공합니다.
 */
export default function HomePage() {
  return (
    <Container className="py-8">
      <header className="mb-8">
        <Text as="h1" variant="title" color="main">
          길 잃은 반려동물을 보셨나요?
        </Text>
        <Text variant="body" color="sub" className="mt-1">
          쉽고 빠른 제보들이 모여, 유실견을 따듯한 가족의 품으로 안내해줍니다.
        </Text>
      </header>

      <Suspense fallback={null}>
        <AuthFeedbackBanner />
      </Suspense>

      <SightingForm />

      <div className="mt-6 flex justify-center">
        <Link
          href="/my/lost-posts/new"
          className="text-action-primary focus-visible:outline-action-primary inline-flex min-h-11 min-w-11 flex-col items-center justify-center text-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span>반려동물을 잃어버렸나요?</span>
          <span>유실 등록하기</span>
        </Link>
      </div>

      <footer className="mt-12 pb-8 text-center">
        <Text variant="caption" className="text-text-caption">
          허위 제보 시 서비스 이용이 제한될 수 있습니다.
        </Text>
      </footer>
    </Container>
  );
}
