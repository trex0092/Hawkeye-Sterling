"use client";

import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/hooks/useAlerts";
import type { DesignationAlert } from "@/lib/server/alerts-store";

function severityColor(s: DesignationAlert["severity"]): string {
  if (s === "critical") return "text-red border-red/30 bg-red-dim";
  if (s === "high") return "text-red border-red/30 bg-red-dim";
  return "text-amber border-amber/30 bg-amber-dim";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AlertBell(): JSX.Element {
  const { alerts, unreadCount, dismiss } = useAlerts();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const recentAlerts = alerts.slice(0, 8);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded hover:bg-bg-2 transition-colors"
        title={unreadCount > 0 ? `${unreadCount} new designation alert${unreadCount === 1 ? "" : "s"}` : "No new alerts"}
        aria-label="Designation alerts"
      >
        {/* Bell icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-ink-2">
          <path d="M8 1a1 1 0 0 1 1 1v.5A4.5 4.5 0 0 1 12.5 7v2.5l1 1.5H2.5l1-1.5V7A4.5 4.5 0 0 1 7 2.5V2a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] rounded-full bg-red text-white text-[9px] font-bold leading-none flex items-center justify-center px-0.5">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 z-50 bg-bg-panel border border-hair-2 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-hair-2">
            <span className="text-12 font-semibold text-ink-0">Designation Alerts</span>
            {unreadCount > 0 && (
              <span className="text-11 text-ink-3">{unreadCount} unread</span>
            )}
          </div>

          {recentAlerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-12 text-ink-3">
              No alerts — watchlists are up to date.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-hair-2">
              {recentAlerts.map((alert) => (
                <li key={alert.id} className={`px-4 py-3 flex items-start gap-2 ${!alert.read ? "bg-bg-2" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-10 font-bold px-1.5 py-0.5 rounded border uppercase ${severityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-11 font-mono text-ink-2 uppercase">{alert.listId}</span>
                      {!alert.read && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red shrink-0" />
                      )}
                    </div>
                    <p className="text-12 text-ink-0 font-medium truncate">{alert.matchedEntry}</p>
                    <p className="text-11 text-ink-3">{relativeTime(alert.detectedAt)}</p>
                  </div>
                  {!alert.read && (
                    <button
                      type="button"
                      onClick={() => void dismiss(alert.id)}
                      className="shrink-0 text-11 text-ink-3 hover:text-ink-0 mt-0.5"
                      title="Mark read"
                    >
                      ✓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-hair-2 text-center">
            <a href="/screening" className="text-11 text-brand hover:underline" onClick={() => setOpen(false)}>
              View screening queue →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertBell;
