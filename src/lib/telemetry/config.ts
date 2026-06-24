import type { TelemetryConfig } from "./types";

export function getTelemetryConfig(): TelemetryConfig {
  return {
    enabled: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED === "true",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
  };
}
