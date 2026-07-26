export interface UploadIntent {
  uploadUrl: string;
  fileKey: string;
  uploaded: boolean;
}

export interface FormSubmissionAttempt {
  payloadFingerprint: string;
  uploadIdempotencyKey: string;
  submissionIdempotencyKey: string;
  uploadIntent: UploadIntent | null;
}

type CreateUuid = () => string;

export async function fingerprintUploadFile(
  file: Blob & { name?: string; lastModified?: number }
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return JSON.stringify({
    name: file.name ?? "",
    type: file.type,
    size: file.size,
    lastModified: file.lastModified ?? 0,
    sha256: hash,
  });
}

export function prepareSubmission(
  current: FormSubmissionAttempt | null,
  payloadFingerprint: string,
  createUuid: CreateUuid
): FormSubmissionAttempt {
  if (current?.payloadFingerprint === payloadFingerprint) {
    return current;
  }

  return {
    payloadFingerprint,
    uploadIdempotencyKey: createUuid(),
    submissionIdempotencyKey: createUuid(),
    uploadIntent: null,
  };
}

export function rememberUploadIntent(
  current: FormSubmissionAttempt,
  intent: Omit<UploadIntent, "uploaded"> &
    Partial<Pick<UploadIntent, "uploaded">>
): FormSubmissionAttempt {
  return {
    ...current,
    uploadIntent: {
      ...intent,
      uploaded: intent.uploaded ?? false,
    },
  };
}

export function markUploadCompleted(
  current: FormSubmissionAttempt
): FormSubmissionAttempt {
  if (!current.uploadIntent) {
    throw new Error("Upload intent is not prepared.");
  }

  return {
    ...current,
    uploadIntent: { ...current.uploadIntent, uploaded: true },
  };
}

export function completeSubmission(): FormSubmissionAttempt | null {
  return null;
}

export function startNewSubmission(): FormSubmissionAttempt | null {
  return null;
}
