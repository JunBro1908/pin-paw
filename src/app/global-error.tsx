"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "global" },
    });
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main className="flex min-h-screen items-center justify-center px-5 text-center">
          <div>
            <h1 className="text-xl font-semibold">문제가 발생했어요</h1>
            <p className="mt-3 text-sm text-gray-600">
              잠시 후 페이지를 새로고침해 주세요.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
