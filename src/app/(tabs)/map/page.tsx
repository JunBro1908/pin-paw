import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Loading } from "@/shared/ui/Loading";

export default function MapPage() {
  return (
    <Container className="py-10">
      <Text variant="title" className="mb-4">
        지도
      </Text>
      <Text variant="body" className="mb-8">
        주변의 펫 친화 장소를 찾아보세요.
      </Text>
      <div className="bg-surface rounded-xl p-10 text-center">
        <Loading />
        <Text variant="caption">지도를 불러오는 중...</Text>
      </div>
    </Container>
  );
}
