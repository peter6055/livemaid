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

interface TelemetryPreferences {
  usageAnalytics: boolean;
  debugReporting: boolean;
}

const TELEMETRY_PREFS_KEY = "livemaid:telemetry-preferences";

function loadTelemetryPreferences(): TelemetryPreferences {
  if (typeof window === "undefined") {
    return { usageAnalytics: false, debugReporting: false };
  }

  try {
    const raw = window.localStorage.getItem(TELEMETRY_PREFS_KEY);
    if (!raw) return { usageAnalytics: false, debugReporting: false };
    const parsed = JSON.parse(raw);
    return {
      usageAnalytics: parsed.usageAnalytics === true,
      debugReporting: parsed.debugReporting === true,
    };
  } catch {
    return { usageAnalytics: false, debugReporting: false };
  }
}

function saveTelemetryPreferences(usageAnalytics: boolean, debugReporting: boolean) {
  try {
    window.localStorage.setItem(
      TELEMETRY_PREFS_KEY,
      JSON.stringify({ usageAnalytics, debugReporting }),
    );
  } catch {
    // Ignore storage failures so privacy toggles still work for the current session.
  }
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
  const [{ usageAnalytics, debugReporting }, setTelemetryPreferences] =
    useState(loadTelemetryPreferences);

  useEffect(() => {
    const telemetry = initTelemetry(config);
    telemetry.setUsageAnalytics(usageAnalytics);
    telemetry.setDebugReporting(debugReporting);
    // `usageAnalytics` and `debugReporting` are intentionally only read for initial bootstrapping.
    // Toggle handlers update the live telemetry instance directly after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const setUsageAnalytics = (value: boolean) => {
    setTelemetryPreferences((prev) => {
      const next = { ...prev, usageAnalytics: value };
      saveTelemetryPreferences(next.usageAnalytics, next.debugReporting);
      return next;
    });
    getTelemetry()?.setUsageAnalytics(value);
  };

  const setDebugReporting = (value: boolean) => {
    setTelemetryPreferences((prev) => {
      const next = { ...prev, debugReporting: value };
      saveTelemetryPreferences(next.usageAnalytics, next.debugReporting);
      return next;
    });
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
