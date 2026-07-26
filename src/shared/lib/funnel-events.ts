const FUNNEL_EVENT_NAMES = [
  "lost_post_created",
  "recommendation_viewed",
  "sighting_claimed",
  "lost_post_closed",
  "share_link_opened",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

const FORBIDDEN_PROPERTY_KEYS = [
  "lat",
  "lng",
  "location",
  "note",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "photo_keys",
  "cover_photo_key",
  "email",
  "phone",
] as const;

export type FunnelEventInput = {
  name: FunnelEventName;
  lostPostId?: string | null;
  sightingId?: string | null;
  properties?: Record<string, string | number | boolean | null>;
};

export type ParsedFunnelEvent = {
  name: FunnelEventName;
  lostPostId: string | null;
  sightingId: string | null;
  properties: Record<string, string | number | boolean | null>;
};

type ParseResult =
  | { ok: true; value: ParsedFunnelEvent }
  | { ok: false; reason: string };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * first-party 퍼널 이벤트 입력 검증.
 * raw 위치·note·token 등 민감 속성은 거부한다 (수집 0).
 */
export function parseFunnelEvent(input: unknown): ParseResult {
  if (!isPlainObject(input)) {
    return { ok: false, reason: "invalid_body" };
  }

  const name = input.name;
  if (
    typeof name !== "string" ||
    !(FUNNEL_EVENT_NAMES as readonly string[]).includes(name)
  ) {
    return { ok: false, reason: "invalid_event_name" };
  }

  let lostPostId: string | null = null;
  if (input.lostPostId != null) {
    if (typeof input.lostPostId !== "string" || !UUID.test(input.lostPostId)) {
      return { ok: false, reason: "invalid_lost_post_id" };
    }
    lostPostId = input.lostPostId;
  }

  let sightingId: string | null = null;
  if (input.sightingId != null) {
    if (typeof input.sightingId !== "string" || !UUID.test(input.sightingId)) {
      return { ok: false, reason: "invalid_sighting_id" };
    }
    sightingId = input.sightingId;
  }

  const properties: Record<string, string | number | boolean | null> = {};
  if (input.properties != null) {
    if (!isPlainObject(input.properties)) {
      return { ok: false, reason: "invalid_properties" };
    }
    const keys = Object.keys(input.properties);
    if (keys.length > 16) {
      return { ok: false, reason: "too_many_properties" };
    }
    for (const key of keys) {
      if (
        key.length > 64 ||
        (FORBIDDEN_PROPERTY_KEYS as readonly string[]).includes(key) ||
        /lat|lng|location|note|token|secret|password/i.test(key)
      ) {
        return { ok: false, reason: `forbidden_property:${key}` };
      }
      const value = input.properties[key];
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        return { ok: false, reason: `invalid_property_value:${key}` };
      }
      if (typeof value === "string" && value.length > 128) {
        return { ok: false, reason: `property_too_long:${key}` };
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        return { ok: false, reason: `invalid_property_value:${key}` };
      }
      properties[key] = value;
    }
  }

  return {
    ok: true,
    value: {
      name: name as FunnelEventName,
      lostPostId,
      sightingId,
      properties,
    },
  };
}

export function isFunnelOptOutEnabled(
  preferences: { analyticsOptIn?: boolean } | null | undefined
): boolean {
  return preferences?.analyticsOptIn === false;
}
