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
import {
  refreshOpenSanctionsBlob,
  type RefreshResult,
} from "../../web/lib/intelligence/opensanctions-datasets.js";

export default async (req: Request): Promise<Response> => {
  const auth = req.headers.get("authorization");
  if (auth !== null) {
    const expected = process.env["HAWKEYE_CRON_TOKEN"];
    if (!expected) {
      return json({ ok: false, error: "HAWKEYE_CRON_TOKEN not configured — refused" }, 503);
    }
    const supplied = auth.replace(/^Bearer\s+/i, "").trim();
    if (supplied !== expected) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
  }

  try {
    const result: RefreshResult = await refreshOpenSanctionsBlob();
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
