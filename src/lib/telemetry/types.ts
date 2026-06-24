export interface TelemetryBreadcrumb {
  category: string;
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

export interface TelemetryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
}

export interface TelemetryAdapter {
  captureError(error: Error, context?: Record<string, unknown>): void;
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    context?: Record<string, unknown>,
  ): string | undefined;
  addBreadcrumb(breadcrumb: TelemetryBreadcrumb): void;
  setUser(user: { id: string } | null): void;
  setTags(tags: Record<string, string>): void;
  setDebugReporting(enabled: boolean): void;
  flush(): Promise<void>;
}

export interface TelemetryStatus {
  usageAnalytics: boolean;
  debugReporting: boolean;
  adapter: string;
  sessionId: string;
  reportCount: number;
}
