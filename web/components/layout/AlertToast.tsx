"use client";

// Always-on, in-app toast renderer. Subscribes to the toast bus and stacks
// up to 3 popups in the top-right corner. No browser permissions required —
// pure DOM, guaranteed to render whenever a new unread alert arrives.

import { useEffect, useState, useCallback } from "react";
import { subscribeToasts, type ToastPayload } from "@/lib/toast-bus";
import { useAlerts } from "@/lib/hooks/useAlerts";

interface ActiveToast extends ToastPayload {
  expiresAt: number;
}

const MAX_VISIBLE = 3;
const DEFAULT_TTL_MS = 8_000;

function severityClasses(s: ToastPayload["severity"]): string {
  if (s === "critical") return "border-red/60 bg-red-dim text-red";
  if (s === "high")     return "border-red/40 bg-red-dim/70 text-red";
  return "border-amber/40 bg-amber-dim text-amber";
}

function severityLabel(s: ToastPayload["severity"]): string {
  return s.toUpperCase();
}

export function AlertToast(): JSX.Element | null {
  // Run the alert poller from the layout root so toasts fire on EVERY
  // page, not just pages that mount the Header (and therefore AlertBell).
  // The hook publishes via the toast bus; AlertBell may also call useAlerts
  // independently — toast-bus dedupes by id so duplicate pushes are no-ops.
  useAlerts();

  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const unsub = subscribeToasts((payload) => {
      const ttl = payload.ttlMs ?? (payload.severity === "critical" ? 30_000 : DEFAULT_TTL_MS);
      const next: ActiveToast = { ...payload, expiresAt: Date.now() + ttl };
      setToasts((cur) => {
        // Dedup by id; keep newest at top; cap visible count
        const filtered = cur.filter((t) => t.id !== payload.id);
        return [next, ...filtered].slice(0, MAX_VISIBLE);
      });
    });
    return unsub;
  }, []);

  // Auto-expire toasts on a single tick
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setToasts((cur) => cur.filter((x) => x.expiresAt > now));
    }, 500);
    return () => clearInterval(t);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "360px" }}
      aria-live="assertive"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border-2 shadow-2xl px-4 py-3 backdrop-blur-md ${severityClasses(t.severity)} animate-slide-in-right`}
          role="alert"
          style={{
            animation: "hawkeye-toast-in 0.3s ease-out",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="text-[20px] leading-none mt-0.5">
              {t.severity === "critical" ? "🚨" : t.severity === "high" ? "⚠️" : "🔔"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-10 font-bold uppercase tracking-wide">
                  {severityLabel(t.severity)}
                </span>
                <span className="text-10 font-mono text-ink-3">new alert</span>
              </div>
              <div className="text-12 font-semibold text-ink-0 mb-0.5 truncate" title={t.title}>
                {t.title}
              </div>
              <div className="text-11 text-ink-2 line-clamp-2" title={t.body}>
                {t.body}
              </div>
              {t.href && (
                <a
                  href={t.href}
                  className="inline-block mt-1.5 text-11 font-semibold text-brand hover:underline"
                  onClick={() => dismiss(t.id)}
                >
                  Open screening →
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-ink-3 hover:text-ink-0 text-14 leading-none -mr-1 -mt-1 p-1"
              aria-label="Dismiss"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes hawkeye-toast-in {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default AlertToast;
