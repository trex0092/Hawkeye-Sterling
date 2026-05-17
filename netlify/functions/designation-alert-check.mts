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
          const ctrl = new AbortController();
          const deadline = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          try {
            const res = await fetch(`${base}/api/alerts`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                id: alertId,
                listId: delta.listId,
                listLabel: LIST_LABELS[delta.listId] ?? delta.listId,
                matchedEntry: entry.primaryName,
                sourceRef: entry.sourceRef,
                severity: severity(delta.listId),
                detectedAt: delta.computedAt ?? new Date().toISOString(),
                read: false,
              }),
              signal: ctrl.signal,
            });
            if (res.ok) {
              alertsWritten++;
            } else {
              errors++;
              console.warn(`[designation-alert-check] /api/alerts POST returned ${res.status} for ${alertId}`);
            }
          } catch { errors++; }
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
    JSON.stringify({ ok: true, alertsWritten, errors, at: new Date().toISOString() }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

export const config: Config = { schedule: "10 * * * *" };
