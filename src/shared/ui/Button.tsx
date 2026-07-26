import { cn } from "@/shared/lib/cn";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
}

/**
 * 프로젝트 전용 공통 버튼 컴포넌트입니다.
 */
export function Button({
  children,
  variant,
  isLoading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "flex items-center justify-center rounded-lg px-4 py-3 font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  const variants = {
    primary: "bg-primary text-white",
    secondary: "bg-primary-soft text-primary",
  };

  const variantStyles = variant ? variants[variant] : "";

  return (
    <button
      className={cn(baseStyles, variantStyles, className)}
      disabled={disabled || isLoading}
      aria-busy={Boolean(isLoading)}
      {...props}
    >
      {isLoading ? (
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        children
      )}
      {isLoading ? <span className="sr-only" aria-live="polite">로딩 중</span> : null}
    </button>
  );
}
