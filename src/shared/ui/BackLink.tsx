import Link from "next/link";
import { cn } from "@/shared/lib/cn";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared page chrome back control: 44px touch target, body-sm hierarchy
 * under page titles, calm action-primary tone.
 */
export function BackLink({ href, children, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "text-action-primary focus-visible:outline-action-primary mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className
      )}
    >
      <span aria-hidden="true" className="text-base leading-none">
        ←
      </span>
      <span>{children}</span>
    </Link>
  );
}
