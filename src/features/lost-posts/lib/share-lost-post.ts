export type ShareLostPostResult =
  | { ok: true; method: "native" | "clipboard" }
  | { ok: false };

export function buildLostPostShareUrl(
  lostPostId: string,
  origin = typeof window !== "undefined" ? window.location.origin : ""
): string {
  return `${origin}/share/lost-posts/${lostPostId}`;
}

/**
 * Web Share API when available; otherwise clipboard copy of the public share URL.
 */
export async function shareLostPost(
  lostPostId: string
): Promise<ShareLostPostResult> {
  const shareUrl = buildLostPostShareUrl(lostPostId);
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: "PinPaw 실종 제보",
        text: "정확한 위치와 메모는 포함되지 않습니다.",
        url: shareUrl,
      });
      return { ok: true, method: "native" };
    }
    await navigator.clipboard.writeText(shareUrl);
    return { ok: true, method: "clipboard" };
  } catch {
    return { ok: false };
  }
}
