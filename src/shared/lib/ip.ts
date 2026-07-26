import { headers } from "next/headers";
import { extractTrustedClientIp } from "./client-ip";

/**
 * 클라이언트 IP 주소를 안전하게 추출합니다.
 */
export async function getClientIp() {
  const headerList = await headers();
  return extractTrustedClientIp(headerList, process.env.VERCEL === "1");
}
