import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { SightingForm } from "@/features/sightings/components/SightingForm";

/**
 * 홈 페이지: 가장 빠른 목격 제보(10초 제보) 흐름을 제공합니다.
 */
export default function HomePage() {
  return (
    <Container className="py-8">
      <header className="mb-8">
        <Text variant="title" className="text-2xl">
          목격 제보
        </Text>
        <Text variant="body" className="mt-1 opacity-70">
          방금 유실된 반려동물을 보셨나요? 빠르게 알려주세요.
        </Text>
      </header>

      {/* 제보 폼 섹션 */}
      <SightingForm />

      {/* 하단 안내 문구 */}
      <footer className="mt-12 pb-8 text-center">
        <Text variant="caption" className="text-text-caption">
          허위 제보 시 서비스 이용이 제한될 수 있습니다.
        </Text>
      </footer>
    </Container>
  );
}
