import { TRAIT_TAGS_MAX } from "../constants/traitTags.ts";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SIGHTING_KEY = new RegExp(
  `^sighting_photo/\\d{8}/${UUID}\\.(?:jpg|png)$`,
  "i"
);
const LOST_COVER_KEY = new RegExp(
  `^lost_cover/\\d{8}/${UUID}\\.(?:jpg|png)$`,
  "i"
);
const UUID_VALUE = new RegExp(`^${UUID}$`, "i");

type InputResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function isValidUuid(value: string): boolean {
  return UUID_VALUE.test(value.trim());
}

function owns(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(
  value: unknown,
  maxLength: number,
  required = false
): string | null | undefined {
  if (value == null) return required ? undefined : null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    return undefined;
  }
  return normalized || null;
}

function coordinates(value: unknown): { lat: number; lng: number } | undefined {
  const input = record(value);
  if (!input) return undefined;
  const lat = input.lat;
  const lng = input.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return undefined;
  }
  return { lat, lng };
}

function dateTime(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function tags(value: unknown, maxItems: number): string[] | undefined {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.length > maxItems ||
    value.some(
      (item) => typeof item !== "string" || item.length < 1 || item.length > 64
    )
  ) {
    return undefined;
  }
  return [...new Set(value)];
}

export interface UploadRequestInput {
  purpose: "sighting_photo" | "lost_cover";
  files: Array<{
    contentType: "image/jpeg" | "image/png";
    sizeBytes: number;
  }>;
}

export function parseUploadRequest(
  value: unknown
): InputResult<UploadRequestInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };
  if (input.purpose !== "sighting_photo" && input.purpose !== "lost_cover") {
    return { ok: false, reason: "invalid_purpose" };
  }
  if (
    !Array.isArray(input.files) ||
    input.files.length < 1 ||
    input.files.length > 5
  ) {
    return { ok: false, reason: "invalid_files" };
  }

  const files: UploadRequestInput["files"] = [];
  for (const value of input.files) {
    const file = record(value);
    if (
      !file ||
      (file.contentType !== "image/jpeg" && file.contentType !== "image/png") ||
      typeof file.sizeBytes !== "number" ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 1 ||
      file.sizeBytes > MAX_FILE_SIZE
    ) {
      return { ok: false, reason: "invalid_file" };
    }
    files.push({
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    });
  }
  return { ok: true, value: { purpose: input.purpose, files } };
}

export interface SightingCreateInput {
  photoKeys: string[];
  location: { lat: number; lng: number };
  occurredAt: string;
  traitColor: string | null;
  traitSize: string | null;
  traitSpecies: string | null;
  note: string | null;
  traitTags: string[];
}

export function parseSightingCreateRequest(
  value: unknown
): InputResult<SightingCreateInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };
  const location = coordinates(input.location);
  const occurredAt = dateTime(input.occurredAt);
  const photoKeys =
    Array.isArray(input.photoKeys) &&
    input.photoKeys.length >= 1 &&
    input.photoKeys.length <= 5 &&
    input.photoKeys.every(
      (key) => typeof key === "string" && SIGHTING_KEY.test(key)
    )
      ? [...new Set(input.photoKeys)]
      : undefined;
  const traitColor = boundedString(input.traitColor, 200);
  const traitSize = boundedString(input.traitSize, 50);
  const traitSpecies = boundedString(input.traitSpecies, 100);
  const note = boundedString(input.note, 2000);
  const traitTags = tags(input.traitTags, TRAIT_TAGS_MAX);
  if (
    !location ||
    !occurredAt ||
    !photoKeys?.length ||
    traitColor === undefined ||
    traitSize === undefined ||
    traitSpecies === undefined ||
    note === undefined ||
    !traitTags
  ) {
    return { ok: false, reason: "invalid_sighting" };
  }
  return {
    ok: true,
    value: {
      photoKeys,
      location,
      occurredAt,
      traitColor,
      traitSize,
      traitSpecies,
      note,
      traitTags,
    },
  };
}

export type SightingUpdateInput = SightingCreateInput;

export function parseSightingUpdateRequest(
  value: unknown
): InputResult<SightingUpdateInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };
  const allowed = new Set([
    "photoKeys",
    "location",
    "occurredAt",
    "traitColor",
    "traitSize",
    "traitSpecies",
    "note",
    "traitTags",
  ]);
  if (
    Object.keys(input).some((key) => !allowed.has(key)) ||
    Object.keys(input).length !== allowed.size
  ) {
    return { ok: false, reason: "unknown_or_missing_field" };
  }
  return parseSightingCreateRequest(input);
}

export interface LostPostCreateInput {
  coverPhotoKey: string;
  photoKeys: string[];
  lostAt: string;
  lostLocation: { lat: number; lng: number };
  petName: string;
  traitColor: string | null;
  traitSize: string | null;
  traitSpecies: string | null;
  note: string | null;
  traitTags: string[];
}

export function parseLostPostCreateRequest(
  value: unknown
): InputResult<LostPostCreateInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };
  const requestedPhotoKeys = Array.isArray(input.photoKeys)
    ? input.photoKeys
    : typeof input.coverPhotoKey === "string"
      ? [input.coverPhotoKey]
      : [];
  const photoKeys =
    requestedPhotoKeys.length >= 1 &&
    requestedPhotoKeys.length <= 3 &&
    requestedPhotoKeys.every(
      (key) => typeof key === "string" && LOST_COVER_KEY.test(key)
    )
      ? [...new Set(requestedPhotoKeys)]
      : undefined;
  const coverPhotoKey = photoKeys?.[0];
  const lostAt = dateTime(input.lostAt);
  const lostLocation = coordinates(input.lostLocation);
  const petName = boundedString(input.petName, 80, true);
  const traitColor = boundedString(input.traitColor, 200);
  const traitSize = boundedString(input.traitSize, 50);
  const traitSpecies = boundedString(input.traitSpecies, 100);
  const note = boundedString(input.note, 2000);
  const traitTags = tags(input.traitTags, TRAIT_TAGS_MAX);
  if (
    !photoKeys?.length ||
    !lostAt ||
    !lostLocation ||
    !petName ||
    traitColor === undefined ||
    traitSize === undefined ||
    traitSpecies === undefined ||
    note === undefined ||
    !traitTags
  ) {
    return { ok: false, reason: "invalid_lost_post" };
  }
  return {
    ok: true,
    value: {
      coverPhotoKey,
      photoKeys,
      lostAt,
      lostLocation,
      petName,
      traitColor,
      traitSize,
      traitSpecies,
      note,
      traitTags,
    },
  };
}

export function parseEntityIdRequest(
  value: unknown,
  field: string
): InputResult<string> {
  const input = record(value);
  const entityId = input?.[field];
  if (typeof entityId !== "string" || !isValidUuid(entityId)) {
    return { ok: false, reason: "invalid_entity_id" };
  }
  return { ok: true, value: entityId.trim() };
}

export function parseEntityIdList(
  value: string | null,
  maxItems: number
): InputResult<string[]> {
  if (
    typeof value !== "string" ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    value.length > maxItems * 37
  ) {
    return { ok: false, reason: "invalid_entity_ids" };
  }
  const rawIds = value.split(",").map((id) => id.trim());
  if (
    rawIds.length < 1 ||
    rawIds.length > maxItems ||
    rawIds.some((id) => !isValidUuid(id))
  ) {
    return { ok: false, reason: "invalid_entity_ids" };
  }
  return { ok: true, value: [...new Set(rawIds)] };
}

export interface ModerationInput {
  hidden: boolean;
  reason: string;
}

export function parseModerationRequest(
  value: unknown
): InputResult<ModerationInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };
  if (input.hidden !== true && input.hidden !== false) {
    return { ok: false, reason: "invalid_hidden_state" };
  }
  const reason = boundedString(input.reason, 500, true);
  if (!reason) return { ok: false, reason: "invalid_reason" };
  if (Object.keys(input).some((key) => key !== "hidden" && key !== "reason")) {
    return { ok: false, reason: "unknown_field" };
  }
  return { ok: true, value: { hidden: input.hidden, reason } };
}

export const REPORT_CATEGORIES = [
  "immediate_danger",
  "animal_abuse",
  "personal_information",
  "spam",
  "misleading",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_STATUSES = [
  "open",
  "reviewing",
  "resolved",
  "rejected",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

function isReportCategory(value: unknown): value is ReportCategory {
  return (
    typeof value === "string" &&
    REPORT_CATEGORIES.some((category) => category === value)
  );
}

function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" &&
    REPORT_STATUSES.some((status) => status === value)
  );
}

export function parseReportRequest(
  value: unknown
): InputResult<{ category: ReportCategory; reason: string }> {
  const input = record(value);
  if (!input || !isReportCategory(input.category)) {
    return { ok: false, reason: "invalid_report_category" };
  }
  const reason = boundedString(input.reason, 1000, true);
  if (!reason) return { ok: false, reason: "invalid_report_reason" };
  if (
    Object.keys(input).some((key) => key !== "category" && key !== "reason")
  ) {
    return { ok: false, reason: "unknown_field" };
  }
  return { ok: true, value: { category: input.category, reason } };
}

export function parseBlockRequest(
  value: unknown
): InputResult<{ blocked: boolean }> {
  const input = record(value);
  if (
    !input ||
    (input.blocked !== true && input.blocked !== false) ||
    Object.keys(input).some((key) => key !== "blocked")
  ) {
    return { ok: false, reason: "invalid_block_request" };
  }
  return { ok: true, value: { blocked: input.blocked } };
}

export function parseAccountDeletionRequest(
  value: unknown
): InputResult<{ confirmation: "DELETE" }> {
  const input = record(value);
  if (
    !input ||
    input.confirmation !== "DELETE" ||
    Object.keys(input).some((key) => key !== "confirmation")
  ) {
    return { ok: false, reason: "invalid_account_deletion_confirmation" };
  }
  return { ok: true, value: { confirmation: "DELETE" } };
}

export function parseAdminReportUpdateRequest(value: unknown): InputResult<{
  status: ReportStatus;
  reason: string;
  hidden?: boolean;
}> {
  const input = record(value);
  if (!input || !isReportStatus(input.status)) {
    return { ok: false, reason: "invalid_report_status" };
  }
  const reason = boundedString(input.reason, 500, true);
  if (!reason) return { ok: false, reason: "invalid_reason" };
  if (
    owns(input, "hidden") &&
    input.hidden !== true &&
    input.hidden !== false
  ) {
    return { ok: false, reason: "invalid_hidden_state" };
  }
  if (
    Object.keys(input).some(
      (key) => key !== "status" && key !== "reason" && key !== "hidden"
    )
  ) {
    return { ok: false, reason: "unknown_field" };
  }
  return {
    ok: true,
    value: {
      status: input.status,
      reason,
      ...(owns(input, "hidden") ? { hidden: input.hidden as boolean } : {}),
    },
  };
}

export function parseReportStatus(
  value: string | null
): InputResult<ReportStatus | null> {
  if (value === null) return { ok: true, value: null };
  return isReportStatus(value)
    ? { ok: true, value }
    : { ok: false, reason: "invalid_report_status" };
}

export interface LostPostUpdateInput {
  status?: "searching" | "found" | "closed";
  petName?: string;
  traitColor?: string | null;
  traitSize?: string | null;
  traitSpecies?: string | null;
  traitTags?: string[];
  note?: string | null;
  coverPhotoKey?: string;
  photoKeys?: string[];
}

export function parseLostPostUpdateRequest(
  value: unknown
): InputResult<LostPostUpdateInput> {
  const input = record(value);
  if (!input) return { ok: false, reason: "invalid_body" };

  const result: LostPostUpdateInput = {};
  if (owns(input, "status")) {
    if (
      input.status !== "searching" &&
      input.status !== "found" &&
      input.status !== "closed"
    ) {
      return { ok: false, reason: "invalid_status" };
    }
    result.status = input.status;
  }
  if (owns(input, "petName")) {
    const petName = boundedString(input.petName, 80, true);
    if (!petName) return { ok: false, reason: "invalid_pet_name" };
    result.petName = petName;
  }

  const optionalStrings = [
    ["traitColor", 200],
    ["traitSize", 50],
    ["traitSpecies", 100],
    ["note", 2000],
  ] as const;
  for (const [key, maxLength] of optionalStrings) {
    if (!owns(input, key)) continue;
    const parsed = boundedString(input[key], maxLength);
    if (parsed === undefined) {
      return { ok: false, reason: `invalid_${key}` };
    }
    result[key] = parsed;
  }

  if (owns(input, "traitTags")) {
    const traitTags = tags(input.traitTags, TRAIT_TAGS_MAX);
    if (!traitTags) return { ok: false, reason: "invalid_trait_tags" };
    result.traitTags = traitTags;
  }

  if (owns(input, "coverPhotoKey")) {
    if (
      typeof input.coverPhotoKey !== "string" ||
      !LOST_COVER_KEY.test(input.coverPhotoKey)
    ) {
      return { ok: false, reason: "invalid_cover_photo_key" };
    }
    result.coverPhotoKey = input.coverPhotoKey;
  }

  if (owns(input, "photoKeys")) {
    if (
      !Array.isArray(input.photoKeys) ||
      input.photoKeys.length < 1 ||
      input.photoKeys.length > 3 ||
      input.photoKeys.some(
        (key) => typeof key !== "string" || !LOST_COVER_KEY.test(key)
      )
    ) {
      return { ok: false, reason: "invalid_photo_keys" };
    }
    const photoKeys = [...new Set(input.photoKeys)];
    if (photoKeys.length !== input.photoKeys.length) {
      return { ok: false, reason: "duplicate_photo_keys" };
    }
    result.photoKeys = photoKeys;
  }

  if (
    result.coverPhotoKey !== undefined &&
    result.photoKeys !== undefined &&
    result.coverPhotoKey !== result.photoKeys[0]
  ) {
    return { ok: false, reason: "cover_photo_must_match_first_photo" };
  }

  return { ok: true, value: result };
}

function strictInteger(value: string | null): number | undefined {
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function strictNumber(value: string | null): number | undefined {
  if (value === null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parsePagination(
  limitValue: string | null,
  offsetValue: string | null,
  defaultLimit: number,
  maxLimit: number
): InputResult<{ limit: number; offset: number }> {
  const limit = limitValue === null ? defaultLimit : strictInteger(limitValue);
  const offset = offsetValue === null ? 0 : strictInteger(offsetValue);
  if (
    !Number.isSafeInteger(defaultLimit) ||
    !Number.isSafeInteger(maxLimit) ||
    defaultLimit < 1 ||
    maxLimit < defaultLimit ||
    limit === undefined ||
    limit < 1 ||
    limit > maxLimit ||
    offset === undefined
  ) {
    return { ok: false, reason: "invalid_pagination" };
  }
  return { ok: true, value: { limit, offset } };
}

interface RecommendationQueryInput {
  lostPostId: string | null;
  radiusKm: string | null;
  days: string | null;
  topK: string | null;
}

export function parseRecommendationQuery(
  input: RecommendationQueryInput
): InputResult<{
  lostPostId: string;
  radiusKm: number;
  days: number;
  topK: number;
}> {
  if (!input.lostPostId || !isValidUuid(input.lostPostId)) {
    return { ok: false, reason: "invalid_lost_post_id" };
  }
  const radiusKm = input.radiusKm === null ? 8 : strictNumber(input.radiusKm);
  const days = input.days === null ? 8 : strictNumber(input.days);
  const topK = input.topK === null ? 10 : strictInteger(input.topK);
  if (
    radiusKm === undefined ||
    radiusKm < 0.1 ||
    radiusKm > 100 ||
    days === undefined ||
    days < 1 ||
    days > 365 ||
    topK === undefined ||
    topK < 1 ||
    topK > 50
  ) {
    return { ok: false, reason: "invalid_recommendation_range" };
  }
  return {
    ok: true,
    value: {
      lostPostId: input.lostPostId.trim(),
      radiusKm,
      days,
      topK,
    },
  };
}
