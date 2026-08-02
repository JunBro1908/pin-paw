"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/shared/ui/Icon";

const tabs: ReadonlyArray<{
  href: string;
  label: string;
  icon: IconName;
}> = [
  { href: "/", label: "제보", icon: "report" },
  { href: "/map", label: "지도", icon: "map" },
  { href: "/recommend", label: "확인", icon: "paw" },
  { href: "/my", label: "내 활동", icon: "activity" },
];

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        메인 콘텐츠로 건너뛰기
      </a>
      <main
        id="main-content"
        className="flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)]"
        tabIndex={-1}
      >
        {children}
      </main>

      <nav
        aria-label="주요 탐색"
        className="border-border-subtle bg-surface fixed right-0 bottom-0 left-0 z-[100] border-t"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto flex h-[var(--bottom-nav-height)] max-w-md items-center justify-around">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/"
                ? pathname === "/"
                : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`focus-visible:outline-action-primary flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 px-4 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isActive ? "text-action-primary" : "text-text-caption"
                }`}
              >
                <Icon name={tab.icon} size={24} />
                <span className="text-xs font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
