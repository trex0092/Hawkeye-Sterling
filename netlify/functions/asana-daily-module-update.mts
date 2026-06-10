// Netlify Scheduled Function — daily Asana module compliance attestation.
//
// Once a day, self-POSTs to /api/asana-daily-module-update, which posts a
// "daily compliance attestation" comment to every task on the
// "Hawkeye Sterling — Modules" Asana board (one task per module).
//
// Keeps the cron a dumb tickler — all Asana logic lives in the API route
// (one place, covered by the same env gate). No-op (logs) when the
// HAWKEYE_CRON_TOKEN / ASANA_TOKEN env vars are unset.
//
// Schedule: 05:30 UTC Mon-Fri = 09:30 Asia/Dubai on business days —
// operator-instructed (2026-06-10, CCL-2026-023): attestations with the
// status-card graphic land at the start of each UAE working day. Weekend
// runs intentionally ceased per the same instruction.
//
// Auth: HAWKEYE_CRON_TOKEN — the shared server-to-server cron bearer
// already used by the other scheduled functions (e.g. freeze-sla-monitor),
// so no new env var is needed.

import type { Config } from "@netlify/functions";

export default async (_req: Request): Promise<Response> => {
  const token = process.env["HAWKEYE_CRON_TOKEN"];
  const base =
    process.env["URL"] ?? process.env["DEPLOY_PRIME_URL"] ?? "https://hawkeye-sterling.netlify.app";

  if (!token) {
    console.warn("[asana-daily] HAWKEYE_CRON_TOKEN unset — skipping daily module attestation.");
    return new Response("skipped: no cron token", { status: 200 });
  }

  // 2026-06-10 workspace rebuild: the route now fans each module's
  // attestation out to its own board AND the digest (88 modules × 2 posts).
  // Drive it in 4 sequential slices of 22 modules so every API call stays
  // well inside the route budget; this function's own timeout is raised to
  // 300s in netlify.toml ([functions."asana-daily-module-update"]).
  const SLICE = 22;
  const TOTAL = 88;
  let posted = 0;
  let failedCount = 0;
  for (let offset = 0; offset < TOTAL; offset += SLICE) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch(`${base}/api/asana-daily-module-update`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ offset, limit: SLICE }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({})) as { posted?: number; failedCount?: number };
      posted += body.posted ?? 0;
      failedCount += body.failedCount ?? 0;
      console.info("[asana-daily] slice:", offset, res.status, JSON.stringify(body));
    } catch (err) {
      // Always continue — a failed slice must not abort the remaining
      // modules' attestations; it logs and the next day retries everything.
      failedCount++;
      console.error("[asana-daily] slice failed:", offset, err instanceof Error ? err.message : String(err));
    }
  }
  console.info("[asana-daily] done — posted:", posted, "failed:", failedCount);
  return new Response("ok", { status: 200 });
};

export const config: Config = {
  schedule: "30 5 * * 1-5",
};
