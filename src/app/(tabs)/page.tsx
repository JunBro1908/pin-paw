import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Divider } from "@/shared/ui/Divider";

export default function HomePage() {
  return (
    <Container className="py-10">
      <Text variant="title">홈</Text>
      <Divider />
      <Text variant="body" className="mb-6">
        PinPaw 프로젝트에 오신 것을 환영합니다.
      </Text>
      <div className="flex flex-col gap-3">
        <Button variant="primary">기본 버튼</Button>
        <Button variant="secondary">보조 버튼</Button>
      </div>
    </Container>
  );
}
