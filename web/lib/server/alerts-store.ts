// Server-side alert persistence — hawkeye-alerts Blobs store.
// Dedup: same (listId, sourceRef) within a 1-hour window is merged.
// Redline hints: pre-computed at write time from list→redline map.

import { getStore } from "@netlify/blobs";

const ALERTS_STORE = "hawkeye-alerts";
const MAX_ALERTS = 200;
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface DesignationAlert {
  id: string;
  listId: string;
  listLabel: string;
  matchedEntry: string;
  sourceRef: string;
  severity: "critical" | "high" | "medium";
  detectedAt: string;
  read: boolean;
  firedRedlineId?: string;
  dismissedAt?: string;
  dismissedBy?: string;
}

// Redline pre-compute map (mirrors redlines.js IDs)
const LIST_REDLINE_MAP: Record<string, string> = {
  ofac_sdn:        "rl_ofac_sdn_confirmed",
  un_1267:         "rl_un_consolidated_confirmed",
  eu_consolidated: "rl_eu_cfsp_confirmed",
  uk_ofsi:         "rl_uk_ofsi_confirmed",
  uae_eocn:        "rl_eocn_confirmed",
};

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

// Check if a (listId, sourceRef) pair already has a recent alert (dedup window).
async function findDuplicate(
  store: Awaited<ReturnType<typeof getAlertStore>>,
  idx: AlertIndex,
  listId: string,
  sourceRef: string,
): Promise<string | null> {
  const now = Date.now();
  for (const id of idx.alertIds.slice(0, 50)) { // only scan recent 50
    try {
      const raw = await store.get(alertKey(id), { type: "text" });
      if (!raw) continue;
      const a = JSON.parse(raw) as DesignationAlert;
      if (
        a.listId === listId &&
        a.sourceRef === sourceRef &&
        now - Date.parse(a.detectedAt) < DEDUP_WINDOW_MS
      ) {
        return a.id;
      }
    } catch { /* skip */ }
  }
  return null;
}

export async function writeAlert(alert: DesignationAlert): Promise<void> {
  try {
    const store = await getAlertStore();
    const idx = await loadIndex(store);

    // Dedup check
    const dupId = await findDuplicate(store, idx, alert.listId, alert.sourceRef);
    if (dupId) return; // already have a recent alert for this entity+list

    // Pre-compute which redline this designation would fire
    const redlineId = LIST_REDLINE_MAP[alert.listId];
    const enriched: DesignationAlert = {
      ...alert,
      ...(redlineId !== undefined ? { firedRedlineId: redlineId } : {}),
    };

    if (!idx.alertIds.includes(enriched.id)) {
      idx.alertIds.unshift(enriched.id);
      if (idx.alertIds.length > MAX_ALERTS) {
        const evicted = idx.alertIds.splice(MAX_ALERTS);
        for (const id of evicted) {
          try { await store.delete(alertKey(id)); } catch { /* best effort */ }
        }
      }
      idx.lastUpdated = new Date().toISOString();
      await store.set(INDEX_KEY, JSON.stringify(idx));
    }
    await store.set(alertKey(enriched.id), JSON.stringify(enriched));
  } catch { /* best effort */ }
}

// Demo seed shown when the Blobs store has never been written to (no cron
// has fired yet). Gives operators a realistic view of the bell in action.
// Called as a function so timestamps are fresh on every request — avoids
// the module-load-time stale-timestamp bug where SLA countdowns show BREACHED.
const DISMISSED_DEMO_IDS = new Set<string>();

function getDemoAlerts(): DesignationAlert[] {
  const now = Date.now();
  return [
    {
      id: "demo-001",
      listId: "ofac_sdn",
      listLabel: "OFAC SDN",
      matchedEntry: "Al Rashid Trading LLC",
      sourceRef: "SDN-20240318-UAE",
      severity: "critical",
      detectedAt: new Date(now - 25 * 60_000).toISOString(),
      read: DISMISSED_DEMO_IDS.has("demo-001"),
      firedRedlineId: "rl_ofac_sdn_confirmed",
    },
    {
      id: "demo-002",
      listId: "un_1267",
      listLabel: "UN 1267",
      matchedEntry: "Ibrahim Al-Zawari",
      sourceRef: "QDe.152",
      severity: "critical",
      detectedAt: new Date(now - 2 * 3_600_000).toISOString(),
      read: DISMISSED_DEMO_IDS.has("demo-002"),
      firedRedlineId: "rl_un_consolidated_confirmed",
    },
    {
      id: "demo-003",
      listId: "eu_consolidated",
      listLabel: "EU CFSP",
      matchedEntry: "Meridian Metals FZE",
      sourceRef: "EU-2024/1234",
      severity: "high",
      detectedAt: new Date(now - 6 * 3_600_000).toISOString(),
      read: DISMISSED_DEMO_IDS.has("demo-003"),
      firedRedlineId: "rl_eu_cfsp_confirmed",
    },
    {
      id: "demo-004",
      listId: "uk_ofsi",
      listLabel: "UK OFSI",
      matchedEntry: "Volkov Commodities Ltd",
      sourceRef: "RUS0278",
      severity: "high",
      detectedAt: new Date(now - 18 * 3_600_000).toISOString(),
      read: true,
      firedRedlineId: "rl_uk_ofsi_confirmed",
    },
    {
      id: "demo-005",
      listId: "uae_eocn",
      listLabel: "UAE EOCN",
      matchedEntry: "Gulf Star Jewellery Trading",
      sourceRef: "EOCN-2024-0091",
      severity: "medium",
      detectedAt: new Date(now - 30 * 3_600_000).toISOString(),
      read: true,
      firedRedlineId: "rl_eocn_confirmed",
    },
  ];
}

export { getDemoAlerts };

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
      } catch { /* skip corrupt */ }
    }
    // Fall back to demo seed when store is empty (no cron has fired yet)
    if (results.length === 0) {
      const demos = getDemoAlerts();
      return onlyUnread ? demos.filter((a) => !a.read) : demos;
    }
    return results;
  } catch {
    const demos = getDemoAlerts();
    return onlyUnread ? demos.filter((a) => !a.read) : demos;
  }
}

export async function dismissAlert(id: string, dismissedBy?: string): Promise<boolean> {
  // Demo alerts live only in memory — track dismissals in the module-level set
  if (id.startsWith("demo-")) {
    DISMISSED_DEMO_IDS.add(id);
    return true;
  }
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

export async function dismissAllUnread(dismissedBy?: string): Promise<number> {
  try {
    const store = await getAlertStore();
    const idx = await loadIndex(store);
    let count = 0;
    for (const id of idx.alertIds) {
      try {
        const raw = await store.get(alertKey(id), { type: "text" });
        if (!raw) continue;
        const alert = JSON.parse(raw) as DesignationAlert;
        if (alert.read) continue;
        alert.read = true;
        alert.dismissedAt = new Date().toISOString();
        if (dismissedBy !== undefined) alert.dismissedBy = dismissedBy;
        await store.set(alertKey(id), JSON.stringify(alert));
        count++;
      } catch { /* skip */ }
    }
    return count;
  } catch {
    return 0;
  }
}

export { ALERTS_STORE };
