import type { TelemetryConfig } from "./types";
import { getEnvironment, getRawVersion } from "@/lib/env";

const SENTRY_DSN =
  "https://51cc77c9c840c5fa05497e3ed8078fa8@o4511617805713408.ingest.us.sentry.io/4511617809448960";

export function getTelemetryConfig(): TelemetryConfig {
  return {
    dsn: SENTRY_DSN,
    environment: getEnvironment(),
    release: getRawVersion(),
  };
}
