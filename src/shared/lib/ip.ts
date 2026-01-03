import { headers } from "next/headers";

/**
 * 클라이언트 IP 주소를 안전하게 추출합니다.
 */
export async function getClientIp() {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const realIp = headerList.get("x-real-ip");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return realIp || "unknown";
}
