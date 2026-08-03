import { cn } from "@/shared/lib/cn";
import {
  resolvePawAvatarTone,
  type PawAvatarColorKey,
} from "@/shared/lib/paw-avatar-color";
import { Icon } from "@/shared/ui/Icon";

type PawAvatarSize = "md" | "lg";

const SIZE_CLASS: Record<PawAvatarSize, string> = {
  md: "h-14 w-14",
  lg: "h-16 w-16",
};

const ICON_SIZE: Record<PawAvatarSize, number> = {
  md: 28,
  lg: 32,
};

type PawAvatarProps = {
  userId: string | null | undefined;
  /** Optional persisted key (user_metadata / profile). Invalid values fall back to id hash. */
  colorKey?: PawAvatarColorKey | string | null;
  size?: PawAvatarSize;
  className?: string;
};

export function PawAvatar({
  userId,
  colorKey,
  size = "md",
  className,
}: PawAvatarProps) {
  const tone = resolvePawAvatarTone(userId, colorKey);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        SIZE_CLASS[size],
        tone.bgClass,
        tone.fgClass,
        className
      )}
      aria-hidden
      data-paw-color={tone.key}
    >
      <Icon name="paw" size={ICON_SIZE[size]} className="shrink-0" />
    </div>
  );
}
