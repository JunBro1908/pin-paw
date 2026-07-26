import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { SightingEditForm } from "@/features/sightings/components/SightingEditForm";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";

export default async function SightingEditPage({
  params,
}: {
  params: Promise<{ sightingId: string }>;
}) {
  const { sightingId } = await params;
  return (
    <AuthGuard>
      <Container className="py-8">
        <Text variant="title" className="mb-6 font-bold">
          제보 수정
        </Text>
        <SightingEditForm sightingId={sightingId} />
      </Container>
    </AuthGuard>
  );
}
