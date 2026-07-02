import * as Sentry from "@sentry/nextjs";
import type { TelemetryAdapter, TelemetryBreadcrumb } from "./types";
import { sanitizeString, sanitizeContext } from "./sanitizer";

interface SentryAdapterOptions {
  dsn: string;
  environment?: string;
  release?: string;
}

let sentryInitialized = false;
let replay: ReturnType<typeof Sentry.replayIntegration> | null = null;

export function createSentryAdapter(options: SentryAdapterOptions): TelemetryAdapter {
  if (!sentryInitialized) {
    replay = Sentry.replayIntegration({
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    } as Parameters<typeof Sentry.replayIntegration>[0]);

    Sentry.init({
      dsn: options.dsn,
      environment: options.environment || "development",
      release: options.release,
      sampleRate: 1.0,
      enableLogs: true,
      integrations: [
        replay,
        Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
      ],
      beforeSend(event) {
        if (event.exception?.values) {
          for (const value of event.exception.values) {
            if (value.value) {
              value.value = sanitizeString(value.value);
            }
          }
        }
        if (event.breadcrumbs) {
          for (const crumb of event.breadcrumbs) {
            if (crumb.message) {
              crumb.message = sanitizeString(crumb.message);
            }
            if (crumb.data) {
              crumb.data = sanitizeContext(crumb.data as Record<string, unknown>);
            }
          }
        }
        if (event.extra) {
          event.extra = sanitizeContext(event.extra as Record<string, unknown>);
        }
        if (event.tags) {
          const sanitized: Record<string, string> = {};
          for (const [key, value] of Object.entries(event.tags)) {
            sanitized[key] = sanitizeString(String(value));
          }
          event.tags = sanitized;
        }
        return event;
      },
    });

    window.onerror = (_message, _source, _lineno, _colno, error) => {
      Sentry.captureException(error || new Error(String(_message)), {
        tags: { source: "window.onerror" },
      });
    };

    window.onunhandledrejection = (event) => {
      Sentry.captureException(event.reason, {
        tags: { source: "unhandledrejection" },
      });
    };

    sentryInitialized = true;
  }

  return {
    captureError(error: Error, context?: Record<string, unknown>) {
      Sentry.captureException(error, {
        extra: context ? sanitizeContext(context) : undefined,
      });
    },

    captureMessage(
      message: string,
      level: "info" | "warning" | "error",
      context?: Record<string, unknown>,
    ) {
      const eventId = Sentry.captureMessage(sanitizeString(message), {
        level: level === "error" ? "error" : level === "warning" ? "warning" : "info",
        extra: context ? sanitizeContext(context) : undefined,
      });
      return eventId;
    },

    addBreadcrumb(breadcrumb: TelemetryBreadcrumb) {
      Sentry.addBreadcrumb({
        category: breadcrumb.category,
        message: sanitizeString(breadcrumb.message),
        level: breadcrumb.level || "info",
        data: breadcrumb.data ? sanitizeContext(breadcrumb.data) : undefined,
      });
    },

    setUser(user: { id: string } | null) {
      Sentry.setUser(user ? { id: user.id } : null);
    },

    setTags(tags: Record<string, string>) {
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(tags)) {
        sanitized[sanitizeString(key)] = sanitizeString(value);
      }
      Sentry.setTags(sanitized);
    },

    setDebugReporting(enabled: boolean) {
      if (replay) {
        if (enabled) {
          replay.start();
        } else {
          replay.stop();
        }
      }
    },

    async flush() {
      await Sentry.flush(2000);
    },
  };
}
