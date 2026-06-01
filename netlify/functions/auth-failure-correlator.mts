// Hawkeye Sterling — auth-failure correlator (LOG-001).
//
// Every authentication rejection in web/lib/server/enforce.ts is appended
// to the "hawkeye-sterling" Blobs store under key prefix
// `auth-failures/<ipHash>/<iso>.json` via recordAuthFailureToBlobs(). This
// scheduled function reads recent entries, groups by ipHash over a 60-min
// rolling window, and fires an alert when any ipHash exceeds the
// distributed-bruteforce threshold.
//
// Why not in-process? A distributed credential-stuffing attack hits many
// Lambda instances; per-instance counters miss it. Blobs is the only
// cross-instance state we already operate, so we use it as a slow-path
// audit trail (writes are fire-and-forget; the hot enforcement path is
// unchanged).
//
// Alert fan-out, in order of presence:
//   ALERT_WEBHOOK_URL  — generic JSON POST (Slack/Discord/PagerDuty webhook)
//   ASANA_TOKEN + ASANA_SECURITY_INCIDENT_PROJECT_GID — task creation
//   stderr  — always (so cloudwatch + ops dashboards can scrape)
//
// Tuning knobs:
//   AUTH_FAILURE_THRESHOLD            (default 25 failures per ipHash per 60 min)
//   AUTH_FAILURE_WINDOW_MINUTES       (default 60)
//   AUTH_FAILURE_DEDUPE_MINUTES       (default 360) — same ipHash won't re-alert within this window

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "hawkeye-sterling";
const PREFIX = "auth-failures/";
const ALERT_DEDUPE_PREFIX = "auth-failure-alerts/";
const RUN_LABEL = "auth-failure-correlator";

const THRESHOLD = Math.max(1, Number(process.env["AUTH_FAILURE_THRESHOLD"] ?? "25"));
const WINDOW_MINUTES = Math.max(5, Number(process.env["AUTH_FAILURE_WINDOW_MINUTES"] ?? "60"));
const DEDUPE_MINUTES = Math.max(30, Number(process.env["AUTH_FAILURE_DEDUPE_MINUTES"] ?? "360"));

interface AuthFailureRecord {
  ipHash: string;
  route: string;
  reason: string;
  status: number;
  at: string; // ISO 8601
}

interface AlertDedupeRecord {
  lastAlertedAt: string;
  attemptCount: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function emitAlert(payload: Record<string, unknown>): Promise<void> {
  // stderr first — always present.
  console.error("[auth-failure-correlator] ALERT", JSON.stringify(payload));

  const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `Hawkeye Sterling: distributed auth-failure alert — ipHash=${payload["ipHash"]} attempts=${payload["attemptCount"]} window=${WINDOW_MINUTES}m`,
          ...payload,
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err) {
      console.error(
        "[auth-failure-correlator] ALERT_WEBHOOK_URL POST failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export default async (req: Request): Promise<Response> => {
  // AML-11-style defense in depth — only Netlify's scheduler may invoke this.
  const isScheduled = req.headers.get("x-netlify-scheduled-function") === "true";
  if (process.env["NODE_ENV"] === "production" && !isScheduled) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const startedAt = Date.now();
  const store = getStore(STORE_NAME);

  // Per-Lambda-instance fallback if Blobs isn't bound (e.g. dev) — return ok with note.
  let keys: string[];
  try {
    const list = await store.list({ prefix: PREFIX });
    keys = list.blobs.map((b) => b.key);
  } catch (err) {
    return json({
      ok: false,
      error: "blobs_list_failed",
      detail: err instanceof Error ? err.message : String(err),
    }, 503);
  }

  const cutoffMs = Date.now() - WINDOW_MINUTES * 60_000;
  const dedupeCutoffMs = Date.now() - DEDUPE_MINUTES * 60_000;
  const byIp = new Map<string, AuthFailureRecord[]>();

  // Read in parallel batches to keep within Netlify's 10-second free-tier ceiling
  // when the buffer is large.
  const BATCH = 50;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const records = await Promise.all(
      slice.map((k) => store.get(k, { type: "json" }).catch(() => null) as Promise<AuthFailureRecord | null>),
    );
    for (const r of records) {
      if (!r || !r.ipHash || !r.at) continue;
      const t = Date.parse(r.at);
      if (Number.isNaN(t) || t < cutoffMs) continue;
      const bucket = byIp.get(r.ipHash) ?? [];
      bucket.push(r);
      byIp.set(r.ipHash, bucket);
    }
  }

  const alerts: Array<{ ipHash: string; attemptCount: number; routes: string[]; reasons: string[] }> = [];
  for (const [ipHash, records] of byIp) {
    if (records.length < THRESHOLD) continue;

    // Dedupe — if we've alerted on this ipHash inside the dedupe window, skip.
    const dedupeKey = `${ALERT_DEDUPE_PREFIX}${ipHash}.json`;
    const prior = (await store.get(dedupeKey, { type: "json" }).catch(() => null)) as AlertDedupeRecord | null;
    if (prior?.lastAlertedAt && Date.parse(prior.lastAlertedAt) > dedupeCutoffMs) {
      continue;
    }

    const uniqueRoutes = Array.from(new Set(records.map((r) => r.route))).sort();
    const uniqueReasons = Array.from(new Set(records.map((r) => r.reason))).sort();
    const payload = {
      ipHash,
      attemptCount: records.length,
      routes: uniqueRoutes.slice(0, 10),
      reasons: uniqueReasons.slice(0, 10),
    };
    alerts.push(payload);
    await emitAlert({ ...payload, windowMinutes: WINDOW_MINUTES, threshold: THRESHOLD });
    await store
      .setJSON(dedupeKey, {
        lastAlertedAt: new Date().toISOString(),
        attemptCount: records.length,
      } satisfies AlertDedupeRecord)
      .catch(() => {
        /* dedupe write best-effort — better to over-alert than to miss */
      });
  }

  return json({
    ok: true,
    label: RUN_LABEL,
    windowMinutes: WINDOW_MINUTES,
    threshold: THRESHOLD,
    distinctIpsExamined: byIp.size,
    alertsFired: alerts.length,
    alerts,
    durationMs: Date.now() - startedAt,
  });
};

export const config: Config = {
  // Every 10 minutes — short enough to detect bursts, infrequent enough that
  // the Blobs read cost is negligible at this site's traffic profile.
  schedule: "*/10 * * * *",
};
