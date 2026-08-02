type UnknownRecord = Record<string, unknown>;

type MonitoringEvent = UnknownRecord & {
  message?: string;
  request?: UnknownRecord;
  user?: unknown;
  extra?: unknown;
  logentry?: unknown;
  contexts?: UnknownRecord;
  tags?: UnknownRecord;
  transaction?: string;
  exception?: {
    values?: Array<UnknownRecord>;
  };
  breadcrumbs?: Array<UnknownRecord>;
};

type MonitoringSpan = UnknownRecord & {
  description?: string;
  data?: UnknownRecord;
};

const GENERIC_ERROR_MESSAGE = "Application error";
const SAFE_CONTEXT_KEYS = new Set([
  "app",
  "browser",
  "device",
  "os",
  "runtime",
]);
const SAFE_TAG_KEYS = new Set([
  "boundary",
  "digest",
  "event",
  "requestId",
  "route",
  "status",
]);
const SAFE_SPAN_DATA_KEYS = new Set([
  "db.operation.name",
  "db.system",
  "http.method",
  "http.request.method",
  "http.response.status_code",
  "http.status_code",
  "http.target",
  "http.url",
  "rpc.method",
  "rpc.system",
  "server.address",
  "url.full",
]);
const URL_DATA_KEYS = new Set(["http.target", "http.url", "url.full"]);

function stripUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, value.endsWith("/") ? "/" : "");
  } catch {
    const queryIndex = value.indexOf("?");
    const hashIndex = value.indexOf("#");
    const cutoff = Math.min(
      queryIndex === -1 ? value.length : queryIndex,
      hashIndex === -1 ? value.length : hashIndex
    );
    return value.slice(0, cutoff);
  }
}

function stripUrlsFromDescription(value: string): string {
  return value.replace(/https?:\/\/[^\s]+/g, (url) => stripUrlQuery(url));
}

function selectKeys(
  source: UnknownRecord | undefined,
  allowed: Set<string>
): UnknownRecord | undefined {
  if (!source) return undefined;
  const selected = Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key))
  );
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function sanitizeBreadcrumb(breadcrumb: UnknownRecord): UnknownRecord {
  const result: UnknownRecord = {};
  for (const key of ["category", "level", "timestamp", "type"]) {
    if (breadcrumb[key] !== undefined) result[key] = breadcrumb[key];
  }

  if (breadcrumb.data && typeof breadcrumb.data === "object") {
    const data = breadcrumb.data as UnknownRecord;
    const safeData: UnknownRecord = {};
    for (const key of ["method", "status_code"]) {
      if (data[key] !== undefined) safeData[key] = data[key];
    }
    if (typeof data.url === "string") {
      safeData.url = stripUrlQuery(data.url);
    }
    if (Object.keys(safeData).length > 0) result.data = safeData;
  }

  return result;
}

export function sanitizeMonitoringEvent<T extends object>(event: T): T {
  const source = event as unknown as MonitoringEvent;
  const sanitized: MonitoringEvent = { ...source };

  if (source.message !== undefined) sanitized.message = GENERIC_ERROR_MESSAGE;
  if (source.transaction) {
    sanitized.transaction = stripUrlsFromDescription(source.transaction);
  }

  if (source.request) {
    const request: UnknownRecord = {};
    if (typeof source.request.url === "string") {
      request.url = stripUrlQuery(source.request.url);
    }
    if (typeof source.request.method === "string") {
      request.method = source.request.method;
    }
    sanitized.request = request;
  }

  if (source.exception?.values) {
    sanitized.exception = {
      ...source.exception,
      values: source.exception.values.map((value) => ({
        ...value,
        value: GENERIC_ERROR_MESSAGE,
      })),
    };
  }

  sanitized.breadcrumbs = source.breadcrumbs?.map(sanitizeBreadcrumb);
  sanitized.contexts = selectKeys(source.contexts, SAFE_CONTEXT_KEYS);
  sanitized.tags = selectKeys(source.tags, SAFE_TAG_KEYS);

  delete sanitized.user;
  delete sanitized.extra;
  delete sanitized.logentry;
  delete sanitized.fingerprint;

  return sanitized as T;
}

export function sanitizeMonitoringSpan<T extends object>(span: T): T {
  const source = span as unknown as MonitoringSpan;
  const sanitized: MonitoringSpan = { ...source };
  if (source.description) {
    sanitized.description = stripUrlsFromDescription(source.description);
  }

  if (source.data) {
    sanitized.data = Object.fromEntries(
      Object.entries(source.data)
        .filter(([key]) => SAFE_SPAN_DATA_KEYS.has(key))
        .map(([key, value]) => [
          key,
          URL_DATA_KEYS.has(key) && typeof value === "string"
            ? stripUrlQuery(value)
            : value,
        ])
    );
  }

  return sanitized as T;
}
