"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { authFeedbackMessage } from "@/shared/lib/oauth-return-path";

export function AuthFeedbackBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const code = searchParams.get("auth");
  const nextMessage = authFeedbackMessage(code);
  const [dismissedCode, setDismissedCode] = useState<string | null>(null);
  const [visible, setVisible] = useState<{
    code: string;
    message: string;
  } | null>(null);

  // Latch auth feedback during render so URL cleanup does not erase the alert.
  if (code && nextMessage && code !== dismissedCode && visible?.code !== code) {
    setVisible({ code, message: nextMessage });
  }

  useEffect(() => {
    if (!code || !nextMessage) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [code, nextMessage, pathname, router, searchParams]);

  const message =
    visible && visible.code !== dismissedCode ? visible.message : null;

  if (!message || !visible) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <Text
        variant="body"
        className="text-sm text-amber-900 dark:text-amber-100"
      >
        {message}
      </Text>
      <button
        type="button"
        className="mt-2 text-sm font-medium text-amber-800 underline dark:text-amber-200"
        onClick={() => setDismissedCode(visible.code)}
      >
        닫기
      </button>
    </div>
  );
}
