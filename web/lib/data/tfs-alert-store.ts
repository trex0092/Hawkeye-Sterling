"use client";

// Client-side TFS alert register.
// localStorage is primary source of truth for instant render and persistence.
// Server-side mirror at /api/tfs-alerts (Netlify Blobs) provides durability.

export type TFSAlertStatus =
  | "NEW"
  | "SCREENING_IN_PROGRESS"
  | "SCREENED"
  | "NO_MATCH"
  | "MATCH_FOUND"
  | "REPORTED";

export interface TFSAlert {
  id: string;                    // Gmail thread ID (unique key)
  dateReceived: string;          // ISO 8601 datetime
  subject: string;               // Full email subject
  sender: string;                // From address
  snippet: string;               // First 300 chars of body
  alertType: string;             // Parsed from subject if possible
  status: TFSAlertStatus;
  asanaTaskId: string | null;    // GID of created Asana task
  asanaTaskUrl: string | null;   // Direct URL to Asana task
  dateActioned: string | null;   // ISO datetime when actioned
  goamlReference: string | null; // goAML report reference
  notes: string;                 // Free text notes field
}

const STORAGE_KEY = "hawkeye.tfs-alerts.v1";
const SYNC_DEBOUNCE_MS = 600;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAlerts(): TFSAlert[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TFSAlert[];
  } catch (err) {
    console.error("[hawkeye] tfs-alert-store: localStorage parse failed:", err);
    return [];
  }
}

export function saveAlerts(alerts: TFSAlert[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    window.dispatchEvent(new CustomEvent("hawkeye:tfs-alerts-updated"));
    scheduleServerSync();
  } catch (err) {
    console.error("[hawkeye] tfs-alert-store: localStorage save failed:", err);
  }
}

export function upsertAlert(alert: TFSAlert): void {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === alert.id);
  if (idx >= 0) {
    alerts[idx] = alert;
  } else {
    alerts.unshift(alert);
  }
  saveAlerts(alerts);
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleServerSync(): void {
  if (!isBrowser()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushToServer();
  }, SYNC_DEBOUNCE_MS);
}

async function pushToServer(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const alerts = loadAlerts();
    await fetch("/api/tfs-alerts", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ alerts }),
    });
  } catch (err) {
    console.warn("[hawkeye] tfs-alert-store: pushToServer offline:", err);
  }
}

export async function syncFromServer(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const local = loadAlerts();
    const r = await fetch("/api/tfs-alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alerts: local }),
    });
    if (!r.ok) return;
    const body = (await r.json()) as { ok?: boolean; alerts?: TFSAlert[] };
    if (body.ok && Array.isArray(body.alerts)) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body.alerts));
        window.dispatchEvent(new CustomEvent("hawkeye:tfs-alerts-updated"));
      } catch (err) {
        console.warn("[hawkeye] tfs-alert-store: sync write failed:", err);
      }
    }
  } catch (err) {
    console.warn("[hawkeye] tfs-alert-store: syncFromServer offline:", err);
  }
}

export function parseAlertType(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("uae local") || s.includes("local terrorist")) return "UAE Local List";
  if (s.includes("un consolidated") || s.includes("consolidated list")) return "UN Consolidated List";
  if (s.includes("targeted financial sanctions") || s.includes("tfs")) return "TFS Alert";
  return "Sanctions Alert";
}
