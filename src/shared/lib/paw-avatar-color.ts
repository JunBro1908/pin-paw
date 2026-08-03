/**
 * Stable per-user paw avatar colors.
 * Assignment: curated palette key from user id hash (or a stored valid key).
 * Must stay in sync with `public.paw_color_key_for_user` in migrations.
 */

export const PAW_AVATAR_COLOR_KEYS = [
  "pine",
  "honey",
  "sky",
  "coral",
  "sage",
  "teal",
  "rose",
  "slate",
] as const;

export type PawAvatarColorKey = (typeof PAW_AVATAR_COLOR_KEYS)[number];

export type PawAvatarTone = {
  key: PawAvatarColorKey;
  /** Soft circle background (Tailwind class). */
  bgClass: string;
  /** Paw icon foreground (Tailwind class). */
  fgClass: string;
};

/**
 * Brand-friendly soft fills + readable paw ink.
 * Soft greens/warm accents/blues/coral — no neon glow or default AI cliché hues.
 */
export const PAW_AVATAR_PALETTE: readonly PawAvatarTone[] = [
  { key: "pine", bgClass: "bg-[#eafbf2]", fgClass: "text-[#087a3e]" },
  { key: "honey", bgClass: "bg-[#fff1df]", fgClass: "text-[#9a4e11]" },
  { key: "sky", bgClass: "bg-[#e8f4fb]", fgClass: "text-[#2f6f8f]" },
  { key: "coral", bgClass: "bg-[#fdece8]", fgClass: "text-[#c45c4a]" },
  { key: "sage", bgClass: "bg-[#eef5ea]", fgClass: "text-[#4f6f52]" },
  { key: "teal", bgClass: "bg-[#e7f5f3]", fgClass: "text-[#28736f]" },
  { key: "rose", bgClass: "bg-[#fceef2]", fgClass: "text-[#a85a72]" },
  { key: "slate", bgClass: "bg-[#eef1f4]", fgClass: "text-[#4d5b6a]" },
] as const;

const PALETTE_BY_KEY = Object.fromEntries(
  PAW_AVATAR_PALETTE.map((tone) => [tone.key, tone])
) as Record<PawAvatarColorKey, PawAvatarTone>;

export function isPawAvatarColorKey(
  value: unknown
): value is PawAvatarColorKey {
  return (
    typeof value === "string" &&
    (PAW_AVATAR_COLOR_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Deterministic palette index from auth user id (uuid).
 * Uses the first 8 hex chars of the uuid string (before the first dash).
 */
export function pawAvatarIndexForUserId(userId: string): number {
  const hex = userId.trim().slice(0, 8);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return 0;
  // >>> 0 keeps high-bit uuid prefixes unsigned (matches SQL & 7 / % 8).
  return (n >>> 0) % PAW_AVATAR_PALETTE.length;
}

export function pawColorKeyForUserId(userId: string): PawAvatarColorKey {
  return PAW_AVATAR_PALETTE[pawAvatarIndexForUserId(userId)]!.key;
}

/**
 * Prefer a stored key when valid; otherwise hash the user id.
 * Same user id always yields the same tone across SSR/client mounts.
 */
export function resolvePawAvatarTone(
  userId: string | null | undefined,
  storedKey?: unknown
): PawAvatarTone {
  if (isPawAvatarColorKey(storedKey)) {
    return PALETTE_BY_KEY[storedKey];
  }
  if (userId && userId.trim().length >= 8) {
    return PAW_AVATAR_PALETTE[pawAvatarIndexForUserId(userId)]!;
  }
  return PALETTE_BY_KEY.pine;
}

export function resolvePawColorKey(
  userId: string | null | undefined,
  storedKey?: unknown
): PawAvatarColorKey {
  return resolvePawAvatarTone(userId, storedKey).key;
}
