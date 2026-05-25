// Hawkeye Sterling — OpenSanctions per-dataset refresher.
//
// Scheduled Netlify Function that pulls every configured OpenSanctions
// dataset (default: `ae_local_terrorists`, overridable via the
// OPENSANCTIONS_DATASETS env var as comma-separated dataset IDs),
// normalises into the OpenSanctionsRecord shape, merges by id, and
// writes the consolidated array to the `hawkeye-opensanctions` Netlify
// Blobs store under `sanctions.json`.
//
// The Next.js adapter (web/lib/intelligence/openSanctions.ts) reads from
// the same blob key on first lookup per warm Lambda — so this scheduled
// function is the operator-free "keep the corpus fresh" mechanism.
//
// Schedule: weekly on Sunday 02:30 UTC. Each dataset is small (kilobytes
// to a few MB) so total wall-clock is ~10-30s, well inside the 60s
// Netlify Function default limit.
//
// Auth: when invoked via HTTP (not scheduled), requires Bearer
// HAWKEYE_CRON_TOKEN. The scheduled invocation runs without an
// Authorization header and is allowed through automatically.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import {
  refreshOpenSanctionsBlob,
  type RefreshResult,
} from "../../web/lib/intelligence/opensanctions-datasets.js";
import { writeHeartbeat } from "../lib/heartbeat.js";

const LABEL = "opensanctions-refresh";
const LOCK_TTL_MS = 10 * 60 * 1000;

export default async (req: Request): Promise<Response> => {
  // Netlify scheduler sets x-nf-event: schedule; HTTP callers must authenticate.
  // Defense-in-depth: x-nf-event is technically forgeable as a plain header.
  // If a claimed scheduled event also carries an Authorization header, verify it —
  // a genuine Netlify scheduler invocation never sends Authorization.
  const expected = process.env["HAWKEYE_CRON_TOKEN"];
  const authHeader = req.headers.get("authorization");
  const supplied = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected && supplied !== expected) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // Idempotency lock — prevents concurrent runs under Lambda warm-instance overlap.
  const hbStore = getStore("hawkeye-function-heartbeats");
  const existingLock = await hbStore.get(`${LABEL}/lock`, { type: "json" }).catch(() => null) as { lockedAt: string } | null;
  if (existingLock) {
    const lockAge = Date.now() - new Date(existingLock.lockedAt).getTime();
    if (lockAge < LOCK_TTL_MS) {
      console.info(`[${LABEL}] already running (lock age ${Math.round(lockAge / 1000)}s) — skipping`);
      return json({ ok: true, skipped: true, reason: "lock_active", lockAgeMs: lockAge }, 200);
    }
  }
  await hbStore.setJSON(`${LABEL}/lock`, { lockedAt: new Date().toISOString() }).catch(() => undefined);

  try {
    const result: RefreshResult = await refreshOpenSanctionsBlob();
    if (result.ok) await writeHeartbeat(LABEL);
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    return json(
      {
        ok: false,
        error: `opensanctions-refresh threw — ${err instanceof Error ? err.message : String(err)}`,
        at: new Date().toISOString(),
      },
      500,
    );
  } finally {
    await hbStore.delete(`${LABEL}/lock`).catch(() => undefined);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  // Weekly: Sunday 02:30 UTC. OpenSanctions updates daily so weekly is
  // sufficient for AML-grade freshness; high-risk lists (UN, OFAC, EU,
  // UK) are already refreshed independently every 4h by sanctions-ingest.
  schedule: "30 2 * * 0",
};
