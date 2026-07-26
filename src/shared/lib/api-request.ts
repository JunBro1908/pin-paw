export const API_JSON_BODY_MAX_BYTES = 64 * 1024;

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason: "body_too_large" | "invalid_json";
    };

function declaredBodyLength(request: Request): number | undefined {
  const header = request.headers.get("content-length");
  if (header === null) return undefined;
  if (!/^(?:0|[1-9]\d*)$/.test(header)) return Number.NaN;
  const parsed = Number(header);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export async function readJsonBody(
  request: Request,
  maxBytes = API_JSON_BODY_MAX_BYTES
): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return { ok: false, reason: "invalid_json" };
  }

  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== undefined) {
    if (!Number.isFinite(declaredLength)) {
      return { ok: false, reason: "invalid_json" };
    }
    if (declaredLength > maxBytes) {
      return { ok: false, reason: "body_too_large" };
    }
  }
  if (!request.body) return { ok: false, reason: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "body_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (totalBytes === 0) return { ok: false, reason: "invalid_json" };
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
