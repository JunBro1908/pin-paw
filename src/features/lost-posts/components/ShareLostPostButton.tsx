"use client";

import type { MouseEvent } from "react";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import { shareLostPost } from "../lib/share-lost-post";

interface ShareLostPostButtonProps {
  lostPostId: string;
  petName?: string | null;
  className?: string;
  onCopied?: () => void;
  onError?: () => void;
}

export function ShareLostPostButton({
  lostPostId,
  petName,
  className,
  onCopied,
  onError,
}: ShareLostPostButtonProps) {
  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const result = await shareLostPost(lostPostId, { petName });
    if (!result.ok) {
      onError?.();
      return;
    }
    if (result.method === "clipboard") onCopied?.();
  };

  return (
    <Button
      type="button"
      variant="quiet"
      className={cn("shrink-0", className)}
      aria-label="공유하기"
      onClick={handleClick}
    >
      <Icon name="send" size={20} />
    </Button>
  );
}
