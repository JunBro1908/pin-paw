import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { LostPostEditForm } from "@/features/lost-posts/components/LostPostEditForm";
import { BackLink } from "@/shared/ui/BackLink";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";

export default async function LostPostEditPage({
  params,
}: {
  params: Promise<{ lostPostId: string }>;
}) {
  const { lostPostId } = await params;
  return (
    <AuthGuard>
      <Container className="py-8">
        <BackLink href="/my">내 정보</BackLink>
        <Text variant="title" className="mb-6 font-bold">
          유실글 수정
        </Text>
        <LostPostEditForm lostPostId={lostPostId} />
      </Container>
    </AuthGuard>
  );
}
