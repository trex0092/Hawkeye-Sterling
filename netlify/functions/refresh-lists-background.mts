// Hawkeye Sterling — nightly sanctions refresh, background worker.
//
// Netlify BACKGROUND function (the `-background` filename suffix selects the
// 15-minute wall-clock class; Netlify acks the POST with HTTP 202 and runs
// the handler asynchronously). Background functions cannot carry a cron
// schedule themselves — a `schedule` config on a background function deploys
// but never fires — so the 03:00 UTC scheduled trigger lives in
// netlify/functions/refresh-lists.ts and POSTs here.
//
// Why this exists: the scheduled-function class is hard-capped at ~30 s, which
// forces the 20 s per-adapter leash in run-all.ts. The slow government
// endpoints — au_dfat (dfat.gov.au XLSX, several MB, slow origin), ch_seco
// (SESAM generates the XML server-side per request), eu_fsf (multi-MB webgate
// payload) — regularly need more than 20 s, so they timed out on every
// scheduled tick ("adapter au_dfat timed out after 20000ms"). Inside this
// 900 s budget the per-adapter leash is BACKGROUND_ADAPTER_TIMEOUT_MS (60 s):
// adapters fan out in parallel, so worst-case wall-clock is the slowest
// adapter (60 s) plus the parse/write tail — minutes at most, ~10× margin.
// SLA context: list-staleness warning is 36 h; one full-leash pass per day
// keeps the slow trio comfortably fresh, and the HTTP-triggered operator/
// admin refresh routes (45 s leash) remain available intraday.
//
// Auth: same accepted trust posture as refresh-lists.ts — the trigger
// forwards the legacy x-netlify-scheduled-function header; manual operators
// use ADMIN_TOKEN. A forged header only triggers an idempotent,
// lock-protected public-list refresh (no data egress), and the 10-minute
// pipeline lock makes repeated POSTs no-ops.

import type { Config } from "@netlify/functions";
import { runRefreshListsPipeline, isAuthorizedRefreshRequest } from "../lib/refresh-lists-core.js";
import { BACKGROUND_ADAPTER_TIMEOUT_MS } from "../../src/ingestion/run-all.js";

const LABEL = "refresh-lists-background";

export default async (req: Request): Promise<Response> => {
  if (!isAuthorizedRefreshRequest(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  console.info(`[${LABEL}] starting nightly refresh with adapterTimeoutMs=${BACKGROUND_ADAPTER_TIMEOUT_MS}`);
  try {
    const { status, body } = await runRefreshListsPipeline({
      adapterTimeoutMs: BACKGROUND_ADAPTER_TIMEOUT_MS,
      runLabel: LABEL,
    });
    console.info(`[${LABEL}] finished status=${status}`);
    // Background functions already 202'd the caller — this Response is for
    // logs/local invocation only.
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${LABEL}] pipeline failed:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, at: new Date().toISOString() }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
};

// NO schedule here — background functions cannot be scheduled on Netlify.
// The cron lives in refresh-lists.ts, which delegates to this worker.
export const config: Config = {};
