"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Telemetry, initTelemetry, getTelemetry } from "./index";
import type { TelemetryConfig } from "./types";

interface TelemetryContextValue {
  telemetry: Telemetry | null;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const TelemetryContext = createContext<TelemetryContextValue>({
  telemetry: null,
  enabled: false,
  setEnabled: () => {},
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
  const [enabled, setEnabledState] = useState(config.enabled);

  useEffect(() => {
    initTelemetry({ ...config, enabled });
    // Only run once on mount — telemetry is a singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    getTelemetry()?.setEnabled(value);
  };

  return (
    <TelemetryContext.Provider value={{ telemetry: getTelemetry(), enabled, setEnabled }}>
      {children}
    </TelemetryContext.Provider>
  );
}
