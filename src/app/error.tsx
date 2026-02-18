"use client";

import { useEffect } from "react";
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Text variant="title" className="block">
          문제가 발생했어요
        </Text>
        <Text variant="body" color="caption" className="block">
          잠시 후 다시 시도해 주세요.
        </Text>
        <Button variant="primary" onClick={reset} className="min-w-[140px]">
          다시 시도
        </Button>
      </div>
    </div>
  );
}
