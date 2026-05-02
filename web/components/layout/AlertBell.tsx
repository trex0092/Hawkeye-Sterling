"use client";

// Weaponized AlertBell — designation alert notification with:
//   · Severity-sorted display (OFAC/UN critical → EU/UK high → medium)
//   · Redline hint badge ("would fire rl_ofac_sdn_confirmed")
//   · Click-through: clicking an alert opens /screening with name pre-filled
//   · SLA countdown for unread critical alerts (4h expiry window)
//   · Dedup by (listId + matchedEntry) in display layer
//   · Batch dismiss all unread

import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/hooks/useAlerts";
import type { DesignationAlert } from "@/lib/server/alerts-store";

// Redline IDs that correspond to specific list designations.
const LIST_TO_REDLINE: Record<string, string> = {
  ofac_sdn:       "rl_ofac_sdn_confirmed",
  un_1267:        "rl_un_consolidated_confirmed",
  eu_consolidated: "rl_eu_cfsp_confirmed",
  uk_ofsi:        "rl_uk_ofsi_confirmed",
  uae_eocn:       "rl_eocn_confirmed",
};

const SEVERITY_ORDER: Record<DesignationAlert["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function severityClass(s: DesignationAlert["severity"]) {
  if (s === "critical") return "text-red border-red/30 bg-red-dim";
  if (s === "high") return "text-red border-red/30 bg-red-dim";
  return "text-amber border-amber/30 bg-amber-dim";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Returns minutes remaining before a 4-hour SLA window expires for critical alerts.
function slaRemaining(iso: string): number | null {
  const ageMs = Date.now() - Date.parse(iso);
  const ageHrs = ageMs / 3_600_000;
  if (ageHrs >= 4) return 0;
  return Math.floor((4 - ageHrs) * 60); // minutes remaining
}

function dedupAlerts(alerts: DesignationAlert[]): DesignationAlert[] {
  const seen = new Map<string, DesignationAlert>();
  for (const a of alerts) {
    const key = `${a.listId}|${a.matchedEntry.toLowerCase().trim()}`;
    const existing = seen.get(key);
    // Keep the most recent unread; if both read, keep most recent
    if (!existing || (!existing.read && a.read) || Date.parse(a.detectedAt) > Date.parse(existing.detectedAt)) {
      seen.set(key, a);
    }
  }
  return Array.from(seen.values());
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

  // Sort: severity first, then unread first, then recency
  const sorted = dedupAlerts([...alerts]).sort((a, b) => {
    const sv = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sv !== 0) return sv;
    if (a.read !== b.read) return a.read ? 1 : -1;
    return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
  });

  const criticalUnread = sorted.filter((a) => !a.read && a.severity === "critical").length;

  // Build URL to screening with subject name pre-filled
  const screeningUrl = (name: string) =>
    `/screening?q=${encodeURIComponent(name)}`;

  const dismissAll = async () => {
    const unread = sorted.filter((a) => !a.read);
    for (const a of unread) {
      await dismiss(a.id);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
          open
            ? "bg-bg-2 border-hair-1 text-ink-0"
            : unreadCount > 0
              ? "border-red/30 text-red hover:bg-red-dim"
              : "border-hair-2 text-ink-1 hover:bg-bg-2 hover:text-ink-0"
        }`}
        title={unreadCount > 0 ? `${unreadCount} new designation alert${unreadCount === 1 ? "" : "s"}` : "No new alerts"}
        aria-label="Designation alerts"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a1.25 1.25 0 0 1 1.25 1.25v.6A6.25 6.25 0 0 1 18.5 11v3.1l1.4 2.1a.75.75 0 0 1-.62 1.17H4.72a.75.75 0 0 1-.62-1.17l1.4-2.1V11A6.25 6.25 0 0 1 10.75 4.85v-.6A1.25 1.25 0 0 1 12 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill={unreadCount > 0 ? "currentColor" : "none"}
            fillOpacity={unreadCount > 0 ? "0.18" : "0"}
          />
          <path
            d="M9.75 19.25a2.25 2.25 0 0 0 4.5 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-red text-white text-[10px] font-bold leading-none flex items-center justify-center px-1 ring-2 ring-bg-0 ${
              criticalUnread > 0 ? "animate-pulse" : ""
            }`}
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-88 z-50 bg-bg-panel border border-hair-2 rounded-xl shadow-xl overflow-hidden" style={{ width: "340px" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-hair-2">
            <div className="flex items-center gap-2">
              <span className="text-12 font-semibold text-ink-0">Designation Alerts</span>
              {criticalUnread > 0 && (
                <span className="text-10 font-bold px-1.5 py-0.5 rounded bg-red-dim text-red border border-red/30 uppercase animate-pulse">
                  {criticalUnread} critical
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => { void dismissAll(); }}
                  className="text-10 text-ink-3 hover:text-ink-0 border border-hair-2 rounded px-1.5 py-0.5"
                  title="Dismiss all unread"
                >
                  dismiss all
                </button>
              )}
              <span className="text-11 text-ink-3">{unreadCount > 0 ? `${unreadCount} unread` : "all clear"}</span>
            </div>
          </div>

          {/* Alert list */}
          {sorted.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="text-20 mb-1">✓</div>
              <div className="text-12 text-ink-3">Watchlists up to date — no new designations.</div>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-hair-2">
              {sorted.slice(0, 12).map((alert) => {
                const redlineId = LIST_TO_REDLINE[alert.listId];
                const sla = !alert.read && alert.severity === "critical" ? slaRemaining(alert.detectedAt) : null;
                return (
                  <li key={alert.id} className={`px-4 py-3 ${!alert.read ? "bg-bg-2" : ""}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Top row: severity + list + unread dot */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-10 font-bold px-1.5 py-0.5 rounded border uppercase ${severityClass(alert.severity)}`}>
                            {alert.severity}
                          </span>
                          <span className="text-11 font-mono text-ink-2 uppercase">{alert.listLabel ?? alert.listId}</span>
                          {!alert.read && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red shrink-0" />
                          )}
                        </div>

                        {/* Entity name — clickable → screening */}
                        <a
                          href={screeningUrl(alert.matchedEntry)}
                          onClick={() => setOpen(false)}
                          className="block text-12 text-ink-0 font-medium hover:text-brand truncate transition-colors"
                          title={`Screen ${alert.matchedEntry}`}
                        >
                          {alert.matchedEntry}
                        </a>

                        {/* Redline hint */}
                        {redlineId && (
                          <div className="text-10 font-mono text-red mt-0.5">
                            ⚑ would fire {redlineId}
                          </div>
                        )}

                        {/* Source ref */}
                        {alert.sourceRef && (
                          <div className="text-10 text-ink-3 font-mono mt-0.5">{alert.sourceRef}</div>
                        )}

                        {/* Time + SLA */}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-10 text-ink-3">{relativeTime(alert.detectedAt)}</span>
                          {sla !== null && sla > 0 && (
                            <span className="text-10 font-semibold text-red">{sla}m until SLA breach</span>
                          )}
                          {sla === 0 && (
                            <span className="text-10 font-bold text-red animate-pulse">SLA BREACHED</span>
                          )}
                        </div>
                      </div>

                      {/* Dismiss button */}
                      {!alert.read && (
                        <button
                          type="button"
                          onClick={() => void dismiss(alert.id)}
                          className="shrink-0 text-11 text-ink-3 hover:text-green border border-hair-2 rounded px-1.5 py-0.5 mt-0.5"
                          title="Mark read"
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t border-hair-2 flex items-center justify-between">
            <span className="text-10 text-ink-3 font-mono">Polls every 60s · FATF R.20</span>
            <a
              href="/screening"
              className="text-11 text-brand hover:underline"
              onClick={() => setOpen(false)}
            >
              Open screening →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertBell;
