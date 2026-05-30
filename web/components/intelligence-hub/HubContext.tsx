"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type HubSignals = {
  fpRate?: number;
  redTeamPassPct?: number;
  endpointHealth?: "operational" | "degraded" | "down";
  driftedModes?: number;
};

type HubContextValue = {
  signals: HubSignals;
  updateSignal: <K extends keyof HubSignals>(key: K, value: HubSignals[K]) => void;
};

const HubContext = createContext<HubContextValue>({
  signals: {},
  updateSignal: () => {},
});

export function HubContextProvider({ children }: { children: React.ReactNode }) {
  const [signals, setSignals] = useState<HubSignals>({});
  const updateSignal: HubContextValue["updateSignal"] = (key, value) => {
    setSignals((prev) => ({ ...prev, [key]: value }));
  };
  return (
    <HubContext.Provider value={{ signals, updateSignal }}>
      {children}
    </HubContext.Provider>
  );
}

export function useHubContext() {
  return useContext(HubContext);
}

export function useHubSignal<K extends keyof HubSignals>(
  key: K,
  value: HubSignals[K],
  deps: unknown[],
) {
  const { updateSignal } = useHubContext();
  useEffect(() => {
    if (value !== undefined) updateSignal(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
