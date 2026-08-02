import * as Sentry from "@sentry/nextjs";

export type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;
type LogSink = (level: LogLevel, line: string) => void;
type ErrorReporter = (
  error: unknown,
  event: string,
  context: Record<string, SafeLogValue>
) => void;
type SafeLogValue =
  | string
  | number
  | boolean
  | null
  | SafeLogValue[]
  | { [key: string]: SafeLogValue };

export type ApiRouteClass =
  | "public.read"
  | "public.write"
  | "member.read"
  | "member.write"
  | "admin.read"
  | "admin.write"
  | "internal.read"
  | "internal.write"
  | "health.read";

export interface ApiObservation {
  routeClass: ApiRouteClass;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  status: number;
  durationMs: number;
}

interface ApiSpan {
  setAttribute?(key: string, value: string | number): void;
}

type ApiTrace = <T>(
  context: {
    name: string;
    op: "http.server";
    attributes: Record<string, string>;
  },
  callback: (span?: ApiSpan) => Promise<T>
) => Promise<T>;

const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;
const REDACTED = "[REDACTED]";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "password",
  "apikey",
  "servicekey",
  "note",
  "lat",
  "latitude",
  "lng",
  "longitude",
  "location",
  "coordinates",
  "ip",
  "stack",
  "message",
  "details",
  "hint",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeString(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, MAX_STRING_LENGTH);
}

function safeError(value: unknown): { name: string; code?: string } {
  if (!value || typeof value !== "object") {
    return { name: "UnknownError" };
  }

  const record = value as Record<string, unknown>;
  const name =
    typeof record.name === "string" && record.name
      ? safeString(record.name)
      : value instanceof Error
        ? safeString(value.name)
        : "UnknownError";
  const code =
    typeof record.code === "string" && record.code
      ? safeString(record.code)
      : undefined;

  return code ? { name, code } : { name };
}

function sanitizeValue(
  key: string,
  value: unknown,
  depth: number
): SafeLogValue {
  const normalized = normalizedKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return REDACTED;
  if (normalized === "error" || normalized === "cause") {
    return safeError(value);
  }
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return safeString(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return safeError(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue("", item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitizeValue(nestedKey, nestedValue, depth + 1),
        ])
    );
  }

  return null;
}

export function createStructuredLogEntry(
  level: LogLevel,
  event: string,
  context: LogContext = {}
): Record<string, SafeLogValue> {
  return {
    ...Object.fromEntries(
      Object.entries(context)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, value]) => [key, sanitizeValue(key, value, 0)])
    ),
    timestamp: new Date().toISOString(),
    level,
    event: safeString(event),
  };
}

function defaultLogSink(level: LogLevel, line: string): void {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

function defaultErrorReporter(
  error: unknown,
  event: string,
  context: Record<string, SafeLogValue>
): void {
  Sentry.captureException(error, {
    tags: {
      event,
      ...(typeof context.requestId === "string"
        ? { requestId: context.requestId }
        : {}),
      ...(typeof context.route === "string" ? { route: context.route } : {}),
      ...(typeof context.status === "number" ? { status: context.status } : {}),
    },
  });
}

export interface StructuredLogger {
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
}

export function createLogger(
  baseContext: LogContext = {},
  sink: LogSink = defaultLogSink,
  errorReporter: ErrorReporter | undefined = sink === defaultLogSink
    ? defaultErrorReporter
    : undefined
): StructuredLogger {
  const write = (level: LogLevel, event: string, context: LogContext = {}) => {
    const entry = createStructuredLogEntry(level, event, {
      ...context,
      ...baseContext,
    });
    sink(level, JSON.stringify(entry));
    if (level === "error" && errorReporter) {
      try {
        errorReporter(context.error ?? new Error(event), event, entry);
      } catch {
        // Monitoring must never change the API response path.
      }
    }
  };

  return {
    info(event: string, context?: LogContext) {
      write("info", event, context);
    },
    warn(event: string, context?: LogContext) {
      write("warn", event, context);
    },
    error(event: string, context?: LogContext) {
      write("error", event, context);
    },
  };
}

export function createRequestLogger(
  request: Pick<Request, "headers">,
  route: string,
  sink: LogSink = defaultLogSink,
  errorReporter?: ErrorReporter
) {
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId =
    suppliedRequestId && UUID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  const logger = createLogger(
    { requestId, route },
    sink,
    errorReporter ??
      (sink === defaultLogSink ? defaultErrorReporter : undefined)
  );

  return {
    requestId,
    ...logger,
  };
}

const API_METHODS = new Set<ApiObservation["method"]>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const defaultApiTrace: ApiTrace = (context, callback) =>
  Sentry.startSpan(context, callback);

export async function observeApiRequest(
  request: Pick<Request, "method">,
  context: { routeClass: ApiRouteClass; route: string },
  handler: () => Promise<Response>,
  dependencies: {
    sink?: LogSink;
    record?: (observation: ApiObservation) => Promise<unknown>;
    now?: () => number;
    trace?: ApiTrace;
  } = {}
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!API_METHODS.has(method as ApiObservation["method"])) {
    throw new Error("Unsupported API method");
  }

  const observedMethod = method as ApiObservation["method"];
  const now = dependencies.now ?? performance.now.bind(performance);
  const trace = dependencies.trace ?? defaultApiTrace;
  const logger = createLogger(
    { route: context.route, routeClass: context.routeClass, method },
    dependencies.sink
  );
  const startedAt = now();

  const finish = async (status: number, span?: ApiSpan) => {
    const durationMs = Math.min(
      60_000,
      Math.max(0, Math.round(now() - startedAt))
    );
    const observation: ApiObservation = {
      routeClass: context.routeClass,
      method: observedMethod,
      status,
      durationMs,
    };
    span?.setAttribute?.("http.response.status_code", status);
    span?.setAttribute?.("pinpaw.duration_ms", durationMs);
    logger.info("api.request.completed", { status, durationMs });
    if (dependencies.record) {
      try {
        await dependencies.record(observation);
      } catch {
        logger.warn("api.observation_record_failed", { status, durationMs });
      }
    }
  };

  return trace(
    {
      name: `${observedMethod} ${context.routeClass}`,
      op: "http.server",
      attributes: {
        "http.request.method": observedMethod,
        "pinpaw.route_class": context.routeClass,
      },
    },
    async (span) => {
      try {
        const response = await handler();
        await finish(response.status, span);
        return response;
      } catch (error) {
        await finish(500, span);
        logger.error("api.request.unhandled", {
          error,
          status: 500,
        });
        throw error;
      }
    }
  );
}
