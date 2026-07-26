"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 내 유실글 목록은 내정보(My) 페이지에 인라인으로 표시되므로,
 * /my/lost-posts 진입 시 /my로 리다이렉트하여 뎁스를 줄입니다.
 */
export default function LostPostsIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my");
  }, [router]);
  return null;
}
