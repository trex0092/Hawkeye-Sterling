// Hawkeye Sterling — designation alert checker (hourly).
//
// Runs every hour. Scans the hawkeye-sanctions-feeds store for delta
// entries written in the past 2 hours, and for each new designation
// entry POSTs a DesignationAlert to /api/alerts so the bell icon in
// the Header shows live. Each alert represents a new or modified
// entry on a major sanctions list (OFAC SDN, UN 1267, EU, UK OFSI).
//
// The alert is generic (not matched against the user's local subjects —
// that cross-reference happens client-side in useAlerts). The MLRO
// can see new designations as they land and proactively screen.
//
// Schedule: hourly at :10 (UTC) — staggered so it always runs after
// the sanctions ingest (which lands at :07), ensuring fresh data is present.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const RETRY_STORE = "hawkeye-alert-retry";
const RETRY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // drop retries older than 24 h

interface AlertPayload {
  id: string;
  listId: string;
  listLabel: string;
  matchedEntry: string;
  sourceRef: string;
  severity: string;
  detectedAt: string;
  read: boolean;
  queuedAt?: string;
}

async function saveRetry(alertId: string, payload: AlertPayload): Promise<void> {
  try {
    const store = getStore(RETRY_STORE);
    await store.set(`retry/${alertId}.json`, JSON.stringify({ ...payload, queuedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn(`[designation-alert-check] retry save failed for ${alertId}:`, err instanceof Error ? err.message : String(err));
  }
}

async function replayRetries(base: string, token: string): Promise<{ replayed: number; stillFailed: number }> {
  let replayed = 0;
  let stillFailed = 0;
  try {
    const store = getStore(RETRY_STORE);
    const list = await store.list({ prefix: "retry/" });
    const now = Date.now();
    for (const blob of list.blobs) {
      try {
        const raw = await store.get(blob.key, { type: "text" });
        if (!raw) { await store.delete(blob.key).catch(() => {}); continue; }
        const payload = JSON.parse(raw) as AlertPayload;
        // Drop stale retries that are too old to be useful.
        if (payload.queuedAt && now - new Date(payload.queuedAt).getTime() > RETRY_MAX_AGE_MS) {
          await store.delete(blob.key).catch(() => {});
          continue;
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20_000);
        try {
          const res = await fetch(`${base}/api/alerts`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          if (res.ok) {
            await store.delete(blob.key).catch(() => {});
            replayed++;
          } else {
            stillFailed++;
          }
        } catch { stillFailed++; }
        finally { clearTimeout(t); }
      } catch { stillFailed++; }
    }
  } catch (err) {
    console.warn("[designation-alert-check] retry replay failed:", err instanceof Error ? err.message : String(err));
  }
  return { replayed, stillFailed };
}

async function writeHeartbeat(): Promise<void> {
  try {
    const hb = getStore("hawkeye-function-heartbeats");
    await hb.setJSON("designation-alert-check", {
      lastSuccess: new Date().toISOString(),
      label: "designation-alert-check",
    });
  } catch (err) {
    console.warn("[designation-alert-check] heartbeat write failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

const SANCTIONS_STORE = "hawkeye-sanctions-feeds";
const FETCH_TIMEOUT_MS = 20_000;

// Load monitored subject names from the case vault index (portal tenant).
// Returns lowercase names for case-insensitive matching. Best-effort: returns
// empty set on any error rather than blocking alert posting.
async function loadMonitoredSubjects(): Promise<Set<string>> {
  try {
    const store = getStore("hawkeye-sterling");
    const raw = await store.get("hawkeye-cases/portal/_index.json", { type: "text" });
    if (!raw) return new Set();
    const idx = JSON.parse(raw) as { entries?: Array<{ subject?: string }> };
    if (!Array.isArray(idx.entries)) return new Set();
    return new Set(
      idx.entries
        .map((e) => (typeof e.subject === "string" ? e.subject.toLowerCase().trim() : ""))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function matchesPortfolio(designationName: string, portfolio: Set<string>): boolean {
  if (portfolio.size === 0) return false;
  const dn = designationName.toLowerCase().trim();
  for (const sub of portfolio) {
    if (sub.length < 4) continue; // skip very short names to avoid false positives
    if (dn.includes(sub) || sub.includes(dn)) return true;
  }
  return false;
}

interface NormalisedListEntry {
  listId: string;
  sourceRef: string;
  primaryName: string;
  entityType: string;
  programs: string[];
  aliases: string[];
  addedAt?: string;
  publishedAt?: string;
}

interface DeltaArtifact {
  listId: string;
  computedAt: string;
  added: NormalisedListEntry[];
  removed: NormalisedListEntry[];
  changed: NormalisedListEntry[];
}

const LIST_LABELS: Record<string, string> = {
  ofac_sdn:       "OFAC SDN",
  un_1267:        "UN 1267",
  eu_consolidated: "EU Consolidated",
  uk_ofsi:        "UK OFSI",
  uae_eocn:       "UAE EOCN",
};

function severity(listId: string): "critical" | "high" | "medium" {
  if (listId === "ofac_sdn" || listId === "un_1267") return "critical";
  if (listId === "eu_consolidated" || listId === "uk_ofsi") return "high";
  return "medium";
}

export default async (_req: Request): Promise<Response> => {
  const base =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";
  const token = process.env["ALERTS_CRON_TOKEN"];

  // ALERTS_CRON_TOKEN is required: without it every POST to /api/alerts
  // returns 401/503 and the MLRO bell icon never shows new designations.
  // Fail loudly so Netlify function logs surface the missing env var.
  if (!token) {
    console.error("[designation-alert-check] ALERTS_CRON_TOKEN not set — bell alerts will NOT fire. Set this env var in Netlify dashboard.");
    return new Response(
      JSON.stringify({ ok: false, error: "ALERTS_CRON_TOKEN not configured", at: new Date().toISOString() }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  // Replay any previously-failed alert posts before processing new deltas.
  const retryResult = await replayRetries(base, token);
  if (retryResult.replayed > 0) {
    console.info(`[designation-alert-check] replayed ${retryResult.replayed} queued alert(s)`);
  }

  // Load monitored subjects for portfolio cross-reference (best-effort).
  const portfolio = await loadMonitoredSubjects();

  let alertsWritten = 0;
  let errors = 0;

  try {
    const store = getStore(SANCTIONS_STORE);
    const result = await store.list({ prefix: "delta/" });
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    const recentKeys = result.blobs.filter((b) => {
      // Key format: delta/<listId>-<isoTimestamp>.json
      const parts = b.key.replace("delta/", "").replace(".json", "").split("-");
      const ts = parts.slice(1).join("-");
      if (!ts) return false;
      const t = Date.parse(ts);
      return !isNaN(t) && t >= twoHoursAgo;
    });

    for (const blob of recentKeys) {
      try {
        const raw = await store.get(blob.key, { type: "text" });
        if (!raw) continue;
        const delta = JSON.parse(raw) as DeltaArtifact;
        const newEntries = [...(delta.added ?? [])];

        for (const entry of newEntries.slice(0, 10)) { // cap per delta
          const alertId = `${delta.listId}-${entry.sourceRef}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, "_");
          const inPortfolio = matchesPortfolio(entry.primaryName, portfolio);
          const alertPayload: AlertPayload = {
            id: alertId,
            listId: delta.listId,
            listLabel: LIST_LABELS[delta.listId] ?? delta.listId,
            matchedEntry: entry.primaryName,
            sourceRef: entry.sourceRef,
            // Escalate to critical when designation matches a monitored subject.
            severity: inPortfolio ? "critical" : severity(delta.listId),
            detectedAt: delta.computedAt ?? new Date().toISOString(),
            read: false,
          };
          const ctrl = new AbortController();
          const deadline = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          try {
            const res = await fetch(`${base}/api/alerts`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(alertPayload),
              signal: ctrl.signal,
            });
            if (res.ok) {
              alertsWritten++;
            } else {
              errors++;
              console.warn(`[designation-alert-check] /api/alerts POST returned ${res.status} for ${alertId} — queuing for retry`);
              await saveRetry(alertId, alertPayload);
            }
          } catch {
            errors++;
            await saveRetry(alertId, alertPayload);
          }
          finally { clearTimeout(deadline); }
        }
      } catch { errors++; }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err), at: new Date().toISOString() }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  await writeHeartbeat();
  return new Response(
    JSON.stringify({ ok: true, alertsWritten, errors, retryReplayed: retryResult.replayed, retryStillFailed: retryResult.stillFailed, at: new Date().toISOString() }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

export const config: Config = { schedule: "10 * * * *" };
