import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

export default function RecommendPage() {
  return (
    <Container className="py-10">
      <Text variant="title" className="mb-4">
        추천
      </Text>
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="border-border-subtle rounded-xl border p-5"
          >
            <Text variant="body" className="font-bold">
              추천 제보 {item}
            </Text>
            <Text variant="caption" className="mb-3">
              가능성이 높은 제보입니다.
            </Text>
            <Button variant="secondary" className="w-full py-2 text-sm">
              상세보기
            </Button>
          </div>
        ))}
      </div>
    </Container>
  );
}
