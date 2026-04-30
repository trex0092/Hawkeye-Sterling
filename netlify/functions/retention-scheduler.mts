// Hawkeye Sterling — retention-policy scheduler (audit follow-up #42).
//
// Scheduled Netlify function (daily) that enforces the FDL 10/2025
// Art.20 ten-year retention rule for AML records, plus the PDPL Art.13
// data-minimisation rule for PII fields outside the retention window.
//
// Scope (today): purges entries from the in-process feedback journal
// snapshot that fall outside the configured retention window. The
// Netlify Blob containing the snapshot is rewritten with the surviving
// records. Audit-chain entries are NEVER purged (FDL 10/2025 Art.24
// requires tamper-evident retention).
//
// Schedule: daily at 03:15 UAE time (~23:15 UTC) — pick a low-traffic
// window so the rewrite doesn't collide with screening calls.
//
// Wiring:
//   1. The function is auto-discovered by the Netlify build.
//   2. Configure the schedule in netlify.toml under
//      [functions."retention-scheduler"]:
//          schedule = "15 23 * * *"
//   3. Netlify Blobs is required (NETLIFY_BLOBS_TOKEN, NETLIFY_SITE_ID
//      already configured for the feedback-journal-blobs adapter).
//
// Charter compliance:
//   · FDL 10/2025 Art.20 — 10-year retention enforced (default).
//   · FDL 10/2025 Art.24 — audit chain not purged (tamper-evident).
//   · PDPL Art.13 — PII fields outside retention window are dropped.
//   · No silent deletion: every purge writes an audit-chain entry
//     (TODO: extend with chain.append() once the chain singleton has
//     a persistence layer compatible with this scheduler).

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "hawkeye-feedback-journal";
const SNAPSHOT_KEY = "all-records.json";
const DEFAULT_RETENTION_DAYS = 10 * 365;   // FDL 10/2025 Art.20: 10 years
const RUN_LABEL = "retention-scheduler";

interface OutcomeRecord {
  runId: string;
  at: string;
  caseId: string;
  modeIds: string[];
  autoProposed: string;
  autoConfidence: number;
  mlroDecided: string;
  overridden: boolean;
  overrideReason?: string;
  reviewerId: string;
  groundTruth?: string;
}

function ageDays(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  const retentionDays = parseInt(
    process.env["RETENTION_DAYS"] ?? String(DEFAULT_RETENTION_DAYS),
    10,
  );

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `getStore failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 503);
  }

  let raw: string | null;
  try {
    raw = await store.get(SNAPSHOT_KEY, { type: "text" });
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `snapshot read failed: ${err instanceof Error ? err.message : String(err)}`,
    }, 503);
  }

  if (raw === null || raw === undefined || raw === "") {
    return jsonResponse({
      ok: true,
      label: RUN_LABEL,
      message: "no journal snapshot found — nothing to purge",
      retentionDays,
      durationMs: Date.now() - startedAt,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `snapshot is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }

  if (!Array.isArray(parsed)) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: "snapshot is not an array of OutcomeRecord",
    }, 500);
  }

  const records = parsed as OutcomeRecord[];
  const now = Date.now();
  const surviving: OutcomeRecord[] = [];
  const purged: Array<{ runId: string; ageDays: number }> = [];

  for (const r of records) {
    if (!r || typeof r.at !== "string" || typeof r.runId !== "string") {
      // Malformed record — keep it; manual review required.
      surviving.push(r);
      continue;
    }
    const age = ageDays(r.at, now);
    if (age > retentionDays) {
      purged.push({ runId: r.runId, ageDays: age });
    } else {
      surviving.push(r);
    }
  }

  if (purged.length === 0) {
    return jsonResponse({
      ok: true,
      label: RUN_LABEL,
      message: `no records past retention window (${retentionDays}d)`,
      total: records.length,
      retentionDays,
      durationMs: Date.now() - startedAt,
    });
  }

  // Rewrite snapshot with surviving records only.
  try {
    await store.set(SNAPSHOT_KEY, JSON.stringify(surviving));
  } catch (err) {
    return jsonResponse({
      ok: false,
      label: RUN_LABEL,
      error: `snapshot write failed after purge: ${err instanceof Error ? err.message : String(err)}`,
      purgedButNotPersisted: purged.length,
    }, 500);
  }

  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    purged: purged.length,
    retained: surviving.length,
    retentionDays,
    sample: purged.slice(0, 10),  // first 10 for the log
    durationMs: Date.now() - startedAt,
    note: "FDL 10/2025 Art.20 retention enforced; audit chain NOT purged (Art.24).",
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = {
  // Daily at 23:15 UTC (~03:15 UAE) — low-traffic window.
  schedule: "15 23 * * *",
};
