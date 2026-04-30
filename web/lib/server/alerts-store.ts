// Server-side alert persistence. Uses a dedicated "hawkeye-alerts" Blobs
// store (separate from the main hawkeye-sterling store so alert I/O
// doesn't compete with screening data). Mirrors the billing.ts pattern.

import { getStore } from "@netlify/blobs";

const ALERTS_STORE = "hawkeye-alerts";
const MAX_ALERTS = 200;

export interface DesignationAlert {
  id: string;
  listId: string;
  listLabel: string;
  matchedEntry: string;
  sourceRef: string;
  severity: "critical" | "high" | "medium";
  detectedAt: string;
  read: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
}

function alertKey(id: string): string {
  return `alerts/${id}.json`;
}

const INDEX_KEY = "alerts/_index.json";

interface AlertIndex {
  alertIds: string[];
  lastUpdated: string;
}

async function getAlertStore() {
  return getStore(ALERTS_STORE);
}

async function loadIndex(store: Awaited<ReturnType<typeof getAlertStore>>): Promise<AlertIndex> {
  try {
    const raw = await store.get(INDEX_KEY, { type: "text" });
    if (raw) return JSON.parse(raw) as AlertIndex;
  } catch { /* empty */ }
  return { alertIds: [], lastUpdated: new Date().toISOString() };
}

export async function writeAlert(alert: DesignationAlert): Promise<void> {
  try {
    const store = await getAlertStore();
    const idx = await loadIndex(store);
    if (!idx.alertIds.includes(alert.id)) {
      idx.alertIds.unshift(alert.id);
      // Evict oldest beyond cap
      if (idx.alertIds.length > MAX_ALERTS) {
        const evicted = idx.alertIds.splice(MAX_ALERTS);
        for (const id of evicted) {
          try { await store.delete(alertKey(id)); } catch { /* best effort */ }
        }
      }
      idx.lastUpdated = new Date().toISOString();
      await store.set(INDEX_KEY, JSON.stringify(idx));
    }
    await store.set(alertKey(alert.id), JSON.stringify(alert));
  } catch { /* best effort — alert IO must not break callers */ }
}

export async function listAlerts(onlyUnread = false): Promise<DesignationAlert[]> {
  try {
    const store = await getAlertStore();
    const idx = await loadIndex(store);
    const results: DesignationAlert[] = [];
    for (const id of idx.alertIds) {
      try {
        const raw = await store.get(alertKey(id), { type: "text" });
        if (!raw) continue;
        const alert = JSON.parse(raw) as DesignationAlert;
        if (onlyUnread && alert.read) continue;
        results.push(alert);
      } catch { /* skip corrupt entry */ }
    }
    return results;
  } catch {
    return [];
  }
}

export async function dismissAlert(id: string, dismissedBy?: string): Promise<boolean> {
  try {
    const store = await getAlertStore();
    const raw = await store.get(alertKey(id), { type: "text" });
    if (!raw) return false;
    const alert = JSON.parse(raw) as DesignationAlert;
    alert.read = true;
    alert.dismissedAt = new Date().toISOString();
    if (dismissedBy !== undefined) alert.dismissedBy = dismissedBy;
    await store.set(alertKey(id), JSON.stringify(alert));
    return true;
  } catch {
    return false;
  }
}

export { ALERTS_STORE };
