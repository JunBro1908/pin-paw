import * as Sentry from "@sentry/nextjs";
import {
  sanitizeMonitoringEvent,
  sanitizeMonitoringSpan,
} from "@/shared/lib/monitoring-sanitizer";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === "production",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  enableLogs: false,
  sampleRate: 1,
  tracesSampleRate: 0.05,
  maxBreadcrumbs: 50,
  beforeSend: (event) => sanitizeMonitoringEvent(event),
  beforeSendTransaction: (event) => sanitizeMonitoringEvent(event),
  beforeSendSpan: (span) => sanitizeMonitoringSpan(span),
});
