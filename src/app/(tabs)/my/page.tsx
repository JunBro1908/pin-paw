import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Divider } from "@/shared/ui/Divider";

export default function MyPage() {
  return (
    <Container className="py-10">
      <Text variant="title">내 정보</Text>
      <Divider />
      <div className="mb-8 flex items-center gap-4">
        <div className="bg-primary-soft h-16 w-16 rounded-full" />
        <div>
          <Text variant="body" className="font-bold">
            사용자님
          </Text>
          <Text variant="caption">user@example.com</Text>
        </div>
      </div>
      <Button variant="primary" className="w-full" disabled>
        프로필 수정하기 (준비 중)
      </Button>
    </Container>
  );
}
