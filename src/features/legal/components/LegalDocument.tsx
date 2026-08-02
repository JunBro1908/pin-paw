import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";

type LegalSection = {
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

type LegalDocumentProps = {
  title: string;
  updatedAt: string;
  intro: string;
  sections: readonly LegalSection[];
  relatedHref: "/terms" | "/privacy";
  relatedLabel: string;
};

/**
 * 이용약관·개인정보 처리방침 등 공개 안내 문서의 공통 레이아웃.
 */
export function LegalDocument({
  title,
  updatedAt,
  intro,
  sections,
  relatedHref,
  relatedLabel,
}: LegalDocumentProps) {
  return (
    <Container className="py-10">
      <header className="mb-8">
        <Link
          href="/my"
          className="text-action-primary focus-visible:outline-action-primary mb-4 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ← 내 활동으로
        </Link>
        <Text as="h1" variant="title" className="block text-2xl">
          {title}
        </Text>
        <Text variant="caption" color="caption" className="mt-2 block">
          최종 안내일: {updatedAt} · PinPaw MVP 서비스 안내
        </Text>
        <Text variant="body" color="sub" className="mt-4 block">
          {intro}
        </Text>
      </header>

      <div className="flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-3">
            <Text as="h2" variant="title" className="block text-lg">
              {section.title}
            </Text>
            {section.paragraphs.map((paragraph) => (
              <Text
                key={paragraph}
                variant="body"
                color="sub"
                className="block leading-relaxed"
              >
                {paragraph}
              </Text>
            ))}
            {section.bullets && section.bullets.length > 0 ? (
              <ul className="text-text-sub list-disc space-y-2 pl-5 text-base leading-relaxed">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <footer className="border-border-subtle mt-12 flex flex-col gap-3 border-t pt-6 pb-8">
        <Text variant="caption" color="caption" className="block">
          본 문서는 법률 자문이 아닌 MVP 운영 안내입니다. 서비스 범위가 바뀌면
          이 페이지를 함께 갱신합니다.
        </Text>
        <Link
          href={relatedHref}
          className="text-action-primary focus-visible:outline-action-primary inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {relatedLabel}
        </Link>
      </footer>
    </Container>
  );
}
