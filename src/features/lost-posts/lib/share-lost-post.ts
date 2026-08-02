export type ShareLostPostResult =
  | { ok: true; method: "native" | "clipboard" }
  | { ok: false };

export function buildLostPostShareUrl(
  lostPostId: string,
  origin = typeof window !== "undefined" ? window.location.origin : ""
): string {
  return `${origin}/share/lost-posts/${lostPostId}`;
}

export function buildLostPostShareText(petName?: string | null): string {
  const name = petName?.trim() || "강아지";
  return `${name}를 찾고 있습니다. PinPaw에 접속해서 함께해주세요.`;
}

/**
 * Web Share API when available; otherwise clipboard copy of the public share URL.
 */
export async function shareLostPost(
  lostPostId: string,
  options: { petName?: string | null } = {}
): Promise<ShareLostPostResult> {
  const shareUrl = buildLostPostShareUrl(lostPostId);
  const text = buildLostPostShareText(options.petName);
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: "PinPaw 작은 제보들이 만든 발자취",
        text,
        url: shareUrl,
      });
      return { ok: true, method: "native" };
    }
    await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
    return { ok: true, method: "clipboard" };
  } catch {
    return { ok: false };
  }
}
