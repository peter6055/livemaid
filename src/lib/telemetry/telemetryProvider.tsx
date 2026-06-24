"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Telemetry, initTelemetry, getTelemetry } from "./index";
import type { TelemetryConfig } from "./types";

interface TelemetryContextValue {
  usageAnalytics: boolean;
  debugReporting: boolean;
  setUsageAnalytics: (enabled: boolean) => void;
  setDebugReporting: (enabled: boolean) => void;
}

const TelemetryContext = createContext<TelemetryContextValue>({
  usageAnalytics: false,
  debugReporting: false,
  setUsageAnalytics: () => {},
  setDebugReporting: () => {},
});

export function useTelemetry() {
  return useContext(TelemetryContext);
}

export function TelemetryProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: TelemetryConfig;
}) {
  const [usageAnalytics, setUsageAnalyticsState] = useState(false);
  const [debugReporting, setDebugReportingState] = useState(false);

  useEffect(() => {
    initTelemetry(config);
  }, []);

  const setUsageAnalytics = (value: boolean) => {
    setUsageAnalyticsState(value);
    getTelemetry()?.setUsageAnalytics(value);
  };

  const setDebugReporting = (value: boolean) => {
    setDebugReportingState(value);
    getTelemetry()?.setDebugReporting(value);
  };

  return (
    <TelemetryContext.Provider
      value={{ usageAnalytics, debugReporting, setUsageAnalytics, setDebugReporting }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}
