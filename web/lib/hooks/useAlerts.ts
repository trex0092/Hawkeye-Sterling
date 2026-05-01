"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignationAlert } from "@/lib/server/alerts-store";

const POLL_INTERVAL_MS = 60_000;

interface UseAlertsReturn {
  alerts: DesignationAlert[];
  unreadCount: number;
  loading: boolean;
  dismiss: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<DesignationAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; alerts?: DesignationAlert[]; unreadCount?: number };
      if (data.ok && data.alerts) {
        setAlerts(data.alerts);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch { /* network error — keep stale data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch_();
    timerRef.current = setInterval(() => { void fetch_(); }, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [fetch_]);

  const dismiss = useCallback(async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* best effort */ }
  }, []);

  return { alerts, unreadCount, loading, dismiss, refresh: () => { void fetch_(); } };
}
