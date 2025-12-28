import { cn } from "@/shared/lib/cn";

interface TextProps {
  children: React.ReactNode;
  variant?: "title" | "body" | "caption";
  className?: string;
}

/**
 * 텍스트 스타일을 일관되게 적용해주는 컴포넌트입니다.
 */
export function Text({ children, variant = "body", className }: TextProps) {
  const styles = {
    title: "text-xl font-bold text-text-main",
    body: "text-base text-text-sub",
    caption: "text-sm text-text-caption",
  };

  return <p className={cn(styles[variant], className)}>{children}</p>;
}
