import Link from "next/link";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Text variant="title" className="block">
          페이지를 찾을 수 없어요
        </Text>
        <Text variant="body" color="caption" className="block">
          주소가 잘못되었거나 페이지가 이동했을 수 있습니다.
        </Text>
        <Link href="/" className="flex justify-center">
          <Button variant="primary" className="min-w-[140px]">
            홈으로 돌아가기
          </Button>
        </Link>
      </div>
    </div>
  );
}
