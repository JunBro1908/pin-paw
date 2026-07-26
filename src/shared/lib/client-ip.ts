import { isIP } from "node:net";

interface HeaderReader {
  get(name: string): string | null;
}

export function extractTrustedClientIp(
  headerList: HeaderReader,
  isVercel: boolean
): string {
  if (!isVercel) return "unknown";

  const raw =
    headerList.get("x-vercel-forwarded-for") ??
    headerList.get("x-forwarded-for") ??
    headerList.get("x-real-ip");
  const candidate = raw?.split(",")[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}
