import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const isDevelopment = process.env.NODE_ENV === "development";

function getSupabaseProjectUrl(value: string | undefined): URL {
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be configured.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an exact HTTPS Supabase project origin."
    );
  }

  return url;
}

function getSentryIngestOrigin(value: string | undefined): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SENTRY_DSN must be a valid URL.");
  }

  if (
    url.protocol !== "https:" ||
    !url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/\d+\/?$/.test(url.pathname) ||
    !/^[a-z0-9-]+\.ingest(?:\.[a-z0-9-]+)*\.sentry\.io$/i.test(url.hostname)
  ) {
    throw new Error(
      "NEXT_PUBLIC_SENTRY_DSN must be an HTTPS sentry.io ingest DSN."
    );
  }

  return url.origin;
}

const supabaseProjectUrl = getSupabaseProjectUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL
);
const supabaseOrigin = supabaseProjectUrl.origin;
const supabaseRealtimeOrigin = `wss://${supabaseProjectUrl.hostname}`;
const sentryIngestOrigin = getSentryIngestOrigin(
  process.env.NEXT_PUBLIC_SENTRY_DSN
);
// Naver Maps loads auth/style JSONP + tiles from several hosts.
// On http://localhost the SDK also requests http:// endpoints, so allow
// matching http origins only in development.
const naverMapHttpsOrigins = [
  "https://openapi.map.naver.com",
  "https://oapi.map.naver.com",
  "https://*.map.naver.net",
  "https://*.naver.net",
  "https://*.pstatic.net",
].join(" ");
const naverMapHttpOrigins = [
  "http://openapi.map.naver.com",
  "http://oapi.map.naver.com",
  "http://*.map.naver.net",
  "http://*.naver.net",
  "http://*.pstatic.net",
].join(" ");
const naverMapOrigins = isDevelopment
  ? `${naverMapHttpsOrigins} ${naverMapHttpOrigins}`
  : naverMapHttpsOrigins;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} ${naverMapOrigins}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${supabaseOrigin} ${naverMapOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseRealtimeOrigin} ${naverMapOrigins}${sentryIngestOrigin ? ` ${sentryIngestOrigin}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  poweredByHeader: false,
  // 홈 디렉터리 등 상위 lockfile 때문에 루트가 잘못 잡히는 것 방지
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseProjectUrl.hostname,
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});
