import { cn } from "@/shared/lib/cn";

export type IconName =
  | "report"
  | "map"
  | "check"
  | "activity"
  | "camera"
  | "location"
  | "clock"
  | "paw"
  | "star";

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
      case "star":
        return (
          <path
            d="M12 3.6 14.4 9l5.8.5-4.4 3.8 1.3 5.6L12 16.2 6.9 18.9l1.3-5.6L3.8 9.5 9.6 9 12 3.6Z"
            fill="currentColor"
            stroke="none"
          />
        );
      case "paw":
        // Symmetric filled paw: 4 toes + main pad, mirrored on the vertical axis.
        return (
          <>
            <ellipse
              cx="7"
              cy="7.2"
              rx="2.15"
              ry="2.7"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="17"
              cy="7.2"
              rx="2.15"
              ry="2.7"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="9.6"
              cy="4.6"
              rx="2.05"
              ry="2.55"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="14.4"
              cy="4.6"
              rx="2.05"
              ry="2.55"
              fill="currentColor"
              stroke="none"
            />
            <path
              d="M12 21.2c-3.55 0-6.1-2.2-6.1-4.85 0-2.45 2.05-4.05 6.1-4.05s6.1 1.6 6.1 4.05c0 2.65-2.55 4.85-6.1 4.85Z"
              fill="currentColor"
              stroke="none"
            />
          </>
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
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {path}
    </svg>
  );
}
