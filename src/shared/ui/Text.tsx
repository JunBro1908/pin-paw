import { cn } from "@/shared/lib/cn";

interface TextProps extends React.ComponentPropsWithoutRef<"p"> {
  variant?: "title" | "body" | "caption";
  color?: "main" | "sub" | "caption" | "error" | "primary";
}

/**
 * 텍스트 스타일을 일관되게 적용해주는 컴포넌트입니다.
 */
export function Text({
  children,
  variant = "body",
  color,
  className,
  ...props
}: TextProps) {
  const variantStyles = {
    title: "text-xl font-bold",
    body: "text-base",
    caption: "text-sm",
  };

  const colorStyles = {
    main: "text-text-main",
    sub: "text-text-sub",
    caption: "text-text-caption",
    error: "text-error",
    primary: "text-primary",
  };

  // variant의 기본 색상을 정의합니다.
  const defaultColors = {
    title: "text-text-main",
    body: "text-text-sub",
    caption: "text-text-caption",
  };

  const finalColorStyle = color ? colorStyles[color] : defaultColors[variant];

  return (
    <p
      className={cn(variantStyles[variant], finalColorStyle, className)}
      {...props}
    >
      {children}
    </p>
  );
}
