import { cn } from "@/shared/lib/cn";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 일관된 모바일 레이아웃을 제공하는 컨테이너입니다.
 */
export function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-md px-5", className)}>
      {children}
    </div>
  );
}
