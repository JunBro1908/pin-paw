import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-5">
      <Container className="py-10 text-center">
        <div className="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        <Text variant="caption" color="caption">
          로딩 중...
        </Text>
      </Container>
    </div>
  );
}
