import { createHash } from "node:crypto";

/**
 * 데이터를 SHA-256으로 해싱합니다.
 */
export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}
