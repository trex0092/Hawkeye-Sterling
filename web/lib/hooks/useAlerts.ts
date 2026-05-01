"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignationAlert } from "@/lib/server/alerts-store";

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

interface UseAlertsReturn {
  alerts: DesignationAlert[];
  unreadCount: number;
  loading: boolean;
  dismiss: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<DesignationAlert[]>(() => loadCache());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef<Set<string>>(loadDismissed());

  const unreadCount = alerts.filter((a) => !a.read).length;

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return; // keep stale cache
      const data = (await res.json()) as { ok: boolean; alerts?: DesignationAlert[] };
      if (data.ok && Array.isArray(data.alerts)) {
        const merged = applyDismissed(data.alerts, dismissedRef.current);
        setAlerts(merged);
        saveCache(merged);
      }
    } catch { /* network error — keep stale cache */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Seed from cache immediately, then fetch
    const cached = loadCache();
    dismissedRef.current = loadDismissed();
    if (cached.length > 0) {
      setAlerts(applyDismissed(cached, dismissedRef.current));
    }
    setLoading(true);
    void fetch_();
    timerRef.current = setInterval(() => { void fetch_(); }, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [fetch_]);

  const dismiss = useCallback(async (id: string) => {
    // Optimistic update + track locally so it survives re-polls
    dismissedRef.current = new Set([...dismissedRef.current, id]);
    saveDismissed(dismissedRef.current);
    setAlerts((prev) => {
      const updated = prev.map((a) => a.id === id ? { ...a, read: true } : a);
      saveCache(updated);
      return updated;
    });
    try {
      await fetch(`/api/alerts/${id}/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch { /* best effort — local state already updated */ }
  }, []);

  return { alerts, unreadCount, loading, dismiss, refresh: () => { void fetch_(); } };
}
