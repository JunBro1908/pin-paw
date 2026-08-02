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
  | "star"
  | "user"
  | "layers"
  | "sparkle"
  | "send"
  | "info";

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
      case "user":
        return (
          <>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8" />
          </>
        );
      case "layers":
        return (
          <>
            <path d="m12 3.5 8 4.5-8 4.5-8-4.5z" />
            <path d="m4 12.5 8 4.5 8-4.5" />
            <path d="m4 16.5 8 4.5 8-4.5" />
          </>
        );
      case "sparkle":
        return (
          <path d="M12 3.5 13.4 9 19 10.5 13.4 12 12 17.5 10.6 12 5 10.5 10.6 9z" />
        );
      case "send":
        return <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />;
      case "info":
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 10v6M12 7.5h.01" />
          </>
        );
      case "paw":
        // Symmetric filled paw: twin-peak main pad + 4 toe pads
        // (inner taller/larger, outer smaller and tilted outward).
        return (
          <>
            <ellipse
              cx="5.35"
              cy="7.55"
              rx="1.85"
              ry="2.45"
              transform="rotate(-34 5.35 7.55)"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="18.65"
              cy="7.55"
              rx="1.85"
              ry="2.45"
              transform="rotate(34 18.65 7.55)"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="9.35"
              cy="4.65"
              rx="2.2"
              ry="2.8"
              fill="currentColor"
              stroke="none"
            />
            <ellipse
              cx="14.65"
              cy="4.65"
              rx="2.2"
              ry="2.8"
              fill="currentColor"
              stroke="none"
            />
            <path
              d="M12 21.75C8.15 21.75 5.45 19.2 5.45 16.3 5.45 14.35 6.6 12.85 8.5 12.2 8.2 10.9 9.3 9.55 10.75 9.55 11.55 9.55 11.95 10.05 12 10.7 12.05 10.05 12.45 9.55 13.25 9.55 14.7 9.55 15.8 10.9 15.5 12.2 17.4 12.85 18.55 14.35 18.55 16.3 18.55 19.2 15.85 21.75 12 21.75Z"
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
