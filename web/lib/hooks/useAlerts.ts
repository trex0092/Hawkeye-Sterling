"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignationAlert } from "@/lib/server/alerts-store";
import { loadBellEvents, markBellEventRead } from "@/lib/bell-events";
import { pushToast } from "@/lib/toast-bus";

const POLL_INTERVAL_MS = 60_000;
const CACHE_KEY = "hawkeye.alerts.cache.v1";
const DISMISSED_KEY = "hawkeye.alerts.dismissed.v1";
const SEEN_KEY = "hawkeye.alerts.seen.v1";
const NOTIF_PREF_KEY = "hawkeye.alerts.notif.v1";

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

function loadSeen(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>): void {
  try {
    if (typeof localStorage !== "undefined") {
      // Cap to last 500 ids so the set doesn't grow forever
      const arr = Array.from(ids).slice(-500);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    }
  } catch { /* storage full */ }
}

function applyDismissed(alerts: DesignationAlert[], dismissed: Set<string>): DesignationAlert[] {
  if (dismissed.size === 0) return alerts;
  return alerts.map((a) => dismissed.has(a.id) ? { ...a, read: true } : a);
}

function mergeAlerts(apiAlerts: DesignationAlert[], localEvents: DesignationAlert[]): DesignationAlert[] {
  const byId = new Map<string, DesignationAlert>();
  for (const a of apiAlerts) byId.set(a.id, a);
  for (const e of localEvents) byId.set(e.id, e);
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
  );
}

// Short, soft "ding" — a single sine-wave tone via Web Audio.
// No external file needed; works offline; respects browser autoplay policy
// because it only fires after a user gesture has occurred (the page has
// been interacted with, since this hook runs in a client component).
function playChime(severity: DesignationAlert["severity"]): void {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = severity === "critical" ? 880 : severity === "high" ? 660 : 523;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
    setTimeout(() => { void ctx.close(); }, 700);
  } catch { /* audio context refused */ }
}

function showBrowserNotification(alert: DesignationAlert): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const pref = localStorage.getItem(NOTIF_PREF_KEY);
    if (pref === "off") return;
    const n = new Notification(`Hawkeye — ${alert.severity.toUpperCase()} designation alert`, {
      body: `${alert.matchedEntry} · ${alert.listLabel}`,
      icon: "/favicon.ico",
      tag: alert.id,
      requireInteraction: alert.severity === "critical",
    });
    n.onclick = () => {
      window.focus();
      window.location.href = `/screening?q=${encodeURIComponent(alert.matchedEntry)}`;
      n.close();
    };
  } catch { /* notification refused */ }
}

let titleFlashTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = "";

function flashTitle(unreadCount: number): void {
  if (typeof document === "undefined") return;
  if (!originalTitle) originalTitle = document.title.replace(/^\(\d+\)\s/, "");
  if (unreadCount === 0) {
    if (titleFlashTimer) { clearInterval(titleFlashTimer); titleFlashTimer = null; }
    document.title = originalTitle;
    return;
  }
  if (titleFlashTimer) clearInterval(titleFlashTimer);
  let toggle = false;
  const update = () => {
    if (typeof document === "undefined") return;
    document.title = toggle
      ? `(${unreadCount}) ${originalTitle}`
      : `🔔 ${unreadCount} alert${unreadCount === 1 ? "" : "s"} — ${originalTitle}`;
    toggle = !toggle;
  };
  update();
  titleFlashTimer = setInterval(update, 2000);
}

interface UseAlertsReturn {
  alerts: DesignationAlert[];
  unreadCount: number;
  loading: boolean;
  dismiss: (id: string) => Promise<void>;
  refresh: () => void;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  notificationPermission: NotificationPermission | "unsupported";
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<DesignationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());

  const unreadCount = alerts.filter((a: DesignationAlert) => !a.read).length;

  const remerge = useCallback((apiAlerts: DesignationAlert[]) => {
    const local = loadBellEvents();
    const merged = applyDismissed(mergeAlerts(apiAlerts, local), dismissedRef.current);
    setAlerts(merged);
    saveCache(apiAlerts);

    // Fire side-effects for newly arrived unread alerts:
    //   1. In-app toast popup (always — no permission needed)
    //   2. Audio chime (if AudioContext available)
    //   3. Browser desktop notification (if permission granted)
    // First load also fires the toast/chime so the operator immediately
    // knows there are pending designation alerts after a fresh page load.
    const newUnread = merged.filter((a) => !a.read && !seenRef.current.has(a.id));
    if (newUnread.length > 0) {
      const mostSerious = newUnread.reduce((acc, a) => {
        const order = { critical: 0, high: 1, medium: 2 } as const;
        return order[a.severity] < order[acc.severity] ? a : acc;
      }, newUnread[0]!);
      playChime(mostSerious.severity);
      for (const a of newUnread.slice(0, 3)) {
        pushToast({
          id: a.id,
          severity: a.severity,
          title: `${a.matchedEntry}`,
          body: `${a.listLabel} · ${a.sourceRef || "designation hit"}`,
          href: `/screening?q=${encodeURIComponent(a.matchedEntry)}`,
        });
        showBrowserNotification(a);
      }
    }

    // Mark every current id as seen
    for (const a of merged) seenRef.current.add(a.id);
    saveSeen(seenRef.current);
  }, []);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; alerts?: DesignationAlert[] };
      if (data.ok && Array.isArray(data.alerts)) {
        remerge(data.alerts);
      }
    } catch { /* network error — keep stale */ }
    finally { setLoading(false); }
  }, [remerge]);

  const onStorage = useCallback((e: StorageEvent) => {
    if (e.key === "hawkeye.bell.events.v1") {
      const cached = loadCache();
      remerge(cached);
    }
  }, [remerge]);

  useEffect(() => {
    dismissedRef.current = loadDismissed();
    seenRef.current = loadSeen();
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission("unsupported");
    }
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

  // Flash document title when there are unread alerts and the tab is hidden
  useEffect(() => {
    const onVisChange = () => {
      if (typeof document === "undefined") return;
      if (document.hidden && unreadCount > 0) flashTitle(unreadCount);
      else flashTitle(0);
    };
    onVisChange();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisChange);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisChange);
      }
      flashTitle(0);
    };
  }, [unreadCount]);

  const dismiss = useCallback(async (id: string) => {
    dismissedRef.current = new Set([...dismissedRef.current, id]);
    saveDismissed(dismissedRef.current);
    markBellEventRead(id);
    setAlerts((prev: DesignationAlert[]) => {
      const updated = prev.map((a: DesignationAlert) => a.id === id ? { ...a, read: true } : a);
      saveCache(updated.filter((a: DesignationAlert) => !loadBellEvents().some((e) => e.id === a.id)));
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

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === "granted") {
      try { localStorage.setItem(NOTIF_PREF_KEY, "on"); } catch { /* storage full */ }
    }
    return result;
  }, []);

  return {
    alerts,
    unreadCount,
    loading,
    dismiss,
    refresh: () => { void fetch_(); },
    requestNotificationPermission,
    notificationPermission,
  };
}
