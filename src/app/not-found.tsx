import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5">
      <Container className="py-10 text-center">
        <Text variant="title" className="mb-2 block">
          페이지를 찾을 수 없어요
        </Text>
        <Text variant="body" color="caption" className="mb-6 block">
          주소가 잘못되었거나 페이지가 이동했을 수 있습니다.
        </Text>
        <Link href="/">
          <Button variant="primary">홈으로 돌아가기</Button>
        </Link>
      </Container>
    </div>
  );
}
