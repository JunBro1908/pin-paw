"use client";

import { useEffect } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error Boundary]", error.message, error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5">
      <Container className="py-10 text-center">
        <Text variant="title" className="mb-2 block">
          문제가 발생했어요
        </Text>
        <Text variant="body" color="caption" className="mb-6 block">
          잠시 후 다시 시도해 주세요.
        </Text>
        <Button variant="primary" onClick={reset}>
          다시 시도
        </Button>
      </Container>
    </div>
  );
}
