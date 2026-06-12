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
// scheduled tick ("adapter au_dfat timed out after 20000ms").
//
// THIS WORKER IS THE GUARANTEED REFRESH PATH FOR THE HEAVY ADAPTERS
// (HEAVY_ADAPTER_IDS: au_dfat, ch_seco, jp_mof). Inside the 900 s budget:
//   · tier 1 (light adapters) fans out in parallel under
//     BACKGROUND_ADAPTER_TIMEOUT_MS (60 s) — worst case the slowest light
//     adapter plus the write tail;
//   · tier 2 (heavy adapters) then runs strictly sequentially under
//     BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS (120 s each), sized for au_dfat's
//     40 s download + ~60 s event-loop-blocking exceljs parse. Sequencing
//     keeps the parse from freezing other adapters' leash timers (the
//     2026-06-12 production incident).
// Worst case: 60 s + 3 × 120 s + write tail ≈ 8 min, inside the 900 s
// ceiling with margin. SLA context: list-staleness warning is 36 h; one
// full-budget pass per day keeps the heavy trio comfortably fresh, and the
// HTTP-triggered operator/admin refresh routes run the same two-tier shape
// intraday on a best-effort basis.
//
// Auth: same accepted trust posture as refresh-lists.ts — the trigger
// forwards the legacy x-netlify-scheduled-function header; manual operators
// use ADMIN_TOKEN. A forged header only triggers an idempotent,
// lock-protected public-list refresh (no data egress), and the 10-minute
// pipeline lock makes repeated POSTs no-ops.

import type { Config } from "@netlify/functions";
import { runRefreshListsPipeline, isAuthorizedRefreshRequest } from "../lib/refresh-lists-core.js";
import {
  BACKGROUND_ADAPTER_TIMEOUT_MS,
  BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS,
} from "../../src/ingestion/run-all.js";

const LABEL = "refresh-lists-background";

export default async (req: Request): Promise<Response> => {
  if (!isAuthorizedRefreshRequest(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  console.info(
    `[${LABEL}] starting nightly refresh with adapterTimeoutMs=${BACKGROUND_ADAPTER_TIMEOUT_MS} ` +
    `heavyAdapterTimeoutMs=${BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS}`,
  );
  try {
    const { status, body } = await runRefreshListsPipeline({
      adapterTimeoutMs: BACKGROUND_ADAPTER_TIMEOUT_MS,
      heavyAdapterTimeoutMs: BACKGROUND_HEAVY_ADAPTER_TIMEOUT_MS,
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
