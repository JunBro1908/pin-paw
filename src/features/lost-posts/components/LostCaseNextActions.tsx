"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";

interface LostCaseNextActionsProps {
  lostPostId: string;
}

const ACTIONS = [
  {
    href: (lostPostId: string) => `/map?lostPostId=${lostPostId}`,
    label: "지도에서 흔적 보기",
  },
  {
    href: () => "/my/notifications",
    label: "알림 확인",
  },
  {
    href: (lostPostId: string) => `/my/lost-posts/${lostPostId}`,
    label: "사건 정보 관리",
  },
] as const;

export function LostCaseNextActions({ lostPostId }: LostCaseNextActionsProps) {
  return (
    <nav aria-label="다음 행동" className="mb-6">
      <Text variant="body" className="mb-3 font-medium">
        다음으로 할 일
      </Text>
      <ul className="grid gap-2 sm:grid-cols-3">
        {ACTIONS.map((action) => (
          <li key={action.label}>
            <Link
              href={action.href(lostPostId)}
              className="border-border-subtle bg-surface text-text-main hover:bg-surface-soft focus-visible:outline-action-primary flex min-h-11 items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
