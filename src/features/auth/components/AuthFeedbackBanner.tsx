"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { authFeedbackMessage } from "@/shared/lib/oauth-return-path";

export function AuthFeedbackBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("auth");
    const nextMessage = authFeedbackMessage(code);
    if (!nextMessage) return;

    setMessage(nextMessage);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <Text variant="body" className="text-sm text-amber-900 dark:text-amber-100">
        {message}
      </Text>
      <button
        type="button"
        className="mt-2 text-sm font-medium text-amber-800 underline dark:text-amber-200"
        onClick={() => setMessage(null)}
      >
        닫기
      </button>
    </div>
  );
}
