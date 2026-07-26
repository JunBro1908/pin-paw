import * as Sentry from "@sentry/nextjs";
import {
  sanitizeMonitoringEvent,
  sanitizeMonitoringSpan,
} from "@/shared/lib/monitoring-sanitizer";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release:
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  enableLogs: false,
  sampleRate: 1,
  tracesSampleRate: 0.05,
  maxBreadcrumbs: 50,
  beforeSend: (event) => sanitizeMonitoringEvent(event),
  beforeSendTransaction: (event) => sanitizeMonitoringEvent(event),
  beforeSendSpan: (span) => sanitizeMonitoringSpan(span),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
