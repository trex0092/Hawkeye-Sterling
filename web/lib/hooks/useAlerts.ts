"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignationAlert } from "@/lib/server/alerts-store";
import { loadBellEvents, markBellEventRead } from "@/lib/bell-events";

const POLL_INTERVAL_MS = 60_000;
const CACHE_KEY = "hawkeye.alerts.cache.v1";
const DISMISSED_KEY = "hawkeye.alerts.dismissed.v1";

function loadCache(): DesignationAlert[] {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DesignationAlert[]) : [];
  } catch {
    return [];
  }
}

function saveCache(alerts: DesignationAlert[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(alerts));
    }
  } catch { /* storage full */ }
}

function loadDismissed(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
    }
  } catch { /* storage full */ }
}

function applyDismissed(alerts: DesignationAlert[], dismissed: Set<string>): DesignationAlert[] {
  if (dismissed.size === 0) return alerts;
  return alerts.map((a) => dismissed.has(a.id) ? { ...a, read: true } : a);
}

// Merge API alerts + local bell events, deduplicating by id.
// Local events take precedence (they are more recent).
function mergeAlerts(apiAlerts: DesignationAlert[], localEvents: DesignationAlert[]): DesignationAlert[] {
  const byId = new Map<string, DesignationAlert>();
  for (const a of apiAlerts) byId.set(a.id, a);
  for (const e of localEvents) byId.set(e.id, e); // local wins on dedup
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
  );
}

interface UseAlertsReturn {
  alerts: DesignationAlert[];
  unreadCount: number;
  loading: boolean;
  dismiss: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<DesignationAlert[]>(() =>
    mergeAlerts(loadCache(), loadBellEvents()),
  );
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef<Set<string>>(loadDismissed());

  const unreadCount = alerts.filter((a) => !a.read).length;

  const remerge = useCallback((apiAlerts: DesignationAlert[]) => {
    const local = loadBellEvents();
    const merged = applyDismissed(mergeAlerts(apiAlerts, local), dismissedRef.current);
    setAlerts(merged);
    saveCache(apiAlerts); // only cache API alerts
  }, []);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; alerts?: DesignationAlert[] };
      if (data.ok && Array.isArray(data.alerts)) {
        remerge(data.alerts);
      }
    } catch { /* network error — keep stale */ }
    finally { setLoading(false); }
  }, [remerge]);

  // Re-render when another module pushes a bell event via localStorage
  const onStorage = useCallback((e: StorageEvent) => {
    if (e.key === "hawkeye.bell.events.v1") {
      const cached = loadCache();
      remerge(cached);
    }
  }, [remerge]);

  useEffect(() => {
    dismissedRef.current = loadDismissed();
    const cached = loadCache();
    remerge(cached);
    setLoading(true);
    void fetch_();
    timerRef.current = setInterval(() => { void fetch_(); }, POLL_INTERVAL_MS);
    window.addEventListener("storage", onStorage);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetch_, remerge, onStorage]);

  const dismiss = useCallback(async (id: string) => {
    dismissedRef.current = new Set([...dismissedRef.current, id]);
    saveDismissed(dismissedRef.current);
    markBellEventRead(id);
    setAlerts((prev) => {
      const updated = prev.map((a) => a.id === id ? { ...a, read: true } : a);
      saveCache(updated.filter((a) => !loadBellEvents().some((e) => e.id === a.id)));
      return updated;
    });
    try {
      await fetch(`/api/alerts/${id}/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch { /* best effort */ }
  }, []);

  return { alerts, unreadCount, loading, dismiss, refresh: () => { void fetch_(); } };
}
