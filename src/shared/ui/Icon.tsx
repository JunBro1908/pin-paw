import { cn } from "@/shared/lib/cn";

export type IconName =
  | "report"
  | "map"
  | "check"
  | "activity"
  | "camera"
  | "location"
  | "clock"
  | "paw";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 24, className }: IconProps) {
  const path = (() => {
    switch (name) {
      case "report":
        return <path d="M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h6" />;
      case "map":
        return <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15" />;
      case "check":
        return <path d="m5 12 4 4L19 6" />;
      case "activity":
        return <path d="M3 12h4l2-6 4 12 2-6h6" />;
      case "camera":
        return (
          <>
            <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
            <circle cx="12" cy="13" r="3" />
          </>
        );
      case "location":
        return <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />;
      case "clock":
        return <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />;
      case "paw":
        return (
          <path d="M12 13.5c-2.9-3.4-6.5-1.9-6.5 1.5 0 2.2 2.1 3.8 6.5 5.5 4.4-1.7 6.5-3.3 6.5-5.5 0-3.4-3.6-4.9-6.5-1.5ZM6.5 9a1.5 2 0 1 0 0-4 1.5 2 0 0 0 0 4Zm4-2A1.5 2 0 1 0 10.5 3a1.5 2 0 0 0 0 4Zm7 2A1.5 2 0 1 0 17.5 5a1.5 2 0 0 0 0 4Z" />
        );
    }
  })();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {path}
    </svg>
  );
}
