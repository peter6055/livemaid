"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { initTelemetry } from "./index";
import type { TelemetryConfig } from "./types";
import { usePreferences } from "@/lib/preferences/provider";

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
  // Consent lives with the rest of the user preferences, so it follows the account across devices.
  const { prefs, update } = usePreferences();
  const { usageAnalytics, debugReporting } = prefs;

  // Runs on mount with the cached consent and again when the stored document arrives or a toggle
  // flips; initTelemetry is a singleton, so re-running only re-applies the flags.
  useEffect(() => {
    const telemetry = initTelemetry(config, { usageAnalytics, debugReporting });
    telemetry.setUsageAnalytics(usageAnalytics);
    telemetry.setDebugReporting(debugReporting);
  }, [config, usageAnalytics, debugReporting]);

  const setUsageAnalytics = (value: boolean) => update("usageAnalytics", value);
  const setDebugReporting = (value: boolean) => update("debugReporting", value);

  return (
    <TelemetryContext.Provider
      value={{ usageAnalytics, debugReporting, setUsageAnalytics, setDebugReporting }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}
